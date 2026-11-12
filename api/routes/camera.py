"""Live camera endpoints consumed by the Next.js dashboard."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from api.camera_manager import (
    MJPEG_BOUNDARY,
    TERMINAL_STATES,
    CameraManager,
    CameraStartOptions,
)

router = APIRouter(prefix="/api/cameras", tags=["Cameras"])
manager = CameraManager()


class StartCameraRequest(BaseModel):
    source: str = "0"
    camera_name: str | None = None
    min_votes: int = Field(default=2, ge=1, le=20)
    max_frames: int | None = Field(default=None, ge=1)
    duration_seconds: float | None = Field(default=None, gt=0)
    reconnect_attempts: int = Field(default=10, ge=-1, le=1000)
    save_db: bool = False
    save_video: bool = False
    stream_max_fps: float = Field(default=12.0, ge=1, le=30)
    ocr_mode: Literal["hybrid", "easyocr", "char"] = "char"
    stride: int = Field(default=1, ge=1, le=5)


@router.post("/start")
def start_camera(request: StartCameraRequest) -> dict:
    options = CameraStartOptions(
        source=request.source,
        camera_name=request.camera_name,
        min_votes=request.min_votes,
        max_frames=request.max_frames,
        duration_seconds=request.duration_seconds,
        reconnect_attempts=request.reconnect_attempts,
        save_db=request.save_db,
        save_video=request.save_video,
        stream_max_fps=request.stream_max_fps,
        ocr_mode=request.ocr_mode,
        stride=request.stride,
    )
    session = manager.start(options)
    return {"ok": True, "session": session.to_dict()}


@router.post("/stop")
def stop_camera(session_id: str | None = None) -> dict:
    try:
        session = manager.stop(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Camera session not found") from exc
    return {"ok": True, "session": session.to_dict() if session else None}


@router.get("/status")
def camera_status() -> dict:
    session = manager.current
    active = bool(session and session.status not in TERMINAL_STATES)
    return {
        "active": active,
        "session": session.to_dict() if session else None,
    }


@router.get("/records")
def camera_records() -> dict:
    session = manager.current
    return {"records": session.records() if session else []}


@router.get("/snapshot")
def camera_snapshot() -> Response:
    session = manager.current
    if session is None or not session.latest_jpeg:
        raise HTTPException(status_code=404, detail="No camera frame available")
    return Response(content=session.latest_jpeg, media_type="image/jpeg")


@router.get("/stream")
def camera_stream() -> StreamingResponse:
    session = manager.current
    if session is None:
        raise HTTPException(status_code=404, detail="No camera session")
    return StreamingResponse(
        session.mjpeg_frames(),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY.decode()}",
    )
