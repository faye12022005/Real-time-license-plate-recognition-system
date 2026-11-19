"""Live camera sessions exposed to the web dashboard."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator, Optional

import cv2
import numpy as np

from api.serializers import record_payload
from config import settings
from src.models import PlateRecord, ProcessingResult
from src.utils.source import camera_label, parse_camera_source, redact_source

TERMINAL_STATES = {"stopped", "completed", "failed"}
MJPEG_BOUNDARY = b"frame"


@dataclass
class CameraStartOptions:
    source: str
    camera_name: str | None = None
    min_votes: int = settings.MIN_PLATE_VOTES
    max_frames: int | None = None
    duration_seconds: float | None = None
    reconnect_attempts: int = settings.STREAM_RECONNECT_ATTEMPTS
    save_db: bool = False
    save_video: bool = False
    stream_max_fps: float = 12.0
    jpeg_quality: int = 80
    ocr_mode: str = "char"
    stride: int = 1


class CameraSession:
    """Run ``ALPRPipeline.process_camera`` in a background thread."""

    def __init__(self, options: CameraStartOptions) -> None:
        self.id = f"cam-{uuid.uuid4().hex[:10]}"
        self.options = options
        self.source = parse_camera_source(options.source)
        self.label = camera_label(self.source, options.camera_name)
        self.output_dir = settings.OUTPUT_DIR / f"camera_web_{self.id}"
        self.status = "starting"
        self.error: str | None = None
        self.started_at = time.time()
        self.finished_at: float | None = None
        self.result: Optional[ProcessingResult] = None

        self.latest_jpeg: bytes | None = None
        self.frame_version = 0
        self.processed_frames = 0
        self._fps = 0.0
        self._last_frame_at = 0.0
        self._last_encode_at = 0.0

        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._stop_event = threading.Event()
        self._records: list[PlateRecord] = []
        self._thread = threading.Thread(
            target=self._run, name=f"camera-{self.id}", daemon=True
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self, wait: bool = True, timeout: float = 10.0) -> None:
        with self._condition:
            if self.status in TERMINAL_STATES and not self._thread.is_alive():
                return
            self.status = "stopping"
            self._condition.notify_all()
        self._stop_event.set()
        if wait:
            self._thread.join(timeout=timeout)

    def _run(self) -> None:
        try:
            from src.pipeline.alpr_pipeline import ALPRPipeline

            pipeline = ALPRPipeline(
                ocr_mode=self.options.ocr_mode,
                stride=self.options.stride,
                min_votes=self.options.min_votes,
                save_crops=True,
            )
            with self._condition:
                if self.status == "starting":
                    self.status = "running"
                self._condition.notify_all()

            result = pipeline.process_camera(
                source=self.source,
                output_dir=self.output_dir,
                save_annotated=self.options.save_video,
                display=False,
                save_db=self.options.save_db,
                max_frames=self.options.max_frames,
                duration_seconds=self.options.duration_seconds,
                reconnect_attempts=self.options.reconnect_attempts,
                camera_name=self.options.camera_name,
                stop_event=self._stop_event,
                frame_callback=self._on_frame,
                record_callback=self._on_records,
            )
            with self._condition:
                self.result = result
                self._records = list(result.records)
                self.status = "stopped" if result.job.stage == "STOPPED" else "completed"
                self.finished_at = time.time()
                self._condition.notify_all()
        except Exception as exc:  # noqa: BLE001 - surfaced through the status API
            with self._condition:
                self.status = "failed"
                self.error = str(exc)
                self.finished_at = time.time()
                self._condition.notify_all()

    def _on_records(self, records: list[PlateRecord]) -> None:
        with self._condition:
            known = {record.id for record in self._records}
            for record in records:
                if record.id not in known:
                    self._records.append(record)
                    known.add(record.id)
            self._condition.notify_all()

    def _on_frame(self, frame: np.ndarray) -> None:
        now = time.monotonic()
        with self._condition:
            self.processed_frames += 1
            if self._last_frame_at:
                delta = now - self._last_frame_at
                if delta > 0:
                    instant = 1.0 / delta
                    self._fps = (
                        instant if self._fps <= 0 else 0.85 * self._fps + 0.15 * instant
                    )
            self._last_frame_at = now

            interval = 1.0 / max(1.0, self.options.stream_max_fps)
            if now - self._last_encode_at < interval:
                return
            self._last_encode_at = now

        ok, encoded = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, max(1, min(100, self.options.jpeg_quality))],
        )
        if not ok:
            return
        with self._condition:
            self.latest_jpeg = encoded.tobytes()
            self.frame_version += 1
            self._condition.notify_all()

    def mjpeg_frames(self) -> Iterator[bytes]:
        last_version = -1
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: (
                        self.frame_version != last_version
                        or self.status in TERMINAL_STATES
                    ),
                    timeout=2.0,
                )
                if self.frame_version == last_version:
                    if self.status in TERMINAL_STATES:
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

    def records(self) -> list[dict]:
        with self._condition:
            records = list(self._records)
        return [record_payload(record) for record in records]

    def to_dict(self) -> dict:
        with self._condition:
            status = self.status
            processed_frames = self.processed_frames
            fps = self._fps
            record_count = len(self._records)

        finished_at = self.finished_at
        elapsed = (finished_at or time.time()) - self.started_at
        return {
            "id": self.id,
            "source": redact_source(self.source),
            "label": self.label,
            "status": status,
            "error": self.error,
            "started_at": datetime.fromtimestamp(
                self.started_at, tz=timezone.utc
            ).isoformat(),
            "finished_at": (
                datetime.fromtimestamp(finished_at, tz=timezone.utc).isoformat()
                if finished_at
                else None
            ),
            "elapsed_seconds": round(elapsed, 2),
            "processed_frames": processed_frames,
            "fps": round(fps, 2),
            "record_count": record_count,
            "output_dir": str(self.output_dir),
            "records": self.records(),
        }


class CameraManager:
    """Keep a single live camera session for the dashboard."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._current: CameraSession | None = None

    @property
    def current(self) -> CameraSession | None:
        with self._lock:
            return self._current

    def start(self, options: CameraStartOptions) -> CameraSession:
        with self._lock:
            previous = self._current
        if previous is not None:
            previous.stop(wait=True, timeout=10.0)

        session = CameraSession(options)
        with self._lock:
            self._current = session
        session.start()
        return session

    def stop(self, session_id: str | None = None) -> CameraSession | None:
        with self._lock:
            session = self._current
        if session is None:
            return None
        if session_id and session.id != session_id:
            raise KeyError(session_id)
        session.stop(wait=True, timeout=10.0)
        return session
