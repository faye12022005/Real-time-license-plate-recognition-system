"""SQLite connection management for ALPR results."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from config.settings import DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'QUEUED',
    stage_progress_pct REAL NOT NULL DEFAULT 0,
    overall_progress_pct REAL NOT NULL DEFAULT 0,
    total_frames INTEGER NOT NULL DEFAULT 0,
    processed_frames INTEGER NOT NULL DEFAULT 0,
    duration_seconds REAL NOT NULL DEFAULT 0,
    current_fps REAL NOT NULL DEFAULT 0,
    eta_seconds REAL NOT NULL DEFAULT 0,
    detected_plates_count INTEGER NOT NULL DEFAULT 0,
    video_url TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS plate_records (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    job_filename TEXT NOT NULL,
    track_id INTEGER NOT NULL,
    plate_number TEXT NOT NULL,
    plate_display TEXT NOT NULL,
    province TEXT NOT NULL,
    plate_type TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    quality_score REAL NOT NULL,
    crop_image_url TEXT NOT NULL,
    pts_ms INTEGER NOT NULL,
    video_time_str TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    speed_kmh REAL,
    video_url TEXT,
    votes INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plate_records_plate ON plate_records (plate_number);
CREATE INDEX IF NOT EXISTS idx_plate_records_job ON plate_records (job_id);
"""


def get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    """Open a SQLite connection with row access by column name."""
    path = Path(db_path) if db_path is not None else DATABASE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def connection(db_path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    """Context manager that commits on success and rolls back on failure."""
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Optional[str | Path] = None) -> None:
    """Create tables and indexes if they do not exist."""
    with connection(db_path) as conn:
        conn.executescript(SCHEMA)
