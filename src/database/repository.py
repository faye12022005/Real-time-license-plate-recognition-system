"""CRUD operations for vehicle entry and exit history in MySQL."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from src.database.connection import connection, init_db
from src.models import PlateRecord, VideoJob
from src.utils.plate_validator import canonicalize_plate, format_plate, province_name

UPSERT_JOB_SQL = """
INSERT INTO `jobs` (
    `id`, `filename`, `file_size_bytes`, `stage`, `stage_progress_pct`,
    `overall_progress_pct`, `total_frames`, `processed_frames`,
    `duration_seconds`, `current_fps`, `eta_seconds`,
    `detected_plates_count`, `video_url`, `error_message`,
    `created_at`, `completed_at`
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    `stage` = VALUES(`stage`),
    `stage_progress_pct` = VALUES(`stage_progress_pct`),
    `overall_progress_pct` = VALUES(`overall_progress_pct`),
    `total_frames` = VALUES(`total_frames`),
    `processed_frames` = VALUES(`processed_frames`),
    `current_fps` = VALUES(`current_fps`),
    `eta_seconds` = VALUES(`eta_seconds`),
    `detected_plates_count` = VALUES(`detected_plates_count`),
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
