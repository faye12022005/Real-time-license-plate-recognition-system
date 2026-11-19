"""Persistent system settings, storage usage, cleanup, and database backup helpers."""

from __future__ import annotations

import copy
import datetime as _dt
import json
import os
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from config.settings import CAPTURES_DIR, DATA_DIR, DB_PATH, PARKING_DIR, SAMPLES_DIR

SETTINGS_FILE = DATA_DIR / "system_settings.json"
BACKUP_DIR = DATA_DIR / "backups"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "parking": {
        "tariff": {
            "motorcycle_day": 3000,
            "motorcycle_night": 6000,
            "car_first_2h": 20000,
            "car_extra_hour": 10000,
            "bicycle_day": 1000,
            "bicycle_night": 2000,
            "electric_day": 2000,
            "electric_night": 4000,
        },
        "day_start": "06:00",
        "night_start": "22:00",
        "grace_period_minutes": 15,
        "max_capacity": {
            "car": 500,
            "motorcycle": 1500,
        },
    },
    "ai": {
        "auto_open_enabled": True,
        "auto_open_min_confidence": 90,
        "barrier_open_seconds": 5,
        "min_confidence": 80,
        "plate_tolerance": 1,
        "evidence_mode": "both",
    },
    "security": {
        "blacklist_plates": [],
        "mismatch_alert": True,
        "vehicle_type_mismatch_alert": True,
        "overstay_alert_days": 3,
    },
    "storage": {
        "auto_cleanup_enabled": False,
        "video_retention_days": 30,
        "crop_retention_days": 90,
    },
    "building": {
        "name": "Chung cư Sunrise City - Tháp A",
        "hotline": "1900 1234",
        "shift_name": "Ca trực bảo vệ",
    },
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Merge override into base without losing newly added default keys."""
    result = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_settings() -> Dict[str, Any]:
    """Load settings from disk, falling back to defaults on missing/corrupt JSON."""
    if not SETTINGS_FILE.is_file():
        return copy.deepcopy(DEFAULT_SETTINGS)

    try:
        with SETTINGS_FILE.open("r", encoding="utf-8") as handle:
            stored = json.load(handle)
        if not isinstance(stored, dict):
            raise ValueError("Settings root must be a JSON object")
        return _deep_merge(DEFAULT_SETTINGS, stored)
    except Exception:
        return copy.deepcopy(DEFAULT_SETTINGS)


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Persist merged settings atomically and return the stored object."""
    merged = _deep_merge(DEFAULT_SETTINGS, settings or {})
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = SETTINGS_FILE.with_suffix(".tmp")

    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)
    os.replace(temp_path, SETTINGS_FILE)
    return merged


def _dir_usage(path: Path) -> Dict[str, Any]:
    total_bytes = 0
    file_count = 0
    if path.exists():
        for item in path.rglob("*"):
            try:
                if item.is_file():
                    total_bytes += item.stat().st_size
                    file_count += 1
            except OSError:
                continue

    return {
        "path": str(path),
        "size_bytes": total_bytes,
        "size_mb": round(total_bytes / (1024 * 1024), 2),
        "file_count": file_count,
    }


def get_storage_usage() -> Dict[str, Any]:
    """Return disk usage for the media directories and the hosting volume."""
    folders = {
        "captures": _dir_usage(CAPTURES_DIR),
        "parking_captures": _dir_usage(PARKING_DIR),
        "sample_videos": _dir_usage(SAMPLES_DIR),
    }
    total_bytes = sum(item["size_bytes"] for item in folders.values())

    try:
        disk = shutil.disk_usage(str(DATA_DIR))
        disk_info = {
            "total_bytes": disk.total,
            "used_bytes": disk.used,
            "free_bytes": disk.free,
            "total_gb": round(disk.total / (1024 ** 3), 2),
            "used_gb": round(disk.used / (1024 ** 3), 2),
            "free_gb": round(disk.free / (1024 ** 3), 2),
            "used_percent": round((disk.used / disk.total) * 100, 1) if disk.total else 0,
        }
    except OSError:
        disk_info = {}

    return {
        "folders": folders,
        "total_size_bytes": total_bytes,
        "total_size_mb": round(total_bytes / (1024 * 1024), 2),
        "disk": disk_info,
        "settings_file": str(SETTINGS_FILE),
    }


def _remove_old_files(root: Path, cutoff_ts: float, label: str) -> Dict[str, Any]:
    deleted_files = 0
    freed_bytes = 0
    if not root.exists():
        return {"label": label, "deleted_files": 0, "freed_bytes": 0}

    for item in root.rglob("*"):
        try:
            if not item.is_file():
                continue
            if item.name in {".gitkeep", ".DS_Store"}:
                continue
            if item.stat().st_mtime >= cutoff_ts:
                continue
            size = item.stat().st_size
            item.unlink()
            deleted_files += 1
            freed_bytes += size
        except OSError:
            continue

    # Remove empty capture sub-directories after pruning old crops.
    if root in (CAPTURES_DIR, PARKING_DIR):
        for child in root.iterdir():
            try:
                if child.is_dir() and not any(child.iterdir()):
                    child.rmdir()
            except OSError:
                continue

    return {"label": label, "deleted_files": deleted_files, "freed_bytes": freed_bytes}


