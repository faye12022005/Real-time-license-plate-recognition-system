"""CRUD operations for vehicle entry and exit history in MySQL."""

from __future__ import annotations

import math
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from src.database.connection import connection, init_db
from src.models import PlateRecord, VideoJob
from src.utils.plate_validator import canonicalize_plate, format_plate, province_name

UPSERT_JOB_SQL = """
INSERT INTO `jobs` (
    `id`, `filename`, `file_size_bytes`, `stage`, `stage_progress_pct`,
    `overall_progress_pct`, `total_frames`, `processed_frames`,
    `duration_seconds`, `current_fps`, `eta_seconds`,
    `detected_plates_count`, `video_url`, `processed_video_url`, `error_message`,
    `created_at`, `completed_at`
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    `stage` = VALUES(`stage`),
    `stage_progress_pct` = VALUES(`stage_progress_pct`),
    `overall_progress_pct` = VALUES(`overall_progress_pct`),
    `total_frames` = VALUES(`total_frames`),
    `processed_frames` = VALUES(`processed_frames`),
    `current_fps` = VALUES(`current_fps`),
    `eta_seconds` = VALUES(`eta_seconds`),
    `detected_plates_count` = VALUES(`detected_plates_count`),
    `video_url` = VALUES(`video_url`),
    `processed_video_url` = VALUES(`processed_video_url`),
    `error_message` = VALUES(`error_message`),
    `completed_at` = VALUES(`completed_at`)
"""

UPSERT_RECORD_SQL = """
INSERT INTO `plate_records` (
    `id`, `job_id`, `job_filename`, `track_id`, `plate_number`,
    `plate_display`, `province`, `plate_type`, `vehicle_type`,
    `confidence_score`, `quality_score`, `crop_image_url`, `pts_ms`,
    `video_time_str`, `timestamp`, `speed_kmh`, `video_url`, `votes`, `source`
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    `job_id` = VALUES(`job_id`),
    `job_filename` = VALUES(`job_filename`),
    `track_id` = VALUES(`track_id`),
    `plate_number` = VALUES(`plate_number`),
    `plate_display` = VALUES(`plate_display`),
    `province` = VALUES(`province`),
    `plate_type` = VALUES(`plate_type`),
    `vehicle_type` = VALUES(`vehicle_type`),
    `confidence_score` = VALUES(`confidence_score`),
    `quality_score` = VALUES(`quality_score`),
    `crop_image_url` = VALUES(`crop_image_url`),
    `pts_ms` = VALUES(`pts_ms`),
    `video_time_str` = VALUES(`video_time_str`),
    `timestamp` = VALUES(`timestamp`),
    `speed_kmh` = VALUES(`speed_kmh`),
    `video_url` = VALUES(`video_url`),
    `votes` = VALUES(`votes`),
    `source` = VALUES(`source`)
"""


def _job_params(job: VideoJob) -> tuple:
    return (
        job.id,
        job.filename,
        job.file_size_bytes,
        job.stage,
        job.stage_progress_pct,
        job.overall_progress_pct,
        job.total_frames,
        job.processed_frames,
        job.duration_seconds,
        job.current_fps,
        job.eta_seconds,
        job.detected_plates_count,
        job.video_url,
        getattr(job, "processed_video_url", None),
        job.error_message,
        job.created_at,
        job.completed_at,
    )


def _record_params(record: PlateRecord) -> tuple:
    return (
        record.id,
        record.job_id,
        record.job_filename,
        record.track_id,
        record.plate_number,
        record.plate_display,
        record.province,
        record.plate_type,
        record.vehicle_type,
        record.confidence_score,
        record.quality_score,
        record.crop_image_url,
        record.pts_ms,
        record.video_time_str,
        record.timestamp,
        record.speed_kmh,
        record.video_url,
        record.votes,
        record.source,
    )


