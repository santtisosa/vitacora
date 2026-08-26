"""Tests del motor de métricas determinista.

Estos son los tests que importan de todo el proyecto: si esta matemática
está mal, el dashboard miente y el LLM narra la mentira con confianza.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from vitacora_sync.metrics import (
    Baseline,
    attribute_sleep_date,
    directional_z,
    ewma,
    is_plausible_heart_rate,
    is_plausible_kcal_per_km,
    is_plausible_weight_delta_kg,
    personal_baseline,
    quarantine_partial_today,
    renormalize_weights,
    rolling_vs_baseline,
    should_display,
)


def test_quarantine_excludes_today_but_keeps_earlier_days():
    # Arrange
    today = date(2026, 8, 25)
    values = {date(2026, 8, 23): 70.0, date(2026, 8, 24): 71.0, today: 999.0}

    # Act
    result = quarantine_partial_today(values, today)

    # Assert
    assert today not in result
    assert result == {date(2026, 8, 23): 70.0, date(2026, 8, 24): 71.0}


def test_ewma_smooths_toward_new_readings_without_overreacting():
    # Arrange
    values = [70.0, 72.0, 70.0]

    # Act
    result = ewma(values, alpha=0.1)

    # Assert: primer valor es el ancla, después se mueve poco a poco
    assert result[0] == 70.0
    assert 70.0 < result[1] <= 70.2  # 0.1*72 + 0.9*70 = 70.2
    assert result[2] < result[1]  # vuelve a bajar hacia 70


def test_ewma_carries_last_smoothed_value_across_a_missing_day():
    # Arrange: falta una lectura de báscula en el medio
    values = [70.0, None, 74.0]

    # Act
    result = ewma(values, alpha=0.5)

    # Assert: el hueco no rompe la serie, repite el último suavizado
    assert result[1] == result[0]
    assert result[2] != result[1]


def test_personal_baseline_returns_none_when_no_data():
    # Arrange / Act
    result = personal_baseline([], window_days=60)

    # Assert
    assert result is None


def test_personal_baseline_uses_only_last_window_days_and_ignores_nulls():
    # Arrange: 60 días de 50.0 seguidos de 3 días de 100.0, ventana de 3
    values = [50.0] * 60 + [None, 100.0, 100.0]

    # Act
    result = personal_baseline(values, window_days=3)

    # Assert
    assert result.n == 2
    assert result.mean == 100.0


def test_directional_z_is_zero_when_baseline_has_no_spread():
    # Arrange: baseline sin desviación (todos los días iguales)
    baseline = Baseline(mean=60.0, std=0.0, n=30)

    # Act
    z = directional_z(65.0, baseline)

    # Assert: no divide por cero, no inventa una señal de un dato constante
    assert z == 0.0


def test_directional_z_clips_extreme_outliers():
    # Arrange
    baseline = Baseline(mean=50.0, std=1.0, n=30)

    # Act
    z = directional_z(1000.0, baseline, clip=3.0)

    # Assert
    assert z == 3.0


def test_should_display_suppresses_noise_below_threshold():
    # Arrange / Act / Assert
    assert should_display(0.3) is False
    assert should_display(0.5) is True
    assert should_display(-2.0) is True


def test_rolling_vs_baseline_delta_pct_none_when_no_long_window_data():
    # Arrange: solo hay datos recientes, nada para armar el baseline largo
    values = [None] * 50 + [80.0] * 14

    # Act
    result = rolling_vs_baseline(values, short_days=14, long_days=60)

    # Assert
    assert result.recent == 80.0
    assert result.baseline == 80.0  # los mismos 14 caen dentro de la ventana de 60
    assert result.delta_pct == 0.0


def test_rolling_vs_baseline_computes_delta_pct_oura_style():
    # Arrange: baseline de 60 días en 50, últimos 14 días subieron a 55
    values = [50.0] * 46 + [55.0] * 14

    # Act
    result = rolling_vs_baseline(values, short_days=14, long_days=60)

    # Assert
    assert result.recent == 55.0
    assert round(result.delta_pct, 1) == round((55.0 - result.baseline) / result.baseline * 100, 1)


def test_attribute_sleep_date_uses_wake_time_not_bedtime():
    # Arrange: se durmió 23/08 tarde, se despertó 24/08 temprano en Argentina
    tz = ZoneInfo("America/Argentina/Buenos_Aires")
    end_utc = datetime(2026, 8, 24, 10, 30, tzinfo=timezone.utc)  # 07:30 ART

    # Act
    attributed = attribute_sleep_date(end_utc, tz)

    # Assert: el sueño se cuenta para el día en que se despertó
    assert attributed == date(2026, 8, 24)


def test_renormalize_weights_redistributes_over_available_metrics():
    # Arrange: falta HRV (ej. no sincronizó hoy), quedan RHR y sleep
    weights = {"hrv": 0.40, "resting_hr": 0.25, "sleep": 0.20, "strain": 0.10, "rr": 0.05}
    available = {"resting_hr", "sleep", "strain", "rr"}

    # Act
    result = renormalize_weights(weights, available)

    # Assert: sigue sumando 1.0 y no incluye la métrica ausente
    assert "hrv" not in result
    assert round(sum(result.values()), 6) == 1.0


def test_renormalize_weights_empty_when_nothing_available():
    # Arrange / Act
    result = renormalize_weights({"hrv": 1.0}, available=set())

    # Assert: no explota con división por cero
    assert result == {}


def test_is_plausible_kcal_per_km_rejects_garbage_wearable_reading():
    # Arrange: caso real documentado -- 1740 kcal reportadas para 7km
    # Act / Assert
    assert is_plausible_kcal_per_km(distance_km=7.0, kcal=1740.0) is False
    assert is_plausible_kcal_per_km(distance_km=7.0, kcal=420.0) is True


def test_is_plausible_heart_rate_rejects_sensor_glitch_values():
    assert is_plausible_heart_rate(0) is False
    assert is_plausible_heart_rate(300) is False
    assert is_plausible_heart_rate(62) is True


def test_is_plausible_weight_delta_rejects_scale_error():
    assert is_plausible_weight_delta_kg(3.5) is False
    assert is_plausible_weight_delta_kg(-0.4) is True
