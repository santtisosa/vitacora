"""Segunda pasada del motor determinista (Fase 3 del plan).

Lee `daily_metric`, aplica `vitacora_sync.metrics` (ya cubierto por
tests/test_metrics.py) y escribe `metric_rollup`. Se corre después del
sync diario. La web lee `metric_rollup` directo por RSC -- nunca
recalcula baseline, z-score o EWMA en TypeScript: esa lógica vive una
sola vez, acá, y está testeada acá.

Este archivo es deliberadamente plomería: cero matemática propia, todo
delega a funciones puras ya probadas. La cobertura de este módulo es la
cobertura de metrics.py -- lo único no testeado es el I/O de Postgres,
que necesita una DB real (ver plan, checklist de setup).
"""

import os
import sys
from datetime import date, timedelta

import psycopg

from vitacora_sync.metrics import directional_z, ewma, personal_baseline, rolling_vs_baseline

BASELINE_WINDOW_DAYS = 60
LOOKBACK_DAYS = 120  # 60 de baseline + margen para que la ventana trailing tenga datos desde el día 1
OUTPUT_DAYS = 90  # cuántos días recientes recalcula cada corrida
EWMA_METRICS = {"weight_kg"}  # métricas que se muestran suavizadas en vez de crudas

_UPSERT_ROLLUP = """
    INSERT INTO metric_rollup
        (local_date, metric, source, smoothed, baseline_mean, baseline_std,
         z_score, recent_avg, long_avg, delta_pct)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (local_date, metric, source) DO UPDATE SET
        smoothed = EXCLUDED.smoothed,
        baseline_mean = EXCLUDED.baseline_mean,
        baseline_std = EXCLUDED.baseline_std,
        z_score = EXCLUDED.z_score,
        recent_avg = EXCLUDED.recent_avg,
        long_avg = EXCLUDED.long_avg,
        delta_pct = EXCLUDED.delta_pct,
        computed_at = now()
"""


def _distinct_metric_sources(conn: psycopg.Connection) -> list[tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT metric, source FROM daily_metric")
        return cur.fetchall()


def _load_series(
    conn: psycopg.Connection, metric: str, source: str, today: date
) -> list[tuple[date, float | None]]:
    start = today - timedelta(days=LOOKBACK_DAYS)
    with conn.cursor() as cur:
        cur.execute(
            """SELECT local_date, value FROM daily_metric
               WHERE metric = %s AND source = %s AND local_date >= %s AND local_date < %s
               ORDER BY local_date""",
            (metric, source, start, today),
        )
        return cur.fetchall()


def _rollup_rows(metric: str, source: str, dates: list[date], values: list[float | None]) -> list[tuple]:
    """Para cada día en la ventana de salida, arma baseline/z/rolling con
    una ventana TRAILING que termina en ese día -- nunca mira el futuro."""
    smoothed_series = ewma(values) if metric in EWMA_METRICS else [None] * len(values)
    start_idx = max(0, len(dates) - OUTPUT_DAYS)
    rows = []
    for i in range(start_idx, len(dates)):
        trailing = values[: i + 1]
        baseline = personal_baseline(trailing, window_days=BASELINE_WINDOW_DAYS)
        rolling = rolling_vs_baseline(trailing)
        value = values[i]
        z = directional_z(value, baseline) if (baseline and value is not None) else None
        rows.append((
            dates[i],
            metric,
            source,
            smoothed_series[i],
            baseline.mean if baseline else None,
            baseline.std if baseline else None,
            z,
            rolling.recent,
            rolling.baseline,
            rolling.delta_pct,
        ))
    return rows


def compute_and_store(conn: psycopg.Connection, today: date | None = None) -> int:
    today = today or date.today()
    written = 0
    for metric, source in _distinct_metric_sources(conn):
        series = _load_series(conn, metric, source, today)
        if not series:
            continue
        dates = [d for d, _ in series]
        values = [v for _, v in series]
        rows = _rollup_rows(metric, source, dates, values)
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_ROLLUP, rows)
        written += len(rows)
    conn.commit()
    return written


if __name__ == "__main__":
    connection = psycopg.connect(os.environ["DATABASE_URL"])
    n = compute_and_store(connection)
    connection.close()
    print(f"metric_rollup: {n} filas actualizadas")
    sys.exit(0)
