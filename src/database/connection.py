"""MySQL connection management for ALPR results."""

from __future__ import annotations

import re
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from config.settings import (
    MYSQL_CHARSET,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")

SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS `jobs` (
        `id` VARCHAR(64) NOT NULL,
        `filename` VARCHAR(512) NOT NULL,
        `file_size_bytes` BIGINT NOT NULL DEFAULT 0,
        `stage` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
        `stage_progress_pct` DOUBLE NOT NULL DEFAULT 0,
        `overall_progress_pct` DOUBLE NOT NULL DEFAULT 0,
        `total_frames` INT NOT NULL DEFAULT 0,
        `processed_frames` INT NOT NULL DEFAULT 0,
        `duration_seconds` DOUBLE NOT NULL DEFAULT 0,
        `current_fps` DOUBLE NOT NULL DEFAULT 0,
        `eta_seconds` DOUBLE NOT NULL DEFAULT 0,
        `detected_plates_count` INT NOT NULL DEFAULT 0,
        `video_url` TEXT NULL,
        `error_message` TEXT NULL,
        `created_at` VARCHAR(64) NOT NULL,
        `completed_at` VARCHAR(64) NULL,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    """
    CREATE TABLE IF NOT EXISTS `plate_records` (
        `id` VARCHAR(64) NOT NULL,
        `job_id` VARCHAR(64) NOT NULL,
        `job_filename` VARCHAR(512) NOT NULL,
        `track_id` INT NOT NULL,
        `plate_number` VARCHAR(32) NOT NULL,
        `plate_display` VARCHAR(32) NOT NULL,
        `province` VARCHAR(128) NOT NULL,
        `plate_type` VARCHAR(32) NOT NULL,
        `vehicle_type` VARCHAR(32) NOT NULL,
        `confidence_score` DOUBLE NOT NULL,
        `quality_score` DOUBLE NOT NULL,
        `crop_image_url` VARCHAR(1024) NOT NULL,
        `pts_ms` BIGINT NOT NULL,
        `video_time_str` VARCHAR(16) NOT NULL,
        `timestamp` VARCHAR(64) NOT NULL,
        `speed_kmh` DOUBLE NULL,
        `video_url` TEXT NULL,
        `votes` INT NOT NULL DEFAULT 0,
        `source` VARCHAR(64) NOT NULL DEFAULT '',
        PRIMARY KEY (`id`),
        INDEX `idx_plate_records_plate` (`plate_number`),
        INDEX `idx_plate_records_job` (`job_id`),
        CONSTRAINT `fk_plate_records_job`
            FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
)


def _import_pymysql() -> Any:
    try:
        import pymysql
    except ImportError as exc:
        raise ImportError(
            "PyMySQL is required for database support. Install dependencies with "
            "'pip install -r requirements.txt'."
        ) from exc
    return pymysql


def _validate_database_name(name: str) -> str:
    if not name or not _IDENTIFIER_PATTERN.fullmatch(name):
        raise ValueError(
            f"Invalid MySQL database name: {name!r}. "
            "Only letters, digits and underscores are allowed."
        )
    return name


def _connect(database: Optional[str]) -> Any:
    pymysql = _import_pymysql()
    from pymysql.cursors import DictCursor

    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=database,
        charset=MYSQL_CHARSET,
        cursorclass=DictCursor,
        autocommit=False,
        connect_timeout=10,
    )


def _ensure_database(name: str) -> None:
    """Create the target database when it does not exist yet."""
    connection = _connect(database=None)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{name}` "
                f"CHARACTER SET {MYSQL_CHARSET} COLLATE utf8mb4_unicode_ci"
            )
        connection.commit()
    finally:
        connection.close()


def get_connection(database: Optional[str] = None) -> Any:
    """Open a MySQL connection using a dictionary cursor."""
    name = _validate_database_name(database or MYSQL_DATABASE)
    return _connect(database=name)


@contextmanager
def connection(database: Optional[str] = None) -> Iterator[Any]:
    """Context manager that commits on success and rolls back on failure."""
    conn = get_connection(database)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(database: Optional[str] = None) -> None:
    """Create the database, tables and indexes if they do not exist."""
    name = _validate_database_name(database or MYSQL_DATABASE)
    _ensure_database(name)

    conn = _connect(database=name)
    try:
        with conn.cursor() as cursor:
            for statement in SCHEMA:
                cursor.execute(statement)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