class PlateRepository:
    """Persistence layer for video jobs and plate observations."""

    def __init__(self, database: Optional[str] = None) -> None:
        self.database = database
        init_db(database)

    def save_job(self, job: VideoJob) -> None:
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute(UPSERT_JOB_SQL, _job_params(job))

    def save_record(self, record: PlateRecord) -> None:
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute(UPSERT_RECORD_SQL, _record_params(record))

    def save_records(self, records: list[PlateRecord]) -> None:
        if not records:
            return
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                for record in records:
                    cursor.execute(UPSERT_RECORD_SQL, _record_params(record))

    def list_records(
        self,
        query: Optional[str] = None,
        vehicle_type: Optional[str] = None,
        job_id: Optional[str] = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        parameters: list[Any] = []
        if query:
            normalized = canonicalize_plate(query)
            clauses.append("(`plate_number` LIKE %s OR `plate_display` LIKE %s)")
            parameters.extend([f"%{normalized}%", f"%{query.upper()}%"])
        if vehicle_type and vehicle_type != "all":
            clauses.append("`vehicle_type` = %s")
            parameters.append(vehicle_type)
        if job_id:
            clauses.append("`job_id` = %s")
            parameters.append(job_id)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.append(int(limit))
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT * FROM `plate_records` {where} "
                    "ORDER BY `timestamp` DESC LIMIT %s",
                    parameters,
                )
                rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def trace(self, plate_query: str) -> list[dict[str, Any]]:
        """Group all observations matching a plate or wildcard query."""
        if not plate_query or not plate_query.strip():
            return []

        raw_query = plate_query.strip()
        normalized = canonicalize_plate(raw_query.replace("*", ""))
        sql_pattern = f"%{normalized}%"
        display_pattern = f"%{raw_query.upper()}%"

        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT * FROM `plate_records`
                    WHERE `plate_number` LIKE %s OR `plate_display` LIKE %s
                    ORDER BY `timestamp` ASC
                    """,
                    (sql_pattern, display_pattern),
                )
                rows = cursor.fetchall()

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            grouped[row["plate_number"]].append(dict(row))

        results: list[dict[str, Any]] = []
        for plate_number, records in grouped.items():
            records.sort(key=lambda item: item["timestamp"])
            first = records[0]
            last = records[-1]
            best = max(records, key=lambda item: item["quality_score"])
            results.append(
                {
                    "plate_number": plate_number,
                    "plate_display": first.get("plate_display")
                    or format_plate(plate_number),
                    "province": first.get("province") or province_name(plate_number),
                    "vehicle_type": first["vehicle_type"],
                    "plate_type": first["plate_type"],
                    "total_detections": len(records),
                    "distinct_videos": len({item["job_id"] for item in records}),
                    "first_seen": first["timestamp"],
                    "last_seen": last["timestamp"],
                    "best_crop_image_url": best["crop_image_url"],
                    "records": records,
                }
            )
        results.sort(key=lambda item: item["last_seen"], reverse=True)
        return results

    def delete_record(self, record_id: str) -> bool:
        """Delete a single plate record by ID."""
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM `plate_records` WHERE `id` = %s", (record_id,))
                return cursor.rowcount > 0

    def kpis(self) -> dict[str, Any]:
        with connection(self.database) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM `jobs`) AS total_videos,
                        (SELECT COUNT(*) FROM `plate_records`) AS total_plates,
                        (SELECT COUNT(DISTINCT `plate_number`)
                         FROM `plate_records`) AS unique_plates,
                        (SELECT AVG(`confidence_score`)
                         FROM `plate_records`) AS average_confidence
                    """
                )
                row = cursor.fetchone() or {}

        return {
            "total_videos": int(row.get("total_videos") or 0),
            "total_plates_detected": int(row.get("total_plates") or 0),
            "unique_plates_count": int(row.get("unique_plates") or 0),
            "avg_accuracy_pct": round(
                float(row.get("average_confidence") or 0.0) * 100.0, 2
            ),
        }


# Global repository instance
default_repo = PlateRepository()


def insert_video_job(data: Any) -> None:
    if isinstance(data, VideoJob):
        job = data
    elif isinstance(data, dict):
        job = VideoJob(
            id=data.get("id", ""),
            filename=data.get("filename", ""),
            file_size_bytes=int(data.get("file_size_bytes") or 0),
            stage=data.get("stage") or data.get("status") or "queued",
            stage_progress_pct=float(data.get("stage_progress_pct") or 0.0),
            overall_progress_pct=float(data.get("overall_progress_pct") or 0.0),
            total_frames=int(data.get("total_frames") or 0),
            processed_frames=int(data.get("processed_frames") or 0),
            duration_seconds=float(data.get("duration_seconds") or 0.0),
            current_fps=float(data.get("current_fps") or 0.0),
            eta_seconds=float(data.get("eta_seconds") or 0.0),
            detected_plates_count=int(data.get("detected_plates_count") or 0),
            video_url=data.get("video_url"),
            processed_video_url=data.get("processed_video_url"),
            error_message=data.get("error_message"),
            created_at=data.get("created_at") or datetime.now(timezone.utc).isoformat(),
            completed_at=data.get("completed_at"),
        )
    else:
        return
    default_repo.save_job(job)


