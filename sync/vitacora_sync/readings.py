"""Tipo compartido entre los adaptadores de fuente y la capa de DB."""

from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class Reading:
    local_date: date
    metric: str
    source: str
    value: float | None
    unit: str
    recorded_at: datetime | None = None
