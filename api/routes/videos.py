"""Video upload and background processing endpoints."""

from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from api.video_manager import VideoUploadOptions, video_manager
from config import settings

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
    save_db: bool = Query(default=False),
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
    return video_manager.list_jobs(limit=limit)


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = video_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return job


@router.get("/jobs/{job_id}/records")
def get_job_records(job_id: str) -> list[dict]:
    records = video_manager.get_records(job_id)
    if records is None:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return records


@router.get("/{job_id}/file")
def get_video_file(job_id: str) -> FileResponse:
    path = video_manager.video_path(job_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Uploaded video not found.")
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type)
