"""Copy legacy SQLite ALPR data into the MySQL database."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config.settings import LEGACY_SQLITE_PATH, MYSQL_DATABASE
from src.database.repository import PlateRepository
from src.models import PlateRecord, VideoJob
from src.utils.plate_validator import format_plate, province_name


def _value(row: sqlite3.Row, key: str, default: Any = None) -> Any:
    return row[key] if key in row.keys() else default


def _read_table(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    if not exists:
        return []
    return conn.execute(f"SELECT * FROM {table}").fetchall()


def _to_job(row: sqlite3.Row) -> VideoJob:
    return VideoJob(
        id=str(_value(row, "id")),
        filename=str(_value(row, "filename", "")),
        file_size_bytes=int(_value(row, "file_size_bytes", 0) or 0),
        stage=str(_value(row, "stage", "QUEUED")),
        stage_progress_pct=float(_value(row, "stage_progress_pct", 0) or 0),
        overall_progress_pct=float(_value(row, "overall_progress_pct", 0) or 0),
        total_frames=int(_value(row, "total_frames", 0) or 0),
        processed_frames=int(_value(row, "processed_frames", 0) or 0),
        duration_seconds=float(_value(row, "duration_seconds", 0) or 0),
        current_fps=float(_value(row, "current_fps", 0) or 0),
        eta_seconds=float(_value(row, "eta_seconds", 0) or 0),
        detected_plates_count=int(_value(row, "detected_plates_count", 0) or 0),
        video_url=_value(row, "video_url"),
        error_message=_value(row, "error_message"),
        created_at=str(_value(row, "created_at", "")),
        completed_at=_value(row, "completed_at"),
    )


def _to_record(row: sqlite3.Row) -> PlateRecord:
    plate_number = str(_value(row, "plate_number", ""))
    plate_display = str(
        _value(row, "plate_display") or format_plate(plate_number)
    )
    province = str(_value(row, "province") or province_name(plate_number))
    return PlateRecord(
        id=str(_value(row, "id")),
        job_id=str(_value(row, "job_id")),
        job_filename=str(_value(row, "job_filename", "")),
        track_id=int(_value(row, "track_id", 0) or 0),
        plate_number=plate_number,
        plate_display=plate_display,
        province=province,
        plate_type=str(_value(row, "plate_type", "white")),
        vehicle_type=str(_value(row, "vehicle_type", "car")),
        confidence_score=float(_value(row, "confidence_score", 0) or 0),
        quality_score=float(_value(row, "quality_score", 0) or 0),
        crop_image_url=str(_value(row, "crop_image_url", "")),
        pts_ms=int(_value(row, "pts_ms", 0) or 0),
        video_time_str=str(_value(row, "video_time_str", "00:00")),
        timestamp=str(_value(row, "timestamp", "")),
        speed_kmh=_value(row, "speed_kmh"),
        video_url=_value(row, "video_url"),
        votes=int(_value(row, "votes", 0) or 0),
        source=str(_value(row, "source", "")),
    )


def migrate(sqlite_path: Path, database: str | None = None) -> tuple[int, int]:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {sqlite_path}")

    repository = PlateRepository(database)

    conn = sqlite3.connect(str(sqlite_path))
    conn.row_factory = sqlite3.Row
    try:
        jobs = _read_table(conn, "jobs")
        records = _read_table(conn, "plate_records")
    finally:
        conn.close()

    for row in jobs:
        repository.save_job(_to_job(row))
    for row in records:
        repository.save_record(_to_record(row))

    return len(jobs), len(records)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Migrate ALPR data from SQLite to MySQL."
    )
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=LEGACY_SQLITE_PATH,
        help=f"Path to the legacy SQLite file (default: {LEGACY_SQLITE_PATH}).",
    )
    parser.add_argument(
        "--database",
        default=None,
        help=f"Target MySQL database name (default: {MYSQL_DATABASE}).",
    )
    args = parser.parse_args(argv)

    try:
        job_count, record_count = migrate(args.sqlite, args.database)
    except Exception as exc:  # noqa: BLE001
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1

    target = args.database or MYSQL_DATABASE
    print(
        f"Migrated {job_count} job(s) and {record_count} plate record(s) "
        f"from {args.sqlite} to MySQL database '{target}'."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
