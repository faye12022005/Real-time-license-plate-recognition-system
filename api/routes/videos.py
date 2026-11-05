"""Video management and processing endpoints."""

import datetime
import shutil
import time
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from config.settings import SAMPLES_DIR
from src.database.repository import get_video_job, insert_video_job, list_video_jobs
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

