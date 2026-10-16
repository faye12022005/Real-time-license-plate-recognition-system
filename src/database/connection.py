"""Database connection (SQLite)."""
from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "alpr.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
    CREATE TABLE IF NOT EXISTS plates (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        job_filename TEXT,
        track_id INTEGER,
        plate_number TEXT,
        plate_display TEXT,
        province TEXT,
        plate_type TEXT,
        vehicle_type TEXT,
        confidence_score REAL,
        quality_score REAL,
        crop_image_url TEXT,
        pts_ms INTEGER,
        video_time_str TEXT,
        timestamp TEXT,
        speed_kmh REAL,
        video_url TEXT
    )
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        filename TEXT,
        file_size_bytes INTEGER,
        stage TEXT,
        stage_progress_pct REAL,
        overall_progress_pct REAL,
        total_frames INTEGER,
        processed_frames INTEGER,
        duration_seconds REAL,
        current_fps REAL,
        eta_seconds REAL,
        detected_plates_count INTEGER,
        video_url TEXT,
        error_message TEXT,
        created_at TEXT,
        completed_at TEXT
    )
    """)
    conn.commit()
    conn.close()
