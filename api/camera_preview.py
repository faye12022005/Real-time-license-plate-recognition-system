"""Discover local cameras and serve lightweight multi-camera previews.

The ALPR pipeline still runs only one heavy session at a time.  Previews in
this module are deliberately "view-only": they never run YOLO/OCR, never write
to the database and never create output files.  They exist so the dashboard can
let an operator tick several cameras and watch them side by side before
starting a recognition session.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator

import cv2

from api.camera_manager import MJPEG_BOUNDARY

DISCOVERY_CACHE_SECONDS = 20.0
DEVICE_NAME_CACHE_SECONDS = 60.0
DEFAULT_SCAN_LIMIT = 6
MAX_SCAN_LIMIT = 12
MAX_PREVIEWS = 4
PREVIEW_IDLE_SECONDS = 25.0
PREVIEW_MAX_FPS = 8.0
PREVIEW_JPEG_QUALITY = 75


class PreviewError(RuntimeError):
    """Base error raised by the preview manager."""


class PreviewLimitError(PreviewError):
    """Raised when too many previews are requested at once."""


@dataclass
class CameraDevice:
    """A camera index that OpenCV could open on the backend machine."""

    index: int
    width: int = 0
    height: int = 0
    fps: float = 0.0

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "available": True,
        }


# DirectShow can misbehave when several threads open/release cameras at the
# same time.  Keep device probing and preview startup serialized.
_capture_io_lock = threading.Lock()


def _open_capture(index: int) -> cv2.VideoCapture:
    """Open a local camera index using the same backend as the AI pipeline."""
    capture = cv2.VideoCapture(index)
    if capture.isOpened():
        try:
            capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:  # noqa: BLE001
            pass
        return capture

    # OpenCV normally selects DirectShow on Windows.  Keep an explicit
    # fallback for builds where the default backend cannot enumerate devices.
    capture.release()
    if sys.platform == "win32":
        fallback = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        try:
            fallback.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:  # noqa: BLE001
            pass
        return fallback
    return capture


def _probe_device(index: int) -> CameraDevice | None:
    """Open one camera long enough to verify a frame and read its resolution."""
    with _capture_io_lock:
        capture = _open_capture(index)
        try:
            if not capture.isOpened():
                return None

            frame = None
            for _ in range(5):
                ok, candidate = capture.read()
                if ok and candidate is not None:
                    frame = candidate
                    break
                time.sleep(0.15)
            if frame is None:
                return None

            height, width = frame.shape[:2]
            raw_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            fps = round(raw_fps, 1) if 0 < raw_fps <= 240 else 0.0
            return CameraDevice(
                index=index,
                width=int(width),
                height=int(height),
                fps=fps,
            )
        finally:
            capture.release()


def _powershell_path() -> str | None:
    """Find Windows PowerShell without relying on the process working dir."""
    if os.name != "nt":
        return None
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    bundled = os.path.join(
        system_root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
    )
    if os.path.isfile(bundled):
        return bundled
    return shutil.which("powershell.exe")


def _read_windows_camera_names() -> list[str]:
    """Return friendly camera names from Windows for display as a hint.

    OpenCV does not expose DirectShow device names, so these names are shown
    as additional context rather than mapped to a specific index.
    """
    powershell = _powershell_path()
    if not powershell:
        return []

    script = (
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
        "Get-CimInstance Win32_PnPEntity | "
        "Where-Object { $_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image' "
        "-or $_.Name -match 'Camera' } | "
        "Select-Object -ExpandProperty Name -Unique | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            capture_output=True,
            timeout=6,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return []

    text = result.stdout.decode("utf-8", errors="replace").strip().lstrip("\ufeff")
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []

    if isinstance(parsed, str):
        return [parsed.strip()] if parsed.strip() else []
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return []


_names_lock = threading.Lock()
_names_cache: tuple[float, list[str]] | None = None


def _cached_windows_camera_names() -> list[str]:
    global _names_cache

    now = time.monotonic()
    with _names_lock:
        if _names_cache and now - _names_cache[0] < DEVICE_NAME_CACHE_SECONDS:
            return list(_names_cache[1])

    names = _read_windows_camera_names()
    with _names_lock:
        _names_cache = (now, names)
    return list(names)


_cache_lock = threading.Lock()
_scan_lock = threading.Lock()
_discovery_cache: tuple[float, list[CameraDevice], list[str], str] | None = None


def discover_local_cameras(
    max_index: int = DEFAULT_SCAN_LIMIT,
    refresh: bool = False,
    skip_indices: set[int] | None = None,
) -> dict:
    """Scan local camera indexes and return the ones that can deliver frames.

    Results are cached briefly because probing webcams takes a moment and
    briefly opens each device.  A scan that skips indexes (for example the
    camera currently used by the AI session) is never cached, otherwise that
    camera would temporarily disappear from the list after the session stops.
    """
    global _discovery_cache

    limit = max(1, min(MAX_SCAN_LIMIT, int(max_index)))
    skip = set(skip_indices or set())
    now = time.monotonic()

    with _cache_lock:
        cached = _discovery_cache
        if (
            not refresh
            and not skip
            and cached is not None
            and now - cached[0] < DISCOVERY_CACHE_SECONDS
        ):
            devices, names, scanned_at = cached[1], cached[2], cached[3]
            return {
                "devices": [device.to_dict() for device in devices],
                "os_names": list(names),
                "scanned_at": scanned_at,
                "max_index": limit,
                "cached": True,
            }

    # Only one scan at a time; two tabs must not fight over the same webcam.
    with _scan_lock:
        devices: list[CameraDevice] = []
        for index in range(limit):
            if index in skip:
                continue

            session_info = preview_manager.device_info(index)
            if session_info is not None:
                devices.append(
                    CameraDevice(
                        index=index,
                        width=session_info["width"],
                        height=session_info["height"],
                        fps=session_info["fps"],
                    )
                )
                continue

            probed = _probe_device(index)
            if probed is not None:
                devices.append(probed)

        names = _cached_windows_camera_names()
        scanned_at = datetime.now(timezone.utc).isoformat()

        if not skip:
            with _cache_lock:
                _discovery_cache = (now, list(devices), list(names), scanned_at)

    return {
        "devices": [device.to_dict() for device in devices],
        "os_names": list(names),
        "scanned_at": scanned_at,
        "max_index": limit,
        "cached": False,
    }


class PreviewSession:
    """One view-only MJPEG camera preview running in a background thread."""

    def __init__(
        self,
        index: int,
        max_fps: float = PREVIEW_MAX_FPS,
        jpeg_quality: int = PREVIEW_JPEG_QUALITY,
    ) -> None:
        self.index = int(index)
        self.max_fps = max(1.0, min(15.0, float(max_fps)))
        self.jpeg_quality = max(30, min(95, int(jpeg_quality)))
        self.width = 0
        self.height = 0
        self.fps = 0.0
        self.status = "starting"
        self.error: str | None = None
        self.latest_jpeg: bytes | None = None
        self.frame_version = 0
        self._viewers = 0
        self._last_viewer_activity = time.monotonic()
        self._lock = threading.Condition()
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"camera-preview-{self.index}",
            daemon=True,
        )

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    @property
    def viewers(self) -> int:
        with self._lock:
            return self._viewers

    @property
    def last_activity(self) -> float:
        """Last time a viewer attached/detached, not the last encoded frame."""
        with self._lock:
            return self._last_viewer_activity

    def start(self) -> None:
        self._thread.start()

    def stop(self, wait: bool = True) -> None:
        self._stop_event.set()
        with self._lock:
            if self.status not in {"failed", "stopped"}:
                self.status = "stopped"
            self._lock.notify_all()

        if (
            wait
            and self._thread.is_alive()
            and threading.current_thread() is not self._thread
        ):
            self._thread.join(timeout=3.0)

    def device_info(self) -> dict | None:
        with self._lock:
            if self.status == "failed":
                return None
            return {
                "width": self.width,
                "height": self.height,
                "fps": self.fps,
                "status": self.status,
            }

    def snapshot(self) -> bytes | None:
        with self._lock:
            return self.latest_jpeg

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "index": self.index,
                "status": self.status,
                "width": self.width,
                "height": self.height,
                "fps": round(self.fps, 1),
                "viewers": self._viewers,
                "error": self.error,
            }

    def _run(self) -> None:
        capture: cv2.VideoCapture | None = None
        failures = 0
        try:
            with _capture_io_lock:
                capture = _open_capture(self.index)
            if not capture.isOpened():
                raise RuntimeError(f"Không mở được camera {self.index}")

            with self._lock:
                self.width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                self.height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                raw_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
                self.fps = raw_fps if 0 < raw_fps <= 240 else 0.0
                self.status = "running"
                self._lock.notify_all()

            interval = 1.0 / self.max_fps
            while not self._stop_event.is_set():
                loop_started = time.monotonic()
                ok, frame = capture.read()
                if not ok or frame is None:
                    failures += 1
                    if failures >= 10:
                        raise RuntimeError("Camera không trả về khung hình")
                    self._stop_event.wait(0.15)
                    continue

                failures = 0
                height, width = frame.shape[:2]
                encoded_ok, encoded = cv2.imencode(
                    ".jpg",
                    frame,
                    [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality],
                )
                if encoded_ok:
                    with self._lock:
                        self.latest_jpeg = encoded.tobytes()
                        self.frame_version += 1
                        self.width = int(width)
                        self.height = int(height)
                        self._lock.notify_all()

                remaining = interval - (time.monotonic() - loop_started)
                if remaining > 0:
                    self._stop_event.wait(remaining)
        except Exception as exc:  # noqa: BLE001 - reported through the API
            with self._lock:
                self.status = "failed"
                self.error = str(exc)
                self._lock.notify_all()
        finally:
            if capture is not None:
                capture.release()
            with self._lock:
                if self.status not in {"failed", "stopped"}:
                    self.status = "stopped"
                self._lock.notify_all()

    def mjpeg_frames(self) -> Iterator[bytes]:
        with self._lock:
            self._viewers += 1
            self._last_viewer_activity = time.monotonic()
        try:
            last_version = -1
            while True:
                with self._lock:
                    self._lock.wait_for(
                        lambda: (
                            self.frame_version != last_version
                            or self.status in {"failed", "stopped"}
                        ),
                        timeout=2.0,
                    )
                    if self.frame_version == last_version:
                        if self.status in {"failed", "stopped"}:
                            return
                        continue
                    data = self.latest_jpeg
                    last_version = self.frame_version

                if data:
                    yield (
                        b"--"
                        + MJPEG_BOUNDARY
                        + b"\r\nContent-Type: image/jpeg\r\nContent-Length: "
                        + str(len(data)).encode("ascii")
                        + b"\r\n\r\n"
                        + data
                        + b"\r\n"
                    )
        finally:
            with self._lock:
                self._viewers = max(0, self._viewers - 1)
                self._last_viewer_activity = time.monotonic()


class PreviewManager:
    """Keep a small set of view-only previews alive until they go idle."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[int, PreviewSession] = {}
        self._janitor: threading.Thread | None = None

    def active_indices(self) -> list[int]:
        with self._lock:
            return sorted(
                index for index, session in self._sessions.items() if session.alive
            )

    def get(self, index: int) -> PreviewSession | None:
        with self._lock:
            return self._sessions.get(int(index))

    def list_sessions(self) -> list[PreviewSession]:
        with self._lock:
            return list(self._sessions.values())

    def device_info(self, index: int) -> dict | None:
        session = self.get(index)
        return session.device_info() if session is not None else None

    def start(
        self,
        index: int,
        max_fps: float = PREVIEW_MAX_FPS,
        jpeg_quality: int = PREVIEW_JPEG_QUALITY,
    ) -> PreviewSession:
        index = int(index)
        if index < 0 or index >= 32:
            raise PreviewError(f"Camera index không hợp lệ: {index}")

        with self._lock:
            existing = self._sessions.get(index)
            if existing is not None and existing.alive:
                return existing
            if existing is not None:
                self._sessions.pop(index, None)

            if len(self._sessions) >= MAX_PREVIEWS:
                raise PreviewLimitError(
                    f"Chỉ xem trước tối đa {MAX_PREVIEWS} camera cùng lúc."
                )

            session = PreviewSession(index, max_fps=max_fps, jpeg_quality=jpeg_quality)
            self._sessions[index] = session
            self._ensure_janitor_locked()

        session.start()
        return session

    def start_many(
        self,
        indices: list[int],
        max_fps: float = PREVIEW_MAX_FPS,
        jpeg_quality: int = PREVIEW_JPEG_QUALITY,
    ) -> list[PreviewSession]:
        unique = sorted({int(index) for index in indices})
        if not unique:
            raise PreviewError("Chưa chọn camera nào.")
        if len(unique) > MAX_PREVIEWS:
            raise PreviewLimitError(
                f"Chỉ xem trước tối đa {MAX_PREVIEWS} camera cùng lúc."
            )
        return [
            self.start(index, max_fps=max_fps, jpeg_quality=jpeg_quality)
            for index in unique
        ]

    def stop(self, index: int, wait: bool = True) -> PreviewSession | None:
        with self._lock:
            session = self._sessions.pop(int(index), None)
        if session is not None:
            session.stop(wait=wait)
        return session

    def stop_many(self, indices: list[int], wait: bool = True) -> list[int]:
        stopped: list[int] = []
        for index in sorted({int(item) for item in indices}):
            if self.stop(index, wait=wait) is not None:
                stopped.append(index)
        return stopped

    def stop_all(self, wait: bool = True) -> list[int]:
        with self._lock:
            indices = list(self._sessions.keys())
        return self.stop_many(indices, wait=wait)

    def _ensure_janitor_locked(self) -> None:
        if self._janitor is not None and self._janitor.is_alive():
            return
        self._janitor = threading.Thread(
            target=self._janitor_loop,
            name="camera-preview-janitor",
            daemon=True,
        )
        self._janitor.start()

    def _janitor_loop(self) -> None:
        while True:
            time.sleep(3.0)
            now = time.monotonic()
            stale: list[int] = []
            with self._lock:
                for index, session in list(self._sessions.items()):
                    if (
                        session.viewers == 0
                        and now - session.last_activity >= PREVIEW_IDLE_SECONDS
                    ):
                        stale.append(index)
                if not self._sessions:
                    self._janitor = None
                    return

            for index in stale:
                self.stop(index)


preview_manager = PreviewManager()
