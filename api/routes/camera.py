"""Live camera endpoints consumed by the Next.js dashboard."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from api.camera_manager import (
    MJPEG_BOUNDARY,
    TERMINAL_STATES,
    CameraManager,
    CameraStartOptions,
)
from api.camera_preview import (
    DEFAULT_SCAN_LIMIT,
    MAX_PREVIEWS,
    MAX_SCAN_LIMIT,
    PREVIEW_JPEG_QUALITY,
    PREVIEW_MAX_FPS,
    PreviewError,
    PreviewLimitError,
    discover_local_cameras,
    preview_manager,
)
from src.utils.camera_store import (
    load_saved_cameras,
    remove_camera,
    save_camera,
    test_stream_connection,
)
from src.utils.source import parse_camera_source

router = APIRouter(prefix="/api/cameras", tags=["Cameras"])
manager = CameraManager()


class StartCameraRequest(BaseModel):
    source: str = "0"
    sources: list[str] = Field(default_factory=list)
    camera_name: str | None = None
    min_votes: int = Field(default=2, ge=1, le=20)
    max_frames: int | None = Field(default=None, ge=1)
    duration_seconds: float | None = Field(default=None, gt=0)
    reconnect_attempts: int = Field(default=10, ge=-1, le=1000)
    save_db: bool = True
    save_video: bool = False
    stream_max_fps: float = Field(default=12.0, ge=1, le=30)
    ocr_mode: Literal["hybrid", "easyocr", "char"] = "char"
    stride: int = Field(default=1, ge=1, le=5)


class SyncCamerasRequest(BaseModel):
    sources: list[str] = Field(default_factory=list)
    camera_name: str | None = None
    min_votes: int = Field(default=2, ge=1, le=20)
    max_frames: int | None = Field(default=None, ge=1)
    duration_seconds: float | None = Field(default=None, gt=0)
    reconnect_attempts: int = Field(default=10, ge=-1, le=1000)
    save_db: bool = False
    save_video: bool = False
    stream_max_fps: float = Field(default=12.0, ge=1, le=30)
    ocr_mode: Literal["hybrid", "easyocr", "char"] = "char"
    stride: int = Field(default=2, ge=1, le=5)


class UpdateConfigRequest(BaseModel):
    min_votes: int | None = Field(default=None, ge=1, le=20)
    duration_seconds: float | None = None
    save_db: bool | None = None
    save_video: bool | None = None
    stream_max_fps: float | None = Field(default=None, ge=1, le=30)
    ocr_mode: Literal["hybrid", "easyocr", "char"] | None = None
    stride: int | None = Field(default=None, ge=1, le=5)


class StartPreviewRequest(BaseModel):
    indices: list[int] = Field(..., min_length=1, max_length=MAX_PREVIEWS)
    max_fps: float = Field(default=PREVIEW_MAX_FPS, ge=1, le=15)
    jpeg_quality: int = Field(default=PREVIEW_JPEG_QUALITY, ge=30, le=95)


class StopPreviewRequest(BaseModel):
    indices: list[int] | None = None


class TestStreamRequest(BaseModel):
    url: str
    timeout_seconds: float = Field(default=6.0, ge=1.0, le=20.0)


class ConfiguredCameraCreate(BaseModel):
    name: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    camera_type: str = "ENTRY"
    location: str = "Cổng vào"
    resolution: str = "1920x1080"
    fps_limit: int = 25


def _active_ai_camera_indices() -> set[int]:
    """Return local camera indices owned by running AI sessions."""
    indices: set[int] = set()
    for session in manager.active_sessions():
        if isinstance(session.source, int):
            indices.add(session.source)
    return indices


@router.get("/discover", summary="Quét camera cục bộ & camera đã cấu hình")
def discover_cameras(
    max_index: int = Query(DEFAULT_SCAN_LIMIT, ge=1, le=MAX_SCAN_LIMIT),
    refresh: bool = False,
) -> dict:
    """Probe local camera indexes and return configured HTTP/RTSP cameras.

    Cameras used by active AI sessions are marked in_use.
    """
    ai_indices = _active_ai_camera_indices()
    payload = discover_local_cameras(
        max_index=max_index,
        refresh=refresh,
        skip_indices=ai_indices if ai_indices else None,
    )

    preview_indices = set(preview_manager.active_indices())
    devices = payload["devices"]
    for device in devices:
        device["previewing"] = device["index"] in preview_indices
        device["in_use"] = device["index"] in ai_indices

    for ai_idx in ai_indices:
        if not any(d["index"] == ai_idx for d in devices):
            devices.append(
                {
                    "index": ai_idx,
                    "width": 0,
                    "height": 0,
                    "fps": 0.0,
                    "available": True,
                    "previewing": False,
                    "in_use": True,
                }
            )
    devices.sort(key=lambda item: item["index"])

    primary = manager.current
    primary_ai_index = primary.source if (primary and isinstance(primary.source, int)) else None
    payload["ai_in_use"] = primary_ai_index

    # Add configured HTTP/RTSP cameras
    configured = load_saved_cameras()
    active_sources: set[str] = set()
    for s in manager.active_sessions():
        active_sources.add(str(s.source))
        if hasattr(s, "source_str"):
            active_sources.add(s.source_str)

    conf_list = []
    for c in configured:
        c_src = str(c.get("source") or c.get("rtsp_url") or "").strip()
        conf_list.append(
            {
                "id": c.get("id"),
                "name": c.get("name") or "Camera",
                "source": c_src,
                "camera_type": c.get("camera_type") or "ENTRY",
                "location": c.get("location") or "Cổng vào",
                "resolution": c.get("resolution") or "1920x1080",
                "fps": float(c.get("fps_limit") or 25),
                "available": True,
                "in_use": c_src in active_sources,
                "type": "http" if c_src.lower().startswith("http") else "rtsp",
            }
        )
    payload["configured_cameras"] = conf_list

    return payload


@router.get("/previews", summary="Danh sách preview camera đang mở")
def list_camera_previews() -> dict:
    return {
        "previews": [session.to_dict() for session in preview_manager.list_sessions()]
    }


@router.post("/previews", summary="Mở preview nhiều camera (không chạy AI)")
def start_camera_previews(request: StartPreviewRequest) -> dict:
    ai_indices = _active_ai_camera_indices()
    conflict = [idx for idx in request.indices if idx in ai_indices]
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Camera {conflict[0]} đang được dùng cho phiên nhận diện. "
                "Hãy dừng phiên nhận diện trước khi xem trước camera này."
            ),
        )

    try:
        sessions = preview_manager.start_many(
            indices=request.indices,
            max_fps=request.max_fps,
            jpeg_quality=request.jpeg_quality,
        )
    except PreviewLimitError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PreviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"ok": True, "previews": [session.to_dict() for session in sessions]}


@router.post("/previews/stop", summary="Đóng preview camera")
def stop_camera_previews(request: StopPreviewRequest | None = None) -> dict:
    indices = request.indices if request is not None else None
    if indices:
        stopped = preview_manager.stop_many(indices)
    else:
        stopped = preview_manager.stop_all()
    return {"ok": True, "stopped": stopped}


@router.get("/previews/{index}/snapshot", summary="Ảnh JPEG mới nhất của preview")
def camera_preview_snapshot(index: int) -> Response:
    session = preview_manager.get(index)
    frame = session.snapshot() if session is not None else None
    if frame is None:
        raise HTTPException(status_code=404, detail="No preview frame available")
    return Response(content=frame, media_type="image/jpeg")


@router.get("/previews/{index}/stream", summary="Luồng MJPEG xem trước camera")
def camera_preview_stream(index: int) -> StreamingResponse:
    session = preview_manager.get(index)
    if session is None:
        raise HTTPException(status_code=404, detail="Camera preview is not running")
    return StreamingResponse(
        session.mjpeg_frames(),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY.decode()}",
    )


@router.post("/start", summary="Bắt đầu nhận diện AI cho một hoặc nhiều camera")
def start_camera(request: StartCameraRequest) -> dict:
    raw_sources = request.sources if request.sources else [request.source]
    clean_sources = [str(s).strip() for s in raw_sources if str(s).strip()]
    if not clean_sources:
        clean_sources = ["0"]

    # Release any preview for local indices before starting AI
    for src in clean_sources:
        parsed = parse_camera_source(src)
        if isinstance(parsed, int):
            preview_manager.stop(parsed, wait=True)

    options_list = [
        CameraStartOptions(
            source=src,
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
        for src in clean_sources
    ]

    sessions = manager.start_many(options_list)
    primary = manager.current
    return {
        "ok": True,
        "session": primary.to_dict() if primary else None,
        "sessions": [s.to_dict() for s in sessions],
    }


@router.post("/stop", summary="Dừng phiên camera nhận diện AI")
def stop_camera(session_id: str | None = None) -> dict:
    try:
        session = manager.stop(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Camera session not found") from exc
    return {"ok": True, "session": session.to_dict() if session else None}


@router.post("/sync", summary="Đồng bộ bật/tắt camera ngay khi tích chọn")
def sync_cameras(request: SyncCamerasRequest) -> dict:
    # Release any preview for local indices before starting AI
    for src in request.sources:
        parsed = parse_camera_source(src)
        if isinstance(parsed, int):
            preview_manager.stop(parsed, wait=True)

    options = CameraStartOptions(
        source="0",
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
    sessions = manager.sync_sources(request.sources, options)
    primary = manager.current
    return {
        "ok": True,
        "session": primary.to_dict() if primary else None,
        "sessions": [s.to_dict() for s in sessions],
        "active_sources": [
            s.source_str for s in sessions if s.status not in TERMINAL_STATES
        ],
    }


@router.post("/update-config", summary="Áp dụng cấu hình camera tức thì khi thay đổi")
def update_camera_config(request: UpdateConfigRequest) -> dict:
    data = {k: v for k, v in request.dict().items() if v is not None}
    res = manager.update_config(**data)
    return res


@router.get("/status", summary="Trạng thái các phiên camera nhận diện")
def camera_status() -> dict:
    active_sessions = manager.active_sessions()
    all_sessions = manager.list_sessions()
    active = len(active_sessions) > 0
    primary = manager.current
    return {
        "active": active,
        "session": primary.to_dict() if primary else None,
        "sessions": [s.to_dict() for s in all_sessions],
        "active_sources": [str(s.source) for s in active_sessions],
    }


@router.get("/records", summary="Biển số đã xác nhận từ tất cả camera đang chạy")
def camera_records() -> dict:
    return {"records": manager.records()}


@router.get("/snapshot", summary="Ảnh JPEG nhận diện mới nhất")
def camera_snapshot(
    source: str | None = Query(None),
    session_id: str | None = Query(None),
) -> Response:
    session = None
    if session_id:
        session = manager.get(session_id)
    elif source is not None:
        session = manager.get(source)
    if session is None:
        session = manager.current

    if session is None or not session.latest_jpeg:
        raise HTTPException(status_code=404, detail="No camera frame available")
    return Response(content=session.latest_jpeg, media_type="image/jpeg")


@router.get("/stream", summary="Luồng MJPEG nhận diện AI trực tiếp")
def camera_stream(
    source: str | None = Query(None),
    session_id: str | None = Query(None),
) -> StreamingResponse:
    session = None
    if session_id:
        session = manager.get(session_id)
    elif source is not None:
        session = manager.get(source)
    if session is None:
        session = manager.current

    if session is None:
        raise HTTPException(status_code=404, detail="No camera session")
    return StreamingResponse(
        session.mjpeg_frames(),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY.decode()}",
    )


@router.post("/test-stream", summary="Kiểm tra kết nối và luồng camera trước khi thêm")
def test_stream_endpoint(request: TestStreamRequest) -> dict:
    """Check whether a video stream (HTTP, RTSP, Webcam) is reachable and delivers frames."""
    return test_stream_connection(request.url, timeout=request.timeout_seconds)


@router.get("/configured", summary="Danh sách camera đã lưu trong hệ thống")
def get_configured_cameras_endpoint() -> dict:
    return {"cameras": load_saved_cameras()}


@router.post("/configured", summary="Thêm camera mới bằng link HTTP/RTSP")
def add_configured_camera_endpoint(payload: ConfiguredCameraCreate) -> dict:
    url = payload.source.strip()
    test_res = test_stream_connection(url, timeout=6.0)
    if not test_res.get("connected"):
        raise HTTPException(
            status_code=400,
            detail=f"Không thể kết nối tới camera: {test_res.get('message', 'Không phản hồi')}",
        )

    w = test_res.get("width", 0)
    h = test_res.get("height", 0)
    fps = test_res.get("fps", 0.0)

    saved = save_camera(
        {
            "name": payload.name.strip(),
            "source": url,
            "camera_type": payload.camera_type,
            "location": payload.location,
            "resolution": f"{w}x{h}" if w > 0 else payload.resolution,
            "fps_limit": int(fps) if fps > 0 else payload.fps_limit,
            "is_active": 1,
        }
    )
    return {"ok": True, "camera": saved}


@router.delete("/configured/{camera_id}", summary="Xóa camera đã lưu")
def delete_configured_camera_endpoint(camera_id: str) -> dict:
    success = remove_camera(camera_id)
    return {"ok": success}
