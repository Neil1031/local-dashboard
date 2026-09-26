CREATE TABLE schedule_version (
    id INTEGER PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES job(id),
    fingerprint TEXT NOT NULL,
    definition_json TEXT NOT NULL,
    first_observed_at TEXT NOT NULL,
    last_observed_at TEXT NOT NULL,
    windows_timezone_id TEXT,
    previous_last_observed_at TEXT,
    UNIQUE (job_id, first_observed_at)
);

CREATE INDEX schedule_version_job_order ON schedule_version(job_id, first_observed_at DESC, id DESC);

CREATE TABLE schedule_observation (
    id INTEGER PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES job(id),
    observed_at TEXT NOT NULL,
    schedule_version_id INTEGER REFERENCES schedule_version(id),
    presence_status TEXT NOT NULL CHECK (presence_status IN ('PRESENT', 'ABSENT_OBSERVED')),
    collection_status TEXT NOT NULL CHECK (collection_status IN ('OK', 'PARTIAL')),
    UNIQUE (job_id, observed_at)
);

CREATE INDEX schedule_observation_job_order ON schedule_observation(job_id, observed_at DESC, id DESC);
