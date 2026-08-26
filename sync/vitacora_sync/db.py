"""Capa de persistencia. Un `psycopg.Connection` entra, filas de
`daily_metric` salen upserted.

Idempotencia por tipo de tabla (ver plan, decisión tomada de
`garmin-health-data`): series temporales van `ON CONFLICT DO NOTHING` --
la primera escritura gana. Si una fuente llega a corregir un valor viejo
(ej. Garmin recalcula el RHR de ayer con más datos) esto no lo actualiza;
`ponytail: first-write-wins, pasar a DO UPDATE si eso se vuelve un
problema real`.
"""

import psycopg

from vitacora_sync.readings import Reading

_INSERT_ONLY = """
    INSERT INTO daily_metric (local_date, metric, source, value, unit, recorded_at)
    VALUES (%(local_date)s, %(metric)s, %(source)s, %(value)s, %(unit)s, %(recorded_at)s)
    ON CONFLICT (local_date, metric, source) DO NOTHING
"""

_UPSERT_OVERWRITE = """
    INSERT INTO daily_metric (local_date, metric, source, value, unit, recorded_at)
    VALUES (%(local_date)s, %(metric)s, %(source)s, %(value)s, %(unit)s, %(recorded_at)s)
    ON CONFLICT (local_date, metric, source)
    DO UPDATE SET value = EXCLUDED.value, recorded_at = EXCLUDED.recorded_at
"""


def _rows(readings: list[Reading]) -> list[dict]:
    return [
        {
            "local_date": r.local_date,
            "metric": r.metric,
            "source": r.source,
            "value": r.value,
            "unit": r.unit,
            "recorded_at": r.recorded_at,
        }
        for r in readings
    ]


def save_readings(conn: psycopg.Connection, readings: list[Reading]) -> int:
    """Días ya cerrados: `ON CONFLICT DO NOTHING`, la primera escritura
    gana. Devuelve cuántas lecturas se procesaron (no cuántas filas
    nuevas insertó -- ese conteo no lo expone `executemany`)."""
    if not readings:
        return 0
    with conn.cursor() as cur:
        cur.executemany(_INSERT_ONLY, _rows(readings))
    conn.commit()
    return len(readings)


def save_today_readings(conn: psycopg.Connection, readings: list[Reading]) -> int:
    """El día de hoy es la ÚNICA excepción a "series temporales = DO
    NOTHING": mientras no cierre, el valor sigue cambiando durante el
    día, así que cada corrida lo pisa. Si esto escribiera con
    `save_readings`, el primer sync del día congelaría un step-count
    parcial para siempre -- la cuarentena del día parcial (ver
    `metrics.is_complete_day`) es la otra mitad de esta regla: filtra en
    lectura lo que esto todavía puede sobreescribir en escritura."""
    if not readings:
        return 0
    with conn.cursor() as cur:
        cur.executemany(_UPSERT_OVERWRITE, _rows(readings))
    conn.commit()
    return len(readings)


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url)
