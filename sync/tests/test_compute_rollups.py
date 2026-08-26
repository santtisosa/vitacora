"""_rollup_rows es la única lógica no trivial de compute_rollups.py (el
resto es I/O de Postgres) -- lo que importa comprobar es que la ventana
es trailing (nunca mira el futuro) y que EWMA solo se aplica a las
métricas configuradas."""

from datetime import date, timedelta

from compute_rollups import _rollup_rows


def _dates(n: int, start: date = date(2026, 1, 1)) -> list[date]:
    return [start + timedelta(days=i) for i in range(n)]


def test_baseline_at_each_day_only_uses_days_up_to_and_including_it():
    # Arrange: 5 días en 50.0, después un salto a 100.0 el último día
    dates = _dates(6)
    values = [50.0, 50.0, 50.0, 50.0, 50.0, 100.0]

    # Act
    rows = _rollup_rows("resting_hr", "garmin", dates, values)

    # Assert: el baseline del día ANTERIOR al salto no lo conoce todavía
    row_before_spike = rows[4]
    baseline_mean_before = row_before_spike[4]
    assert baseline_mean_before == 50.0

    # Assert: el día del salto, el baseline (calculado hasta ANTES del
    # valor de hoy conceptualmente incluido) refleja el nuevo dato
    row_at_spike = rows[5]
    z_at_spike = row_at_spike[6]
    assert z_at_spike > 0  # el salto se ve como una desviación hacia arriba


def test_only_configured_metrics_get_ewma_smoothing():
    # Arrange
    dates = _dates(3)
    values = [70.0, 72.0, 71.0]

    # Act
    weight_rows = _rollup_rows("weight_kg", "google_health", dates, values)
    hr_rows = _rollup_rows("resting_hr", "garmin", dates, values)

    # Assert: weight_kg está en EWMA_METRICS, resting_hr no
    assert weight_rows[-1][3] is not None
    assert hr_rows[-1][3] is None


def test_output_row_count_matches_number_of_days():
    # Arrange
    dates = _dates(10)
    values = [60.0] * 10

    # Act
    rows = _rollup_rows("hrv", "garmin", dates, values)

    # Assert
    assert len(rows) == 10
    assert rows[0][0] == dates[0]
    assert rows[-1][0] == dates[-1]
