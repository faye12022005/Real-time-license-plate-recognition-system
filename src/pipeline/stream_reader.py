"""Threaded video stream reader for offline files and live cameras."""

from __future__ import annotations

import os
import queue
import threading
from pathlib import Path
from typing import Iterator, Optional

import cv2
import numpy as np

from config.settings import (
    STREAM_QUEUE_SIZE,
    STREAM_RECONNECT_ATTEMPTS,
    STREAM_RECONNECT_DELAY,
)
from src.utils.logger import get_logger
from src.utils.source import is_camera_source, redact_source

LOGGER = get_logger(__name__)


class StreamReader:
    """Read frames on a background thread to decouple decoding from inference.

    Supports local video files, webcam indexes (``0``, ``1``...) and network
    streams (RTSP/RTMP/HTTP). Live streams reconnect automatically and can drop
    stale frames so inference always works on the freshest frame available.
    """

    def __init__(
        self,
        source: str | int | Path,
        queue_size: int = STREAM_QUEUE_SIZE,
        reconnect_attempts: int = STREAM_RECONNECT_ATTEMPTS,
        reconnect_delay: float = STREAM_RECONNECT_DELAY,
        drop_old_frames: bool = True,
    ) -> None:
        self.source = source
        self.is_live = is_camera_source(source)
        self.realtime = self.is_live
        self.reconnect_attempts = int(reconnect_attempts)
        self.reconnect_delay = max(0.0, float(reconnect_delay))
        self.drop_old_frames = bool(drop_old_frames and self.is_live)

        self._configure_rtsp()
        self.capture = self._open_capture()
        self._read_metadata()

        self.queue: queue.Queue[Optional[np.ndarray]] = queue.Queue(
            maxsize=max(1, int(queue_size))
        )
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run, name="stream-reader", daemon=True
        )

    def _configure_rtsp(self) -> None:
        """Prefer TCP for RTSP to reduce packet loss on unstable networks."""
        if isinstance(self.source, str) and self.source.lower().startswith("rtsp://"):
            os.environ.setdefault(
                "OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp"
            )

    def _open_capture(self) -> cv2.VideoCapture:
        source = self.source if isinstance(self.source, int) else str(self.source)
        capture = cv2.VideoCapture(source)
        if not capture.isOpened():
            capture.release()
            raise ValueError(f"Cannot open video source: {redact_source(source)}")
        return capture

    def _read_metadata(self) -> None:
        self.fps = float(self.capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if self.fps <= 0 or self.fps > 240:
            self.fps = 25.0
        self.width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self.height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        self.frame_count = (
            0
            if self.is_live
            else int(self.capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        )
        self.duration_seconds = (
            self.frame_count / self.fps if self.frame_count > 0 else 0.0
        )

    def _release_capture(self) -> None:
        try:
            self.capture.release()
        except Exception:  # noqa: BLE001 - releasing a broken capture may fail
            pass

    def start(self) -> "StreamReader":
        self._thread.start()
        return self

    def _put_frame(self, frame: np.ndarray) -> None:
        if self.drop_old_frames:
            while not self._stop_event.is_set():
                try:
                    self.queue.put_nowait(frame)
                    return
                except queue.Full:
                    try:
                        self.queue.get_nowait()
                    except queue.Empty:
                        break
        while not self._stop_event.is_set():
            try:
                self.queue.put(frame, timeout=0.2)
                return
            except queue.Full:
                continue

    def _reconnect(self, failures: int) -> bool:
        if self.reconnect_attempts == 0:
            return False
        if self.reconnect_attempts > 0 and failures >= self.reconnect_attempts:
            LOGGER.error(
                "Giving up after %d reconnect attempt(s): %s",
                failures,
                redact_source(self.source),
            )
            return False

        LOGGER.warning(
            "Stream read failed; reconnecting (%d/%s): %s",
            failures,
            "unlimited" if self.reconnect_attempts < 0 else self.reconnect_attempts,
            redact_source(self.source),
        )
        self._release_capture()
        if self._stop_event.wait(self.reconnect_delay):
            return False
        try:
            self.capture = self._open_capture()
        except Exception as exc:  # noqa: BLE001 - keep retrying
            LOGGER.error("Reconnect failed: %s", exc)
            return True
        return True

    def _run(self) -> None:
        failures = 0
        while not self._stop_event.is_set():
            try:
                success, frame = self.capture.read()
            except Exception as exc:  # noqa: BLE001 - broken capture
                LOGGER.debug("Capture read error: %s", exc)
                success, frame = False, None

            if not success or frame is None:
                if not self.is_live:
                    break
                if not self._reconnect(failures + 1):
                    break
                failures += 1
                continue

            failures = 0
            self._put_frame(frame)

        try:
            self.queue.put(None, timeout=0.5)
        except queue.Full:
            pass

    def frames(self) -> Iterator[np.ndarray]:
        """Yield frames until the stream ends or the reader is stopped."""
        while not self._stop_event.is_set():
            try:
                frame = self.queue.get(timeout=1.0)
            except queue.Empty:
                if not self._thread.is_alive():
                    break
                continue
            if frame is None:
                break
            yield frame

    def __iter__(self) -> Iterator[np.ndarray]:
        return self.frames()

    def stop(self) -> None:
        self._stop_event.set()
        if self.is_live:
            self._release_capture()
        if self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._release_capture()

    def __enter__(self) -> "StreamReader":
        return self.start()

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.stop()
