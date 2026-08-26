"""Adaptador Garmin Connect — no oficial. Ver plan, Fase 1 y riesgos #1/#4.

`garminconnect` (cyberjunky) v0.3.11+ maneja login/refresh/persistencia de
token internamente: `client.login(tokenstore)` intenta cargar el token
guardado, lo refresca si está por vencer, y si no hay uno válido hace login
con credenciales y lo persiste — todo en una llamada. El rate limit de
Garmin es por clientId+email en el LOGIN, no en las lecturas: por eso
logueamos una sola vez y confiamos en el token persistido de ahí en más.

Los nombres de campo de las respuestas (`totalSteps`, `hrvSummary`, etc.)
son el JSON crudo de Garmin — no tienen schema propio ni están
documentados oficialmente. `_get` los busca con fallbacks y nunca revienta
el sync por un campo que cambió de nombre; si `fetch_day` no encuentra un
campo, confirmá el nombre real contra una respuesta viva (`client.get_stats(...)`
en un REPL) y agregalo a la lista de fallbacks.
"""

import os
from datetime import date
from pathlib import Path
from typing import Any

from garminconnect import Garmin

from vitacora_sync.metrics import is_plausible_heart_rate
from vitacora_sync.readings import Reading

DEFAULT_TOKENSTORE = str(Path.home() / ".garminconnect")


def login(
    email: str | None = None,
    password: str | None = None,
    tokenstore: str = DEFAULT_TOKENSTORE,
) -> Garmin:
    client = Garmin(
        email=email or os.environ["GARMIN_EMAIL"],
        password=password or os.environ["GARMIN_PASSWORD"],
        prompt_mfa=lambda: input("Código MFA de Garmin: "),
    )
    client.login(tokenstore)
    return client


def _get(d: dict[str, Any] | None, *path: str, default: Any = None) -> Any:
    """Camina un path de keys anidadas; devuelve `default` ante cualquier
    dict vacío/campo ausente en vez de lanzar KeyError."""
    current: Any = d or {}
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current if current is not None else default


def fetch_day(client: Garmin, day: date) -> list[Reading]:
    """Métricas diarias de bienestar de un día puntual.

    Actividades e intradiarios quedan afuera a propósito: eso entra por
    el export GDPR + FIT (ver plan, Fase 1 paso 1), no por este
    adaptador en vivo."""
    cdate = day.isoformat()
    readings: list[Reading] = []

    stats = client.get_stats(cdate)
    steps = _get(stats, "totalSteps")
    if steps is not None:
        readings.append(Reading(day, "steps", "garmin", float(steps), "count"))

    rhr = client.get_rhr_day(cdate)
    resting_hr = _get(rhr, "restingHeartRate") or _get(
        rhr, "allMetrics", "metricsMap", "WELLNESS_RESTING_HEART_RATE", 0, "value"
    )
    if resting_hr is not None and is_plausible_heart_rate(float(resting_hr)):
        readings.append(Reading(day, "resting_hr", "garmin", float(resting_hr), "bpm"))

    hrv = client.get_hrv_data(cdate)
    hrv_value = _get(hrv, "hrvSummary", "lastNightAvg") or _get(hrv, "hrvSummary", "weeklyAvg")
    if hrv_value is not None:
        readings.append(Reading(day, "hrv", "garmin", float(hrv_value), "ms"))

    spo2 = client.get_spo2_data(cdate)
    spo2_value = _get(spo2, "averageSpO2") or _get(spo2, "lastSevenDaysAvgSpO2")
    if spo2_value is not None:
        readings.append(Reading(day, "spo2", "garmin", float(spo2_value), "pct"))

    battery = client.get_body_battery(cdate)
    if battery:
        latest = battery[-1] if isinstance(battery, list) else battery
        bb_value = _get(latest, "charged") if isinstance(latest, dict) else None
        if bb_value is not None:
            readings.append(Reading(day, "body_battery", "garmin", float(bb_value), "score"))

    sleep = client.get_sleep_data(cdate)
    sleep_score = _get(sleep, "dailySleepDTO", "sleepScores", "overall", "value")
    if sleep_score is not None:
        readings.append(Reading(day, "sleep_score", "garmin", float(sleep_score), "score"))

    return readings
