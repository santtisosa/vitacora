"""Entrypoint del sync diario. Se corre desde GitHub Actions una vez al
día (ver plan, Fase 1/2 y arquitectura). Si una fuente falla, la otra
sigue: un adaptador roto degrada a datos viejos, nunca tira abajo el sync
entero -- por eso el job solo sale en rojo si fallan TODAS las fuentes.
"""

import logging
import os
import sys
from datetime import date, timedelta

from vitacora_sync import db
from vitacora_sync.sources import garmin, google_health, google_health_auth

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("vitacora.sync")

# Hoy es la única excepción a "series temporales = DO NOTHING": el día no
# cerró, el valor sigue cambiando, cada corrida lo pisa (ver db.py).
_DAYS_TO_SYNC = [
    (lambda today: today - timedelta(days=1), "save_readings"),
    (lambda today: today, "save_today_readings"),
]


def _sync_days(conn, fetch_day, today: date) -> int:
    total = 0
    for pick_day, save_fn_name in _DAYS_TO_SYNC:
        day = pick_day(today)
        save_fn = getattr(db, save_fn_name)
        readings = fetch_day(day)
        total += save_fn(conn, readings)
    return total


def sync_garmin(conn, today: date) -> int:
    client = garmin.login()
    return _sync_days(conn, lambda day: garmin.fetch_day(client, day), today)


def sync_google_health(conn, today: date) -> int:
    creds = google_health_auth.get_credentials(os.environ["GOOGLE_CLIENT_SECRETS_PATH"])
    service = google_health.build_client(creds)
    return _sync_days(conn, lambda day: google_health.fetch_day(service, day), today)


def main() -> int:
    today = date.today()
    conn = db.connect(os.environ["DATABASE_URL"])
    sources = {"garmin": sync_garmin, "google_health": sync_google_health}
    failed: list[str] = []

    for name, sync_fn in sources.items():
        try:
            count = sync_fn(conn, today)
            log.info("%s: %d métricas sincronizadas", name, count)
        except Exception:
            log.exception("%s falló -- sigue con la otra fuente", name)
            failed.append(name)

    conn.close()

    if failed:
        log.warning("fuentes con error: %s", failed)
    if len(failed) == len(sources):
        log.error("todas las fuentes fallaron -- nada se sincronizó hoy")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
