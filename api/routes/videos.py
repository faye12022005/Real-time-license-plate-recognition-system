"""Video upload and background processing endpoints."""

from __future__ import annotations

import mimetypes
import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from api.video_manager import VideoUploadOptions, video_manager
from config import settings
from api.serializers import job_payload, record_payload, media_url
from src.database.repository import (
    get_video_job, list_video_jobs, list_plates, delete_video_job, notify_realtime,
)

router = APIRouter(prefix="/api/v1/videos", tags=["Videos"])

VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
}
MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024


@router.post("/upload")
def upload_video(
    file: UploadFile = File(...),
    save_db: bool = Query(default=True),
) -> dict:
    """Persist an uploaded video and queue it for AI processing."""
    settings.ensure_directories()
    filename = Path(file.filename or "upload.mp4").name
    suffix = Path(filename).suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported video format. Allowed: "
                + ", ".join(sorted(VIDEO_EXTENSIONS))
            ),
        )

    target = settings.UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"

    total = 0
    try:
        with target.open("wb") as handle:
            while True:
                chunk = file.file.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Video exceeds the 1 GB upload limit.",
                    )
                handle.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception as exc:  # noqa: BLE001 - report storage failures clearly
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not save upload: {exc}") from exc
    finally:
        file.file.close()

    job = video_manager.submit(
        target,
        filename=filename,
        options=VideoUploadOptions(save_db=save_db),
    )
    return {
        "job_id": job["id"],
        "job": job,
        "video_url": job["video_url"],
    }


@router.get("/jobs")
def list_jobs(limit: int = Query(default=100, ge=1, le=500)) -> list[dict]:
    jobs = {j["id"]: j for j in list_video_jobs(limit)}
    jobs.update({j["id"]: j for j in video_manager.list_jobs(limit)})
    return [job_payload(j) for j in sorted(jobs.values(), key=lambda j: j["created_at"], reverse=True)[:limit]]


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = get_video_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return job_payload(job)


@router.get("/jobs/{job_id}/records")
def get_job_records(job_id: str) -> list[dict]:
    records = video_manager.get_records(job_id)
    if records is None:
        if get_video_job(job_id) is None:
            raise HTTPException(status_code=404, detail="Video job not found.")
        records = [record_payload(r) for r in list_plates(job_id=job_id)]
    return records


def _uploaded_path(job: dict) -> Path | None:
    url = media_url(job.get("video_url"))
    prefix = "/static/uploads/"
    if not url.startswith(prefix):
        return None
    path = (settings.UPLOAD_DIR / url[len(prefix):]).resolve()
    return path if path.is_relative_to(settings.UPLOAD_DIR.resolve()) else None


class DeleteJobsRequest(BaseModel):
    job_ids: list[str]


def _delete_jobs(job_ids: list[str]) -> int:
    jobs = {j: get_video_job(j) for j in dict.fromkeys(job_ids)}
    try:
        video_manager.remove_jobs(list(jobs))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    deleted = 0
    for job_id, job in jobs.items():
        if job is None:
            continue
        delete_video_job(job_id)
        path = _uploaded_path(job)
        if path:
            path.unlink(missing_ok=True)
        # Only the per-job managed output directory belongs to this upload.
        output = (settings.OUTPUT_DIR / f"upload_{job_id}").resolve()
        if output.parent == settings.OUTPUT_DIR.resolve() and output.is_dir():
            shutil.rmtree(output)
        notify_realtime("video_job_deleted", {"job_id": job_id})
        deleted += 1
    if deleted:
        notify_realtime("kpis_updated")
    return deleted


@router.post("/jobs/delete")
def delete_jobs(payload: DeleteJobsRequest) -> dict:
    return {"deleted_count": _delete_jobs(payload.job_ids), "requested_count": len(payload.job_ids)}


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> dict:
    if not _delete_jobs([job_id]):
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ video.")
    return {"status": "success", "deleted": True, "job_id": job_id}


@router.get("/{job_id}/file")
def get_video_file(job_id: str) -> FileResponse:
    path = video_manager.video_path(job_id)
    if path is None:
        path = _uploaded_path(get_video_job(job_id) or {})
    if path is None or not path.is_file():
        raise HTTPException(status_code=404, detail="Uploaded video not found.")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)
