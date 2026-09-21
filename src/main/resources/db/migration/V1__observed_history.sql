CREATE TABLE job (
    id TEXT PRIMARY KEY NOT NULL,
    task_path TEXT NOT NULL,
    task_name TEXT NOT NULL,
    enabled INTEGER CHECK (enabled IN (0, 1)),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE job_run (
    id INTEGER PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES job(id),
    observed_run_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED')),
    scheduler_result INTEGER,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    message TEXT,
    raw_result TEXT NOT NULL,
    first_observed_at TEXT NOT NULL,
    last_observed_at TEXT NOT NULL,
    UNIQUE (job_id, observed_run_at)
);