def get_video_job(job_id: str) -> Optional[dict[str, Any]]:
    try:
        from api.video_manager import video_manager
        job = video_manager.get_job(job_id)
        if job:
            return job
    except Exception:
        pass
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `jobs` WHERE `id` = %s LIMIT 1", (job_id,))
            row = cursor.fetchone()
            return dict(row) if row else None


def list_video_jobs(limit: int = 100) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `jobs` ORDER BY `created_at` DESC LIMIT %s", (limit,))
            return [dict(row) for row in cursor.fetchall()]


def delete_video_job(job_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM `plate_records` WHERE `job_id` = %s", (job_id,))
            cursor.execute("DELETE FROM `jobs` WHERE `id` = %s", (job_id,))
            return cursor.rowcount > 0


def get_kpis() -> dict[str, Any]:
    return default_repo.kpis()


def list_records(query: Optional[str] = None, vehicle_type: Optional[str] = None, job_id: Optional[str] = None, limit: int = 500) -> list[dict[str, Any]]:
    return default_repo.list_records(query=query, vehicle_type=vehicle_type, job_id=job_id, limit=limit)


def list_plates(q: Optional[str] = None, vehicle_type: Optional[str] = None, job_id: Optional[str] = None, limit: int = 500) -> list[dict[str, Any]]:
    return default_repo.list_records(query=q, vehicle_type=vehicle_type, job_id=job_id, limit=limit)


def get_plate(plate_id: str) -> Optional[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `plate_records` WHERE `id` = %s", (plate_id,))
            row = cursor.fetchone()
            return dict(row) if row else None


def delete_plate(plate_id: str) -> bool:
    return default_repo.delete_record(plate_id)


def delete_plates(plate_ids: list[str]) -> int:
    if not plate_ids:
        return 0
    with connection() as conn:
        with conn.cursor() as cursor:
            placeholders = ", ".join(["%s"] * len(plate_ids))
            cursor.execute(f"DELETE FROM `plate_records` WHERE `id` IN ({placeholders})", plate_ids)
            return cursor.rowcount


def get_plate_trace(query_plate: str) -> list[dict[str, Any]]:
    return default_repo.trace(query_plate)


def insert_plate(data: dict[str, Any]) -> dict[str, Any]:
    norm = canonicalize_plate(data.get("plate_number", ""))
    display = data.get("plate_display") or format_plate(norm)
    rec_id = data.get("id") or f"rec-{uuid.uuid4().hex[:12]}"
    job_id = data.get("job_id") or ""
    job_fn = data.get("job_filename") or (job_id or "manual_entry")

    if job_id:
        with connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "INSERT IGNORE INTO `jobs` (`id`, `filename`, `stage`) VALUES (%s, %s, %s)",
                    (job_id, job_fn, "completed"),
                )

    record = PlateRecord(
        id=rec_id,
        job_id=job_id,
        job_filename=job_fn,
        track_id=int(data.get("track_id") or 0),
        plate_number=norm,
        plate_display=display,
        province=data.get("province") or province_name(norm),
        plate_type=data.get("plate_type", "white"),
        vehicle_type=data.get("vehicle_type", "car"),
        confidence_score=float(data.get("confidence_score") or 0.95),
        quality_score=float(data.get("quality_score") or 0.9),
        crop_image_url=data.get("crop_image_url", ""),
        pts_ms=int(data.get("pts_ms") or 0),
        video_time_str=data.get("video_time_str", "00:00"),
        timestamp=data.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        speed_kmh=float(data.get("speed_kmh")) if data.get("speed_kmh") is not None else None,
        video_url=data.get("video_url", ""),
        votes=int(data.get("votes") or 1),
        source=data.get("source", ""),
    )
    default_repo.save_record(record)
    return data


def delete_plate_record(record_id: str) -> bool:
    return default_repo.delete_record(record_id)


# ==============================================================================
# Parking Management Functions (MySQL)
# ==============================================================================

def list_cameras(
    camera_type: Optional[str] = None,
    is_active: Optional[int] = None,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if camera_type and camera_type != "ALL":
        clauses.append("`camera_type` = %s")
        params.append(camera_type)
    if is_active is not None:
        clauses.append("`is_active` = %s")
        params.append(int(is_active))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT * FROM `cameras` {where} ORDER BY `created_at` DESC",
                params,
            )
            return [dict(r) for r in cursor.fetchall()]


def get_camera(camera_id: str) -> Optional[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `cameras` WHERE `id` = %s", (camera_id,))
            row = cursor.fetchone()
            return dict(row) if row else None


def upsert_camera(camera_data: dict[str, Any]) -> dict[str, Any]:
    camera_data = dict(camera_data)
    now = datetime.now(timezone.utc).isoformat()
    camera_data["id"] = camera_data.get("id") or f"CAM-{uuid.uuid4().hex[:12]}"
    existing = get_camera(camera_data["id"])
    camera_data["created_at"] = (existing or {}).get("created_at") or now
    camera_data["updated_at"] = now
    fields = [
        "id", "name", "camera_type", "rtsp_url", "location", "resolution",
        "fps_limit", "is_active", "last_heartbeat", "created_at", "updated_at"
    ]
    vals = [camera_data.get(f) for f in fields]
    sql = f"""
    INSERT INTO `cameras` ({', '.join(f'`{f}`' for f in fields)})
    VALUES ({', '.join(['%s'] * len(fields))})
    ON DUPLICATE KEY UPDATE
        `name` = VALUES(`name`),
        `camera_type` = VALUES(`camera_type`),
        `rtsp_url` = VALUES(`rtsp_url`),
        `location` = VALUES(`location`),
        `resolution` = VALUES(`resolution`),
        `fps_limit` = VALUES(`fps_limit`),
        `is_active` = VALUES(`is_active`),
        `last_heartbeat` = VALUES(`last_heartbeat`),
        `updated_at` = VALUES(`updated_at`)
    """
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, vals)
    return camera_data


def delete_camera(camera_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM `cameras` WHERE `id` = %s", (camera_id,))
            return cursor.rowcount > 0


def list_residents(
    q: Optional[str] = None,
    apartment: Optional[str] = None,
    status: Optional[str] = None,
    apartment_query: Optional[str] = None,
    plate_query: Optional[str] = None,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if q:
        clauses.append(
            "(`plate_number` LIKE %s OR `plate_display` LIKE %s "
            "OR `owner_name` LIKE %s OR `apartment_number` LIKE %s)"
        )
        like = f"%{q}%"
        params.extend([like, like, like, like])
    apartment = apartment or apartment_query
    if apartment:
        clauses.append("`apartment_number` LIKE %s")
        params.append(f"%{apartment}%")
    if plate_query:
        clauses.append("(`plate_number` LIKE %s OR `plate_display` LIKE %s)")
        params.extend([f"%{plate_query}%", f"%{plate_query}%"])
    if status and status != "ALL":
        clauses.append("`status` = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT * FROM `resident_vehicles` {where} ORDER BY `created_at` DESC", params)
            return [dict(r) for r in cursor.fetchall()]


def upsert_resident_vehicle(data: dict[str, Any]) -> dict[str, Any]:
    data = dict(data)
    plate_norm = canonicalize_plate(data.get("plate_number") or "")
    if plate_norm:
        data["plate_number"] = plate_norm
        if not data.get("plate_display"):
            data["plate_display"] = format_plate(plate_norm)
    if not data.get("id"):
        data["id"] = f"RES-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now().isoformat()
    if not data.get("created_at"):
        data["created_at"] = now
    data["updated_at"] = now
    fields = [
        "id", "plate_number", "plate_display", "owner_name", "apartment_number",
        "phone_number", "vehicle_type", "rfid_card_id", "monthly_fee",
        "registered_at", "expiry_date", "status", "notes", "created_at", "updated_at"
    ]
    vals = [data.get(f) for f in fields]
    sql = f"""
    INSERT INTO `resident_vehicles` ({', '.join(f'`{f}`' for f in fields)})
    VALUES ({', '.join(['%s'] * len(fields))})
    ON DUPLICATE KEY UPDATE
        `owner_name` = VALUES(`owner_name`),
        `apartment_number` = VALUES(`apartment_number`),
        `phone_number` = VALUES(`phone_number`),
        `vehicle_type` = VALUES(`vehicle_type`),
        `rfid_card_id` = VALUES(`rfid_card_id`),
        `monthly_fee` = VALUES(`monthly_fee`),
        `expiry_date` = VALUES(`expiry_date`),
        `status` = VALUES(`status`),
        `notes` = VALUES(`notes`),
        `updated_at` = VALUES(`updated_at`)
    """
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, vals)
    return data


def delete_resident_vehicle(resident_id: str) -> bool:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM `resident_vehicles` WHERE `id` = %s OR `plate_number` = %s", (resident_id, resident_id))
            return cursor.rowcount > 0


def list_parking_sessions(
    status: Optional[str] = None,
    plate: Optional[str] = None,
    ticket_type: Optional[str] = None,
    apartment: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if status and status != "ALL":
        clauses.append("`status` = %s")
        params.append(status)
    if plate:
        clauses.append("(`plate_number` LIKE %s OR `plate_display` LIKE %s)")
        params.extend([f"%{plate}%", f"%{plate}%"])
    if ticket_type and ticket_type != "ALL":
        clauses.append("`ticket_type` = %s")
        params.append(ticket_type)
    if apartment:
        clauses.append("`apartment_number` LIKE %s")
        params.append(f"%{apartment}%")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(int(limit))
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT * FROM `parking_sessions` {where} ORDER BY `entry_time` DESC LIMIT %s", params)
            return [dict(r) for r in cursor.fetchall()]


def get_parking_session(session_id: str) -> Optional[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `parking_sessions` WHERE `id` = %s", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None


def upsert_parking_session(data: dict[str, Any]) -> dict[str, Any]:
    fields = [
        "id", "plate_number", "plate_display", "vehicle_type", "ticket_type", "status",
        "entry_time", "entry_camera_id", "entry_gate_name", "entry_snapshot_url",
        "entry_plate_crop_url", "entry_confidence", "exit_time", "exit_camera_id",
        "exit_gate_name", "exit_snapshot_url", "exit_plate_crop_url", "exit_plate_number",
        "is_plate_matched", "resident_id", "apartment_number", "resident_name",
        "duration_minutes", "parking_fee", "payment_status", "notes", "created_at", "updated_at"
    ]
    vals = [data.get(f) for f in fields]
    sql = f"""
    INSERT INTO `parking_sessions` ({', '.join(f'`{f}`' for f in fields)})
    VALUES ({', '.join(['%s'] * len(fields))})
    ON DUPLICATE KEY UPDATE
        `status` = VALUES(`status`),
        `exit_time` = VALUES(`exit_time`),
        `exit_camera_id` = VALUES(`exit_camera_id`),
        `exit_gate_name` = VALUES(`exit_gate_name`),
        `exit_snapshot_url` = VALUES(`exit_snapshot_url`),
        `exit_plate_crop_url` = VALUES(`exit_plate_crop_url`),
        `exit_plate_number` = VALUES(`exit_plate_number`),
        `is_plate_matched` = VALUES(`is_plate_matched`),
        `duration_minutes` = VALUES(`duration_minutes`),
        `parking_fee` = VALUES(`parking_fee`),
        `payment_status` = VALUES(`payment_status`),
        `updated_at` = VALUES(`updated_at`)
    """
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, vals)
    return data


def get_parking_dashboard_stats() -> dict[str, Any]:
    from datetime import timedelta
    from src.utils.settings_store import load_settings

    overstay_days = max(1, int(load_settings()["security"]["overstay_alert_days"]))
    cutoff = (datetime.now() - timedelta(days=overstay_days)).strftime("%Y-%m-%d %H:%M:%S")
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM `parking_sessions` WHERE `status` = 'PARKED') as currently_parked,
                    (SELECT COUNT(*) FROM `parking_sessions`
                        WHERE `status` = 'PARKED' AND `ticket_type` = 'RESIDENT') as resident_parked,
                    (SELECT COUNT(*) FROM `parking_sessions`
                        WHERE `status` = 'PARKED' AND `ticket_type` <> 'RESIDENT') as guest_parked,
                    (SELECT COUNT(*) FROM `parking_sessions` WHERE DATE(`entry_time`) = CURRENT_DATE) as entries_today,
                    (SELECT COUNT(*) FROM `parking_sessions` WHERE `status` = 'COMPLETED' AND DATE(`exit_time`) = CURRENT_DATE) as exits_today,
                    (SELECT COALESCE(SUM(`parking_fee`), 0) FROM `parking_sessions`
                        WHERE `status` = 'COMPLETED' AND DATE(`exit_time`) = CURRENT_DATE) as revenue_today_vnd,
                    (SELECT COUNT(*) FROM `resident_vehicles` WHERE `status` = 'ACTIVE') as total_registered_residents,
                    (SELECT COUNT(*) FROM `cameras`) as total_cameras,
                    (SELECT COUNT(*) FROM `cameras` WHERE `is_active` = 1) as active_cameras
                """
            )
            row = cursor.fetchone() or {}
    currently_parked = int(row.get("currently_parked") or 0)
    total_registered_residents = int(row.get("total_registered_residents") or 0)
    recent_sessions = list_parking_sessions(limit=10)
    return {
        "currently_parked": currently_parked,
        "resident_parked": int(row.get("resident_parked") or 0),
        "guest_parked": int(row.get("guest_parked") or 0),
        "entries_today": int(row.get("entries_today") or 0),
        "exits_today": int(row.get("exits_today") or 0),
        "revenue_today_vnd": int(row.get("revenue_today_vnd") or 0),
        "total_registered_residents": total_registered_residents,
        "total_cameras": int(row.get("total_cameras") or 0),
        "active_cameras": int(row.get("active_cameras") or 0),
        "recent_sessions": recent_sessions,
        # Backward-compatible aliases for older consumers.
        "total_parked": currently_parked,
        "total_residents": total_registered_residents,
    }


def notify_realtime(event: str, data: Any = None) -> None:
    """Safely notify realtime WebSocket manager if active."""
    try:
        from api.realtime import realtime_manager
        realtime_manager.broadcast_sync(event, data if data is not None else {})
    except Exception:
        pass


def get_resident_by_plate(plate_number: str) -> Optional[dict[str, Any]]:
    norm = canonicalize_plate(plate_number)
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM `resident_vehicles` WHERE `plate_number` = %s LIMIT 1", (norm,))
            row = cursor.fetchone()
            return dict(row) if row else None


def calculate_parking_fee(
    vehicle_type: str,
    ticket_type: str,
    duration_minutes: int,
    entry_time: Optional[Any] = None,
) -> int:
    if ticket_type == "RESIDENT":
        return 0

    try:
        from src.utils.settings_store import load_settings
        st = load_settings().get("parking", {})
    except Exception:
        st = {}

    grace = int(st.get("grace_period_minutes", 15))
    if duration_minutes <= grace:
        return 0

    tariff = st.get("tariff", {})
    motorcycle_day = int(tariff.get("motorcycle_day", 3000))
    motorcycle_night = int(tariff.get("motorcycle_night", 6000))
    car_first_2h = int(tariff.get("car_first_2h", 20000))
    car_extra_hour = int(tariff.get("car_extra_hour", 10000))

    is_night = False
    if entry_time is not None:
        if isinstance(entry_time, str):
            try:
                dt = datetime.fromisoformat(entry_time.replace("Z", "+00:00"))
                h = dt.hour
            except Exception:
                h = 12
        elif isinstance(entry_time, datetime):
            h = entry_time.hour
        else:
            h = getattr(entry_time, "hour", 12)
        day_h = int(str(st.get("day_start", "06:00")).split(":")[0])
        night_h = int(str(st.get("night_start", "22:00")).split(":")[0])
        if h < day_h or h >= night_h:
            is_night = True

    if vehicle_type in ("motorcycle", "electric_bike", "bicycle"):
        return motorcycle_night if is_night else motorcycle_day

    # Car
    if duration_minutes <= 120:
        return car_first_2h
    extra_minutes = duration_minutes - 120
    extra_hours = math.ceil(extra_minutes / 60)
    return car_first_2h + (extra_hours * car_extra_hour)


def check_in_vehicle(
    plate_number: str,
    entry_snapshot_url: str,
    entry_plate_crop_url: str = "",
    entry_camera_id: Optional[str] = "CAM-IN-01",
    entry_gate_name: str = "Cổng Vào Làn 1",
    vehicle_type: str = "car",
    confidence: float = 0.95,
    notes: Optional[str] = None,
) -> dict[str, Any]:
    norm = canonicalize_plate(plate_number)
    display = format_plate(norm)
    now_dt = datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    now_iso = now_dt.isoformat()

    resident = get_resident_by_plate(norm)
    is_resident = resident is not None and resident.get("status") == "ACTIVE"

    ticket_type = "RESIDENT" if is_resident else "GUEST"
    resident_id = resident["id"] if is_resident else None
    apt_number = resident["apartment_number"] if is_resident else None
    res_name = resident["owner_name"] if is_resident else None
    veh_type = resident["vehicle_type"] if is_resident else vehicle_type

    session_id = f"PARK-{now_dt.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

    session_data = {
        "id": session_id,
        "plate_number": norm,
        "plate_display": display,
        "vehicle_type": veh_type,
        "ticket_type": ticket_type,
        "status": "PARKED",
        "entry_time": now_str,
        "entry_camera_id": entry_camera_id,
        "entry_gate_name": entry_gate_name,
        "entry_snapshot_url": entry_snapshot_url,
        "entry_plate_crop_url": entry_plate_crop_url,
        "entry_confidence": confidence,
        "exit_time": None,
        "exit_camera_id": None,
        "exit_gate_name": None,
        "exit_snapshot_url": None,
        "exit_plate_crop_url": None,
        "exit_plate_number": None,
        "is_plate_matched": None,
        "resident_id": resident_id,
        "apartment_number": apt_number,
        "resident_name": res_name,
        "duration_minutes": 0,
        "parking_fee": 0,
        "payment_status": "FREE_RESIDENT" if is_resident else "UNPAID",
        "notes": notes or ("Xe Cư Dân Chung Cư" if is_resident else "Khách vãng lai"),
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    upsert_parking_session(session_data)
    notify_realtime("parking_updated", {"action": "check_in", "session": session_data})
    notify_realtime("parking_check_in", session_data)
    notify_realtime("kpis_updated")
    return session_data


def check_out_vehicle(
    plate_number: str,
    exit_snapshot_url: str,
    exit_plate_crop_url: str = "",
    exit_camera_id: Optional[str] = "CAM-OUT-01",
    exit_gate_name: str = "Cổng Ra Làn 1",
    session_id: Optional[str] = None,
    notes: Optional[str] = None,
    exit_vehicle_type: Optional[str] = None,
) -> dict[str, Any]:
    norm = canonicalize_plate(plate_number)
    now_dt = datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    now_iso = now_dt.isoformat()

    session = None
    if session_id:
        session = get_parking_session(session_id)
        if not session or session.get("status") != "PARKED":
            raise ValueError("Phiên gửi xe không tồn tại hoặc xe đã ra bãi.")
    if not session:
        sessions = list_parking_sessions(status="PARKED", plate=norm, limit=1)
        if sessions:
            session = sessions[0]

    if not session:
        raise ValueError(f"Không tìm thấy xe đang trong bãi với biển số '{norm}'.")

    entry_time_str = session["entry_time"]
    entry_dt = None
    try:
        from datetime import datetime as dt_cls
        entry_dt = dt_cls.strptime(entry_time_str, "%Y-%m-%d %H:%M:%S")
        delta = now_dt - entry_dt
        duration_minutes = max(1, int(delta.total_seconds() / 60))
    except Exception:
        duration_minutes = 30

    if exit_vehicle_type:
        session["vehicle_type"] = exit_vehicle_type

    fee = calculate_parking_fee(
        vehicle_type=session.get("vehicle_type", "car"),
        ticket_type=session.get("ticket_type", "GUEST"),
        duration_minutes=duration_minutes,
        entry_time=entry_dt,
    )

    is_matched = norm == canonicalize_plate(session["plate_number"])
    session["status"] = "COMPLETED"
    session["exit_time"] = now_str
    session["exit_camera_id"] = exit_camera_id
    session["exit_gate_name"] = exit_gate_name
    session["exit_snapshot_url"] = exit_snapshot_url
    session["exit_plate_crop_url"] = exit_plate_crop_url
    session["exit_plate_number"] = norm
    session["is_plate_matched"] = 1 if is_matched else 0
    session["duration_minutes"] = duration_minutes
    session["parking_fee"] = fee
    session["payment_status"] = "FREE_RESIDENT" if session.get("ticket_type") == "RESIDENT" else "PAID"
    session["updated_at"] = now_iso
    if notes:
        session["notes"] = f"{session.get('notes') or ''} | {notes}"

    upsert_parking_session(session)
    notify_realtime("parking_updated", {"action": "check_out", "session": session})
    notify_realtime("parking_check_out", session)
    notify_realtime("kpis_updated")
    return session
