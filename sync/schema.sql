-- Vitácora — esquema Postgres (Neon)
--
-- Regla de diseño (ver plan): dos columnas de tiempo siempre (instante UTC +
-- fecha local a la que se atribuye), días faltantes como NULL explícito
-- nunca como filas ausentes, y `source` en la PK de daily_metric para que
-- las dos fuentes convivan sin pisarse — eso es lo que habilita la
-- reconciliación, el feature central del producto.

CREATE TABLE IF NOT EXISTS daily_metric (
    local_date   date NOT NULL,
    metric       text NOT NULL,           -- 'steps' | 'resting_hr' | 'hrv' | 'weight_kg' | ...
    source       text NOT NULL,           -- 'garmin' | 'google_health'
    value        double precision,        -- NULL explícito si el día no tiene dato
    unit         text NOT NULL,
    recorded_at  timestamptz,             -- instante real de la medición, si se conoce
    PRIMARY KEY (local_date, metric, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_metric_metric_date
    ON daily_metric (metric, local_date);

CREATE TABLE IF NOT EXISTS sleep_session (
    id              bigserial PRIMARY KEY,
    source          text NOT NULL,
    start_utc       timestamptz NOT NULL,
    end_utc         timestamptz NOT NULL,
    wake_local_date date NOT NULL,        -- regla: el sueño se atribuye al día en que se despertó
    stages          jsonb,
    UNIQUE (source, start_utc)
);

CREATE TABLE IF NOT EXISTS activity (
    id          bigserial PRIMARY KEY,
    source      text NOT NULL,
    start_utc   timestamptz NOT NULL,
    local_date  date NOT NULL,
    sport       text NOT NULL,
    duration_s  integer NOT NULL,
    distance_m  double precision,
    avg_hr      integer,
    kcal        double precision,
    UNIQUE (source, start_utc)
);

CREATE TABLE IF NOT EXISTS checkin (
    local_date    date PRIMARY KEY,
    sleep_quality smallint,   -- Hooper-Mackinnon, 1-7
    stress        smallint,
    fatigue       smallint,
    soreness      smallint,
    water_ml      integer,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insight (
    local_date   date NOT NULL,
    context_hash text NOT NULL,   -- sha256 del contexto enviado al LLM
    body         jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (local_date, context_hash)
);

-- Segunda pasada del motor determinista (compute_rollups.py). La web
-- lee esta tabla, nunca calcula baseline/z-score/EWMA en TypeScript --
-- la lógica vive una sola vez, en vitacora_sync.metrics (Python, testeado).
CREATE TABLE IF NOT EXISTS metric_rollup (
    local_date    date NOT NULL,
    metric        text NOT NULL,
    source        text NOT NULL,
    smoothed      double precision,   -- EWMA, solo métricas en EWMA_METRICS (ej. weight_kg)
    baseline_mean double precision,   -- media de los últimos 60 días hasta esta fecha (trailing)
    baseline_std  double precision,
    z_score       double precision,   -- clipeado +-3, ver metrics.directional_z
    recent_avg    double precision,   -- media de los últimos 14 días hasta esta fecha
    long_avg      double precision,   -- media de los últimos 60 días hasta esta fecha
    delta_pct     double precision,   -- mecánica "Balance" de Oura: recent vs long
    computed_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (local_date, metric, source)
);

CREATE TABLE IF NOT EXISTS metric_source_priority (
    metric           text PRIMARY KEY,
    preferred_source text NOT NULL
);

-- Arranque sugerido: Garmin manda en todo lo fisiológico (es el que se usa
-- en entrenamientos), Google Health (Fitbit) manda en composición corporal.
INSERT INTO metric_source_priority (metric, preferred_source) VALUES
    ('steps', 'garmin'),
    ('resting_hr', 'garmin'),
    ('hrv', 'garmin'),
    ('spo2', 'garmin'),
    ('sleep_score', 'garmin'),
    ('weight_kg', 'google_health'),
    ('body_fat_pct', 'google_health')
ON CONFLICT (metric) DO NOTHING;
