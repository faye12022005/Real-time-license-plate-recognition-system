"""Queued video upload jobs exposed to the web dashboard."""

from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from api.serializers import record_payload
from config import settings
from src.models import PlateRecord, VideoJob

TERMINAL_STAGES = {"COMPLETED", "FAILED", "CANCELLED"}
JOB_FIELDS = (
    "stage",
    "stage_progress_pct",
    "overall_progress_pct",
    "total_frames",
    "processed_frames",
    "duration_seconds",
    "current_fps",
    "eta_seconds",
    "detected_plates_count",
    "error_message",
    "completed_at",
)


@dataclass
class VideoUploadOptions:
    """Processing options for an uploaded video."""

    save_db: bool = False
    ocr_mode: str = "hybrid"
    stride: int = 1
    min_votes: int = settings.MIN_PLATE_VOTES


class VideoJobManager:
    """Process uploaded videos sequentially in a background worker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._queue: queue.Queue[Optional[str]] = queue.Queue()
        self._jobs: dict[str, dict] = {}
        self._paths: dict[str, Path] = {}
        self._options: dict[str, VideoUploadOptions] = {}
        self._records: dict[str, list[PlateRecord]] = {}
        self._worker = threading.Thread(
            target=self._run, name="video-upload-worker", daemon=True
        )
        self._worker.start()

    def submit(
        self,
        video_path: str | Path,
        filename: str,
        options: VideoUploadOptions | None = None,
    ) -> dict:
        """Register an uploaded file and queue it for processing."""
        path = Path(video_path).resolve()
        job_id = f"job-{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "id": job_id,
            "filename": filename,
            "file_size_bytes": path.stat().st_size,
            "stage": "QUEUED",
            "stage_progress_pct": 0.0,
            "overall_progress_pct": 0.0,
            "total_frames": 0,
            "processed_frames": 0,
            "duration_seconds": 0.0,
            "current_fps": 0.0,
            "eta_seconds": 0.0,
            "detected_plates_count": 0,
            "video_url": self._video_url(job_id),
            "error_message": None,
            "created_at": now,
            "completed_at": None,
        }
        with self._lock:
            self._jobs[job_id] = job
            self._paths[job_id] = path
            self._options[job_id] = options or VideoUploadOptions()
        self._queue.put(job_id)
        return dict(job)

    def list_jobs(self, limit: int = 100) -> list[dict]:
        """Return jobs newest first."""
        with self._lock:
            jobs = list(self._jobs.values())[-max(1, limit) :]
        return [dict(job) for job in reversed(jobs)]

    def get_job(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def get_records(self, job_id: str) -> list[dict] | None:
        with self._lock:
            if job_id not in self._jobs:
                return None
            records = list(self._records.get(job_id, []))
        return [record_payload(record) for record in records]

    def latest_records(self, limit: int = 500) -> list[dict]:
        """Return records across all jobs, newest jobs first."""
        with self._lock:
            job_ids = list(self._jobs.keys())[::-1]
            records: list[PlateRecord] = []
            for job_id in job_ids:
                records.extend(self._records.get(job_id, []))
        return [record_payload(record) for record in records[: max(1, limit)]]

    def video_path(self, job_id: str) -> Path | None:
        with self._lock:
            if job_id not in self._jobs:
                return None
            path = self._paths.get(job_id)
        if path is None or not path.exists():
            return None
        return path

    def analytics(self) -> dict:
        with self._lock:
            jobs = list(self._jobs.values())
            records = [
                record
                for job_id, items in self._records.items()
                for record in items
            ]
        total_jobs = len(jobs)
        completed = sum(1 for job in jobs if job["stage"] == "COMPLETED")
        processing = sum(
            1 for job in jobs if job["stage"] in {"QUEUED", "PROCESSING"}
        )
        failed = sum(1 for job in jobs if job["stage"] == "FAILED")
        unique_plates = len({record.plate_number for record in records})
        avg_confidence = (
            sum(float(record.confidence_score) for record in records) / len(records)
            if records
            else 0.0
        )
        return {
            "total_jobs": total_jobs,
            "completed_jobs": completed,
            "processing_jobs": processing,
            "failed_jobs": failed,
            "total_records": len(records),
            "unique_plates": unique_plates,
            "average_confidence": round(avg_confidence, 5),
        }

    def _run(self) -> None:
        while True:
            job_id = self._queue.get()
            if job_id is None:
                return
            try:
                self._process(job_id)
            finally:
                self._queue.task_done()

    def _process(self, job_id: str) -> None:
        with self._lock:
            path = self._paths.get(job_id)
            options = self._options.get(job_id, VideoUploadOptions())
            display_name = self._jobs[job_id]["filename"]
            if path is None:
                self._update_locked(
                    job_id,
                    stage="FAILED",
                    error_message="Uploaded video file is missing.",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )
                return
            self._update_locked(
                job_id,
                stage="PROCESSING",
                stage_progress_pct=0.0,
                overall_progress_pct=0.0,
            )

        try:
            from src.pipeline.alpr_pipeline import ALPRPipeline

            pipeline = ALPRPipeline(
                ocr_mode=options.ocr_mode,
                stride=options.stride,
                min_votes=options.min_votes,
                save_crops=True,
            )
            result = pipeline.process_video(
                video_path=path,
                output_dir=settings.OUTPUT_DIR / f"upload_{job_id}",
                save_annotated=False,
                display=False,
                save_db=options.save_db,
                job_id=job_id,
                progress_callback=self._on_progress,
                display_name=display_name,
            )
            with self._lock:
                job = self._jobs[job_id]
                records = list(result.records)
                for record in records:
                    record.job_filename = job["filename"]
                self._records[job_id] = records
                for field_name in JOB_FIELDS:
                    job[field_name] = getattr(result.job, field_name)
                job["stage"] = result.job.stage
                job["video_url"] = self._video_url(job_id)
        except Exception as exc:  # noqa: BLE001 - surfaced through the job API
            with self._lock:
                self._update_locked(
                    job_id,
                    stage="FAILED",
                    error_message=str(exc),
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )

    def _on_progress(self, job: VideoJob) -> None:
        with self._lock:
            target = self._jobs.get(job.id)
            if target is None:
                return
            for field_name in JOB_FIELDS:
                if field_name == "stage" and job.stage == "COMPLETED":
                    continue
                target[field_name] = getattr(job, field_name)
            target["video_url"] = self._video_url(job.id)

    def _update_locked(self, job_id: str, **updates) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        job.update(updates)
        job["video_url"] = self._video_url(job_id)

    @staticmethod
    def _video_url(job_id: str) -> str:
        return f"/api/v1/videos/{job_id}/file"


video_manager = VideoJobManager()
