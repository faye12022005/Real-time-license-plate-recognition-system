"""Threaded video stream reader for offline video files."""

from __future__ import annotations

import queue
import threading
from pathlib import Path
from typing import Iterator, Optional

import cv2
import numpy as np

from src.utils.logger import get_logger

LOGGER = get_logger(__name__)


class StreamReader:
    """Read frames on a background thread to decouple decoding from inference."""

    def __init__(
        self,
        source: str | Path,
        queue_size: int = 32,
        realtime: bool = False,
    ) -> None:
        self.source = str(source)
        self.capture = cv2.VideoCapture(self.source)
        if not self.capture.isOpened():
            raise ValueError(f"Cannot open video source: {self.source}")

        self.fps = float(self.capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if self.fps <= 0 or self.fps > 240:
            self.fps = 25.0
        self.width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self.height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        self.frame_count = int(self.capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        self.duration_seconds = (
            self.frame_count / self.fps if self.frame_count > 0 else 0.0
        )
        self.realtime = bool(realtime)
        self.queue: queue.Queue[Optional[np.ndarray]] = queue.Queue(maxsize=queue_size)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, name="stream-reader", daemon=True)

    def start(self) -> "StreamReader":
        self._thread.start()
        return self

    def _run(self) -> None:
        while not self._stop_event.is_set():
            success, frame = self.capture.read()
            if not success:
                break
            while not self._stop_event.is_set():
                try:
                    self.queue.put(frame, timeout=0.2)
                    break
                except queue.Full:
                    continue
        try:
            self.queue.put(None, timeout=0.5)
        except queue.Full:
            pass

    def frames(self) -> Iterator[np.ndarray]:
        """Yield frames until the stream ends."""
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
        if self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self.capture.release()

    def __enter__(self) -> "StreamReader":
        return self.start()

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.stop()
