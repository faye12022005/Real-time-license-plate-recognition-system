"""CRUD operations for vehicle entry and exit history."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

from src.database.connection import connection, init_db
from src.models import PlateRecord, VideoJob
from src.utils.plate_validator import canonicalize_plate, format_plate, province_name


class PlateRepository:
    """Persistence layer for video jobs and plate observations."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = db_path
        init_db(db_path)

    def save_job(self, job: VideoJob) -> None:
        with connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    id, filename, file_size_bytes, stage, stage_progress_pct,
                    overall_progress_pct, total_frames, processed_frames,
                    duration_seconds, current_fps, eta_seconds,
                    detected_plates_count, video_url, error_message,
                    created_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    stage = excluded.stage,
                    stage_progress_pct = excluded.stage_progress_pct,
                    overall_progress_pct = excluded.overall_progress_pct,
                    total_frames = excluded.total_frames,
                    processed_frames = excluded.processed_frames,
                    current_fps = excluded.current_fps,
                    eta_seconds = excluded.eta_seconds,
                    detected_plates_count = excluded.detected_plates_count,
                    error_message = excluded.error_message,
                    completed_at = excluded.completed_at
                """,
                (
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
                ),
            )

    def save_record(self, record: PlateRecord) -> None:
        with connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO plate_records (
                    id, job_id, job_filename, track_id, plate_number,
                    plate_display, province, plate_type, vehicle_type,
                    confidence_score, quality_score, crop_image_url, pts_ms,
                    video_time_str, timestamp, speed_kmh, video_url, votes, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
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
                ),
            )

    def save_records(self, records: list[PlateRecord]) -> None:
        for record in records:
            self.save_record(record)

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
            clauses.append("(plate_number LIKE ? OR plate_display LIKE ?)")
            parameters.extend([f"%{normalized}%", f"%{query.upper()}%"])
        if vehicle_type and vehicle_type != "all":
            clauses.append("vehicle_type = ?")
            parameters.append(vehicle_type)
        if job_id:
            clauses.append("job_id = ?")
            parameters.append(job_id)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.append(int(limit))
        with connection(self.db_path) as conn:
            rows = conn.execute(
                f"SELECT * FROM plate_records {where} "
                "ORDER BY timestamp DESC LIMIT ?",
                parameters,
            ).fetchall()
        return [dict(row) for row in rows]

    def trace(self, plate_query: str) -> list[dict[str, Any]]:
        """Group all observations matching a plate or wildcard query."""
        if not plate_query or not plate_query.strip():
            return []

        raw_query = plate_query.strip()
        normalized = canonicalize_plate(raw_query.replace("*", ""))
        sql_pattern = f"%{normalized}%"
        display_pattern = f"%{raw_query.upper()}%"

        with connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM plate_records
                WHERE plate_number LIKE ? OR plate_display LIKE ?
                ORDER BY timestamp ASC
                """,
                (sql_pattern, display_pattern),
            ).fetchall()

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
        with connection(self.db_path) as conn:
            total_videos = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
            total_plates = conn.execute("SELECT COUNT(*) FROM plate_records").fetchone()[0]
            unique_plates = conn.execute(
                "SELECT COUNT(DISTINCT plate_number) FROM plate_records"
            ).fetchone()[0]
            average_confidence = conn.execute(
                "SELECT AVG(confidence_score) FROM plate_records"
            ).fetchone()[0]
        return {
            "total_videos": int(total_videos or 0),
            "total_plates_detected": int(total_plates or 0),
            "unique_plates_count": int(unique_plates or 0),
            "avg_accuracy_pct": round(float(average_confidence or 0.0) * 100.0, 2),
        }