def cleanup_storage(settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Delete media files older than configured retention windows."""
    current = settings or load_settings()
    storage = current.get("storage", {}) if isinstance(current, dict) else {}
    video_days = max(0, int(storage.get("video_retention_days", 30)))
    crop_days = max(0, int(storage.get("crop_retention_days", 90)))

    now = time.time()
    video_cutoff = now - video_days * 86400
    crop_cutoff = now - crop_days * 86400

    results = [
        _remove_old_files(SAMPLES_DIR, video_cutoff, "sample_videos"),
        _remove_old_files(CAPTURES_DIR, crop_cutoff, "captures"),
        _remove_old_files(PARKING_DIR, crop_cutoff, "parking_captures"),
    ]
    deleted_files = sum(item["deleted_files"] for item in results)
    freed_bytes = sum(item["freed_bytes"] for item in results)

    return {
        "status": "success",
        "message": f"Đã dọn {deleted_files} tệp, giải phóng {round(freed_bytes / (1024 * 1024), 2)} MB",
        "deleted_files": deleted_files,
        "freed_bytes": freed_bytes,
        "freed_mb": round(freed_bytes / (1024 * 1024), 2),
        "video_retention_days": video_days,
        "crop_retention_days": crop_days,
        "details": results,
    }


def _sql_literal(value: Any) -> str:
    """Convert a Python value into a MySQL-compatible SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "X'" + bytes(value).hex() + "'"
    if isinstance(value, (_dt.datetime, _dt.date, _dt.time)):
        value = value.isoformat(sep=" ") if isinstance(value, _dt.datetime) else value.isoformat()
    text = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{text}'"


def _dump_mysql() -> str:
    from src.database.connection import get_mysql_raw_connection

    raw = get_mysql_raw_connection(create_db_if_missing=False)
    if raw is None:
        raise RuntimeError("Không kết nối được MySQL để sao lưu")

    lines: List[str] = [
        "-- SMART ALPR database backup",
        f"-- Engine: MySQL",
        f"-- Created: {_dt.datetime.now().isoformat(timespec='seconds')}",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS=0;",
        "",
    ]
    try:
        cur = raw.cursor()
        cur.execute("SHOW TABLES")
        tables = [row[0] for row in cur.fetchall()]
        for table in tables:
            cur.execute(f"SHOW CREATE TABLE `{table}`")
            create_row = cur.fetchone()
            if not create_row:
                continue
            lines.append(f"-- Table `{table}`")
            lines.append(str(create_row[1]) + ";")
            cur.execute(f"SELECT * FROM `{table}`")
            columns = [desc[0] for desc in cur.description] if cur.description else []
            rows = cur.fetchall()
            if columns and rows:
                column_sql = ", ".join(f"`{col}`" for col in columns)
                for row in rows:
                    values = ", ".join(_sql_literal(value) for value in row)
                    lines.append(f"INSERT INTO `{table}` ({column_sql}) VALUES ({values});")
            lines.append("")
        cur.close()
    finally:
        raw.close()

    lines.append("SET FOREIGN_KEY_CHECKS=1;")
    return "\n".join(lines)


def _dump_sqlite() -> str:
    if not DB_PATH.is_file():
        raise RuntimeError("Không tìm thấy file SQLite để sao lưu")
    conn = sqlite3.connect(str(DB_PATH))
    try:
        return "\n".join(conn.iterdump())
    finally:
        conn.close()


def create_database_backup() -> Dict[str, Any]:
    """Create a .sql backup for the active database (SQLite or MySQL)."""
    from src.database.connection import (
        MySQLConnectionWrapper,
        SQLServerConnectionWrapper,
        get_connection,
    )

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"alpr_backup_{timestamp}.sql"

    conn = get_connection()
    try:
        is_mysql = isinstance(conn, MySQLConnectionWrapper)
        is_sqlserver = isinstance(conn, SQLServerConnectionWrapper)
    finally:
        conn.close()

    if is_sqlserver:
        raise RuntimeError(
            "Sao lưu .sql cho SQL Server chưa được hỗ trợ. "
            "Hãy dùng SQL Server Management Studio hoặc đổi sang MySQL/SQLite."
        )

    if is_mysql:
        content = _dump_mysql()
    else:
        content = _dump_sqlite()

    backup_path.write_text(content, encoding="utf-8")
    return {
        "status": "success",
        "filename": backup_path.name,
        "path": str(backup_path),
        "size_bytes": backup_path.stat().st_size,
        "size_mb": round(backup_path.stat().st_size / (1024 * 1024), 2),
    }
