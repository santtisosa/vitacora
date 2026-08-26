"""Motor de métricas determinista.

Todo lo que el LLM va a narrar se calcula acá, en Python puro y testeado.
Está medido que un LLM haciendo la matemática sobre series crudas acierta
~22%; narrando estadísticas precomputadas, ~84%. El LLM nunca calcula
nada — ver plan, Fase 3 y Fase 6.
"""

from dataclasses import dataclass
from datetime import date, datetime
from statistics import mean, pstdev
from zoneinfo import ZoneInfo

MIN_MEANINGFUL_Z = 0.5  # cambio mínimo relevante: por debajo, es ruido
Z_CLIP = 3.0


@dataclass(frozen=True)
class Baseline:
    mean: float
    std: float
    n: int


@dataclass(frozen=True)
class RollingComparison:
    recent: float | None
    baseline: float | None
    delta_pct: float | None


def is_complete_day(local_date: date, today: date) -> bool:
    """Cuarentena del día parcial: hoy no cuenta para estadísticas hasta
    que cierre. Promediar el día de hoy como si estuviera completo es
    el bug que se manda sin darse cuenta."""
    return local_date < today


def quarantine_partial_today(
    values: dict[date, float | None], today: date
) -> dict[date, float | None]:
    return {d: v for d, v in values.items() if is_complete_day(d, today)}


def ewma(values: list[float | None], alpha: float = 0.1) -> list[float | None]:
    """Media móvil exponencial. alpha=0.1 ~= media móvil de 20 días —
    la diferencia entre "subiste 900g" (agua) y una señal usable.
    Un hueco (None) no rompe la serie: repite el último suavizado."""
    result: list[float | None] = []
    smoothed: float | None = None
    for v in values:
        if v is None:
            result.append(smoothed)
            continue
        smoothed = v if smoothed is None else alpha * v + (1 - alpha) * smoothed
        result.append(smoothed)
    return result


def personal_baseline(values: list[float | None], window_days: int = 60) -> Baseline | None:
    """Baseline personal sobre los últimos `window_days` valores no nulos.
    None si no hay ningún dato: no existe un baseline razonable de 0."""
    sample = [v for v in values[-window_days:] if v is not None]
    if not sample:
        return None
    std = pstdev(sample) if len(sample) > 1 else 0.0
    return Baseline(mean=mean(sample), std=std, n=len(sample))


def directional_z(value: float, baseline: Baseline, clip: float = Z_CLIP) -> float:
    """Z-score direccional, clipeado a +-clip. std=0 (serie constante)
    da 0.0 en vez de dividir por cero o inventar una señal."""
    if baseline.std == 0:
        return 0.0
    z = (value - baseline.mean) / baseline.std
    return max(-clip, min(clip, z))


def should_display(z: float, threshold: float = MIN_MEANINGFUL_Z) -> bool:
    """Suprime el display cuando |z| < threshold. No todo movimiento es
    una señal; mostrar ruido como insight es lo que vuelve genérico a
    un dashboard de salud."""
    return abs(z) >= threshold


def rolling_vs_baseline(
    values: list[float | None], short_days: int = 14, long_days: int = 60
) -> RollingComparison:
    """La mecánica "Balance" de Oura: media reciente contra tu propia
    media de más largo plazo. delta_pct=None si no hay baseline (evita
    división por cero cuando el baseline da 0)."""
    recent_sample = [v for v in values[-short_days:] if v is not None]
    baseline_sample = [v for v in values[-long_days:] if v is not None]
    recent = mean(recent_sample) if recent_sample else None
    baseline = mean(baseline_sample) if baseline_sample else None
    delta_pct = None
    if recent is not None and baseline:
        delta_pct = (recent - baseline) / baseline * 100
    return RollingComparison(recent=recent, baseline=baseline, delta_pct=delta_pct)


def attribute_sleep_date(end_utc: datetime, local_tz: ZoneInfo) -> date:
    """El sueño cruza medianoche. Regla explícita: se atribuye a la
    fecha local en que el usuario se DESPERTÓ, no en la que se durmió."""
    return end_utc.astimezone(local_tz).date()


def renormalize_weights(weights: dict[str, float], available: set[str]) -> dict[str, float]:
    """Cuando falta una métrica (ej. sin HRV ese día), los pesos de las
    que quedan se renormalizan para seguir sumando 1.0, en vez de
    devolver un score artificialmente bajo por datos ausentes."""
    subset = {k: w for k, w in weights.items() if k in available}
    total = sum(subset.values())
    if total == 0:
        return {}
    return {k: w / total for k, w in subset.items()}


def is_plausible_kcal_per_km(
    distance_km: float, kcal: float, max_kcal_per_km: float = 150.0
) -> bool:
    """Cota de sanidad antes de que un dato entre a la DB. Caso real
    documentado: un wearable reportó 1740 kcal para 7km (248 kcal/km)
    y una IA coacheó encima con total confianza."""
    if distance_km <= 0:
        return kcal == 0
    return 0 <= (kcal / distance_km) <= max_kcal_per_km


def is_plausible_heart_rate(bpm: float) -> bool:
    return 30 <= bpm <= 220


def is_plausible_weight_delta_kg(delta_kg: float, max_daily_delta_kg: float = 2.0) -> bool:
    """Un delta de peso día a día >2kg es agua o error de báscula, no
    una medición real de masa corporal."""
    return abs(delta_kg) <= max_daily_delta_kg
