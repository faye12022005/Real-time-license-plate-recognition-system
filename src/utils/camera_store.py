"""Storage and verification helper for configured/saved cameras (HTTP, RTSP, Webcams)."""

from __future__ import annotations

import json
from pathlib import Path
import threading
import time
import uuid
from typing import Any, Dict, List

import cv2  # type: ignore

CONFIG_FILE = Path("config/camera_config.json")
_store_lock = threading.Lock()


def test_stream_connection(url: str, timeout: float = 6.0) -> Dict[str, Any]:
    """Verify whether a webcam device ID, RTSP or HTTP stream URL is connectable and delivers frames.

    Runs in a dedicated thread with a strict timeout so network stalls never hang the caller.
    """
    clean_url = str(url).strip()
    if not clean_url:
        return {
            "ok": False,
            "connected": False,
            "width": 0,
            "height": 0,
            "fps": 0.0,
            "message": "Đường dẫn camera không được để trống.",
        }

    source: Any = int(clean_url) if clean_url.isdigit() else clean_url

    result: Dict[str, Any] = {
        "ok": False,
        "connected": False,
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "message": "Không thể kết nối.",
    }

    def _worker() -> None:
        cap = None
        try:
            cap = cv2.VideoCapture(source)
            try:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except Exception:
                pass

            if not cap.isOpened():
                result["message"] = f"Không thể mở luồng camera: {clean_url}"
                return

            # Read up to 5 frames to confirm valid video delivery
            frame = None
            for _ in range(5):
                ret, temp_frame = cap.read()
                if ret and temp_frame is not None and temp_frame.size > 0:
                    frame = temp_frame
                    break
                time.sleep(0.1)

            if frame is not None:
                h, w = frame.shape[:2]
                raw_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
                fps = round(raw_fps, 1) if 0 < raw_fps <= 120 else 25.0
                result["ok"] = True
                result["connected"] = True
                result["width"] = int(w)
                result["height"] = int(h)
                result["fps"] = fps
                result["message"] = f"Kết nối camera thành công ({w}x{h} @ {fps}fps)"
            else:
                result["message"] = (
                    "Camera đã kết nối nhưng không truyền được tín hiệu khung hình video."
                )
        except Exception as exc:
            result["message"] = f"Lỗi kết nối camera: {exc}"
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass

    probe_thread = threading.Thread(target=_worker, name="probe-camera-stream", daemon=True)
    probe_thread.start()
    probe_thread.join(timeout=timeout)

    if probe_thread.is_alive():
        return {
            "ok": False,
            "connected": False,
            "width": 0,
            "height": 0,
            "fps": 0.0,
            "message": (
                f"Hết thời gian chờ phản hồi ({timeout:.0f}s). "
                "Vui lòng kiểm tra lại địa chỉ IP, cổng (port) hoặc mạng Wi-Fi."
            ),
        }

    return result


def _read_config_json() -> List[Dict[str, Any]]:
    if not CONFIG_FILE.exists():
        return []
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return list(data.get("cameras", []))
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _write_config_json(cameras: List[Dict[str, Any]]) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps({"cameras": cameras}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def load_saved_cameras() -> List[Dict[str, Any]]:
    """Return all configured cameras, merging local JSON and MySQL database if available."""
    with _store_lock:
        local_cams = _read_config_json()

    db_cams: List[Dict[str, Any]] = []
    try:
        from src.database.repository import list_cameras

        db_cams = list_cameras()
    except Exception:
        pass

    # Merge by id / source, preferring local metadata
    merged_map: Dict[str, Dict[str, Any]] = {}
    for cam in db_cams:
        cam_id = str(cam.get("id") or "")
        merged_map[cam_id] = {
            "id": cam_id,
            "name": cam.get("name") or "Camera",
            "source": cam.get("rtsp_url") or "",
            "camera_type": cam.get("camera_type") or "ENTRY",
            "location": cam.get("location") or "Cổng vào",
            "resolution": cam.get("resolution") or "1920x1080",
            "fps_limit": cam.get("fps_limit") or 25,
            "is_active": cam.get("is_active", 1),
        }

    for cam in local_cams:
        cam_id = str(cam.get("id") or "")
        merged_map[cam_id] = {
            "id": cam_id,
            "name": cam.get("name") or "Camera",
            "source": cam.get("source") or cam.get("rtsp_url") or "",
            "camera_type": cam.get("camera_type") or "ENTRY",
            "location": cam.get("location") or "Cổng vào",
            "resolution": cam.get("resolution") or "1920x1080",
            "fps_limit": cam.get("fps_limit") or 25,
            "is_active": cam.get("is_active", 1),
        }

    return list(merged_map.values())


def save_camera(camera_data: Dict[str, Any]) -> Dict[str, Any]:
    """Persist a new or updated camera to config JSON and MySQL."""
    clean_data = dict(camera_data)
    cam_id = clean_data.get("id") or f"CAM-HTTP-{uuid.uuid4().hex[:8]}"
    clean_data["id"] = cam_id
    clean_data["source"] = str(clean_data.get("source") or clean_data.get("rtsp_url") or "").strip()
    clean_data.setdefault("name", "Camera HTTP")
    clean_data.setdefault("camera_type", "ENTRY")
    clean_data.setdefault("location", "Cổng chính")
    clean_data.setdefault("resolution", "1920x1080")
    clean_data.setdefault("fps_limit", 25)
    clean_data.setdefault("is_active", 1)

    # 1. Save to JSON file
    with _store_lock:
        cams = _read_config_json()
        updated = False
        for i, item in enumerate(cams):
            if item.get("id") == cam_id or item.get("source") == clean_data["source"]:
                cams[i] = clean_data
                updated = True
                break
        if not updated:
            cams.append(clean_data)
        _write_config_json(cams)

    # 2. Sync to MySQL if available
    try:
        from src.database.repository import upsert_camera

        upsert_camera(
            {
                "id": cam_id,
                "name": clean_data["name"],
                "camera_type": clean_data["camera_type"],
                "rtsp_url": clean_data["source"],
                "location": clean_data["location"],
                "resolution": clean_data["resolution"],
                "fps_limit": clean_data["fps_limit"],
                "is_active": clean_data["is_active"],
            }
        )
    except Exception:
        pass

    return clean_data


def remove_camera(camera_id: str) -> bool:
    """Delete camera by id from config JSON and MySQL."""
    with _store_lock:
        cams = _read_config_json()
        new_cams = [c for c in cams if c.get("id") != camera_id]
        changed = len(new_cams) != len(cams)
        if changed:
            _write_config_json(new_cams)

    try:
        from src.database.repository import delete_camera

        delete_camera(camera_id)
    except Exception:
        pass

    return True
