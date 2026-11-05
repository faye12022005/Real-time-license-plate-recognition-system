"""Video management and processing endpoints."""

import datetime
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from config.settings import CAPTURES_DIR, SAMPLES_DIR
from src.database.repository import delete_video_job, delete_video_jobs, get_video_job, insert_video_job, list_video_jobs
from src.pipeline.alpr_pipeline import ALPRPipeline

router = APIRouter(prefix="/videos", tags=["Videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}


def run_pipeline_task(job_id: str, video_path: Path):
    """Background task runner for ALPR pipeline."""
    pipeline = ALPRPipeline()
    pipeline.process_video_job(job_id, video_path)


@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a video file and trigger background ALPR analysis.

    Returns:
        JSON with 'job_id'.
    """
    if not file.filename:
        raise HTTPException(status_code=422, detail="Tên tệp không hợp lệ")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Định dạng tệp không được hỗ trợ ({ext}). Chỉ chấp nhận .mp4, .mkv, .avi, .mov, .webm",
        )

    # Generate job ID and safe filename
    job_id = f"job-{int(time.time() * 1000)}"
    safe_filename = f"{job_id}_{file.filename}"
    saved_path = SAMPLES_DIR / safe_filename

    # Save uploaded bytes to disk
    try:
        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu file: {str(e)}")

    file_size = saved_path.stat().st_size
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Initial VideoJob record
    job_record = {
        "id": job_id,
        "filename": file.filename,
        "file_size_bytes": file_size,
        "stage": "UPLOADED",
        "stage_progress_pct": 0.0,
        "overall_progress_pct": 5.0,
        "total_frames": 0,
        "processed_frames": 0,
        "duration_seconds": 0.0,
        "current_fps": 0.0,
        "eta_seconds": 0.0,
        "detected_plates_count": 0,
        "video_url": f"/static/videos/{safe_filename}",
        "processed_video_url": None,
        "error_message": None,
        "created_at": now_iso,
        "completed_at": None,
    }
    insert_video_job(job_record)

    # Launch background processing
    background_tasks.add_task(run_pipeline_task, job_id, saved_path)

    return {"job_id": job_id}


@router.get("/jobs")
def get_jobs():
    """Retrieve list of all video processing jobs."""
    return list_video_jobs()


@router.get("/jobs/{job_id}")
def get_job_by_id(job_id: str):
    """Retrieve details of a single video processing job."""
    job = get_video_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ video")
    return job


@router.get("/jobs/{job_id}/plates")
def get_plates_by_job_id(job_id: str):
    """Retrieve all plate records detected in a specific video job."""
    from src.database.repository import list_plates
    return list_plates(job_id=job_id)


class VideoJobDeleteRequest(BaseModel):
    """Payload for deleting multiple uploaded video jobs."""
    job_ids: List[str]


def _delete_job_files(job_id: str, job: Dict[str, Any]) -> None:
    """Delete files created for a video job (original, annotated, crops)."""
    import shutil

    filename = job.get("filename") or ""
    if filename:
        safe_filename = f"{job_id}_{filename}"
        original_path = SAMPLES_DIR / safe_filename
        if original_path.is_file():
            original_path.unlink(missing_ok=True)

        annotated_filename = f"annotated_{filename}"
        if not annotated_filename.lower().endswith(".mp4"):
            annotated_filename = f"{Path(annotated_filename).stem}.mp4"
        annotated_path = SAMPLES_DIR / annotated_filename
        if annotated_path.is_file():
            annotated_path.unlink(missing_ok=True)

    captures_dir = CAPTURES_DIR / job_id
    if captures_dir.exists() and captures_dir.is_dir():
        shutil.rmtree(captures_dir, ignore_errors=True)


@router.delete("/jobs/{job_id}")
def delete_video_job_endpoint(job_id: str):
    """Delete one uploaded video job, its DB records, and related files."""
    job = get_video_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ video")

    deleted = delete_video_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ video")

    file_errors: List[str] = []
    try:
        _delete_job_files(job_id, job)
    except Exception as exc:
        file_errors.append(str(exc))

    return {
        "status": "success",
        "job_id": job_id,
        "deleted": True,
        "file_errors": file_errors,
    }


@router.delete("/jobs")
def delete_multiple_video_jobs(job_ids: List[str] = Query(..., description="Danh sách job_id cần xóa")):
    """Delete multiple uploaded video jobs by query list."""
    results: List[Dict[str, Any]] = []
    deleted_count = 0

    for job_id in job_ids:
        job = get_video_job(job_id)
        if not job:
            results.append({"job_id": job_id, "deleted": False, "reason": "not_found"})
            continue

        deleted = delete_video_job(job_id)
        file_errors: List[str] = []
        if deleted:
            deleted_count += 1
            try:
                _delete_job_files(job_id, job)
            except Exception as exc:
                file_errors.append(str(exc))

        results.append(
            {
                "job_id": job_id,
                "deleted": deleted,
                "file_errors": file_errors,
            }
        )

    return {
        "status": "success",
        "deleted_count": deleted_count,
        "requested_count": len(job_ids),
        "results": results,
    }


@router.post("/jobs/delete")
def delete_multiple_video_jobs_body(payload: VideoJobDeleteRequest):
    """Delete multiple uploaded video jobs from JSON body."""
    return delete_multiple_video_jobs(job_ids=payload.job_ids)

