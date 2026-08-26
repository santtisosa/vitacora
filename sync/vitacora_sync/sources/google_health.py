"""Adaptador Google Health API — reemplaza la Fitbit Web API, que muere en
septiembre 2026 (ver plan, Fase 2). La báscula Aria Air llega acá como
`weight` y `body-fat`. También se trae `steps` y `daily-resting-heart-rate`
para poder reconciliar contra Garmin: eso es el diferencial del producto,
no un extra.

Los nombres de path y de campo (`weight`, `weightGrams`, `steps.count`,
`bodyFat.percentage`, `dailyRestingHeartRate.beatsPerMinute`, la gramática
de `filter` por tipo) están confirmados contra el discovery doc real:
https://health.googleapis.com/$discovery/rest?version=v4 -- no adivinados.
La excepción es el path kebab-case de los tipos "daily rollup"
(`daily-resting-heart-rate`), inferido por convención porque el doc no
lista un ejemplo literal; si tira 404 es el primer lugar a mirar.

Sesiones de sueño (tipo `sleep`, con stages/duración) quedan afuera de
esta pasada -- son un tipo "session", no un dataPoint escalar, y merecen
su propio parser. Ver plan: mismo criterio que activities de Garmin.
"""

from datetime import date, timedelta
from typing import Any

from googleapiclient.discovery import Resource, build

from vitacora_sync.readings import Reading

WEIGHT_GRAMS_PER_KG = 1000.0

# Gramática del filtro AIP-160: distinta según la naturaleza del tipo de
# dato (confirmado en la doc de `dataPoints.list`). Usar el patrón que no
# corresponde no da error -- da una lista vacía, silenciosa.
_SAMPLE_TYPES = {"weight", "body-fat", "oxygen-saturation"}
_INTERVAL_TYPES = {"steps", "distance"}
_DAILY_TYPES = {"daily-resting-heart-rate", "daily-heart-rate-variability", "daily-respiratory-rate"}


def build_client(credentials) -> Resource:
    return build("health", "v4", credentials=credentials)


def _civil_filter(data_type: str, day: date) -> str:
    field = data_type.replace("-", "_")
    next_day = (day + timedelta(days=1)).isoformat()
    if data_type in _SAMPLE_TYPES:
        path = f"{field}.sample_time.civil_time"
    elif data_type in _INTERVAL_TYPES:
        path = f"{field}.interval.civil_start_time"
    elif data_type in _DAILY_TYPES:
        path = f"{field}.date"
    else:
        raise ValueError(f"Vitácora no sabe armar el filtro para dataType={data_type!r}")
    return f'{path} >= "{day.isoformat()}" AND {path} < "{next_day}"'


def _list_data_points(service: Resource, data_type: str, day: date) -> list[dict[str, Any]]:
    resp = (
        service.users()
        .dataTypes()
        .dataPoints()
        .list(parent=f"users/me/dataTypes/{data_type}", filter=_civil_filter(data_type, day))
        .execute()
    )
    return resp.get("dataPoints", [])


def fetch_day(service: Resource, day: date) -> list[Reading]:
    readings: list[Reading] = []

    for point in _list_data_points(service, "weight", day):
        grams = point.get("weight", {}).get("weightGrams")
        if grams is not None:
            readings.append(Reading(day, "weight_kg", "google_health", grams / WEIGHT_GRAMS_PER_KG, "kg"))

    for point in _list_data_points(service, "body-fat", day):
        pct = point.get("bodyFat", {}).get("percentage")
        if pct is not None:
            readings.append(Reading(day, "body_fat_pct", "google_health", float(pct), "pct"))

    for point in _list_data_points(service, "steps", day):
        count = point.get("steps", {}).get("count")
        if count is not None:
            readings.append(Reading(day, "steps", "google_health", float(count), "count"))

    for point in _list_data_points(service, "daily-resting-heart-rate", day):
        bpm = point.get("dailyRestingHeartRate", {}).get("beatsPerMinute")
        if bpm is not None:
            readings.append(Reading(day, "resting_hr", "google_health", float(bpm), "bpm"))

    return readings
