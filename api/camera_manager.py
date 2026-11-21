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
    stride: int = 2


class CameraSession:
    """Run ``ALPRPipeline.process_camera`` in a background thread."""

    def __init__(self, options: CameraStartOptions) -> None:
        self.id = f"cam-{uuid.uuid4().hex[:10]}"
        self.options = options
        self.source = parse_camera_source(options.source)
        self.source_str = str(options.source).strip()
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
        self.pipeline: Any = None

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
            self.pipeline = pipeline
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
                stream_max_fps=self.options.stream_max_fps,
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
            "source_raw": self.source_str,
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

    def update_config(self, **kwargs) -> None:
        """Dynamically update options and pipeline parameters live."""
        for k, v in kwargs.items():
            if v is not None and hasattr(self.options, k):
                setattr(self.options, k, v)
        pipeline = getattr(self, "pipeline", None)
        if pipeline is not None:
            if "stride" in kwargs and kwargs["stride"] is not None:
                pipeline.stride = max(1, int(kwargs["stride"]))
            if "min_votes" in kwargs and kwargs["min_votes"] is not None:
                pipeline.min_votes = max(1, int(kwargs["min_votes"]))
            if "ocr_mode" in kwargs and kwargs["ocr_mode"] is not None:
                mode = str(kwargs["ocr_mode"])
                if mode != getattr(pipeline, "ocr_mode", ""):
                    try:
                        from src.core.ocr import PlateOCR
                        pipeline.ocr_mode = mode
                        pipeline.ocr = PlateOCR(mode=mode)
                    except Exception:
                        pass


class CameraManager:
    """Manages active live camera sessions (single or multiple) for the dashboard."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, CameraSession] = {}
        self._primary_id: str | None = None

    @property
    def current(self) -> CameraSession | None:
        with self._lock:
            if self._primary_id and self._primary_id in self._sessions:
                return self._sessions[self._primary_id]
            for s in self._sessions.values():
                if s.status not in TERMINAL_STATES:
                    return s
            return next(iter(self._sessions.values())) if self._sessions else None

    def get(self, key: str) -> CameraSession | None:
        with self._lock:
            if key in self._sessions:
                return self._sessions[key]
            for s in self._sessions.values():
                if str(s.source) == str(key) or getattr(s, "source_str", "") == str(key):
                    return s
            return None

    def list_sessions(self) -> list[CameraSession]:
        with self._lock:
            return list(self._sessions.values())

    def active_sessions(self) -> list[CameraSession]:
        with self._lock:
            return [s for s in self._sessions.values() if s.status not in TERMINAL_STATES]

    def start(self, options: CameraStartOptions) -> CameraSession:
        return self.start_many([options])[0]

    def start_many(self, options_list: list[CameraStartOptions]) -> list[CameraSession]:
        self.stop_all(wait=True, timeout=5.0)

        started: list[CameraSession] = []
        with self._lock:
            self._sessions.clear()
            self._primary_id = None
            for opt in options_list:
                session = CameraSession(opt)
                self._sessions[session.id] = session
                if self._primary_id is None:
                    self._primary_id = session.id
                started.append(session)

        for session in started:
            session.start()

        return started

    def sync_sources(
        self, sources: list[str], options_template: CameraStartOptions
    ) -> list[CameraSession]:
        """Dynamically sync running camera sessions with selected sources."""
        clean_sources = [str(s).strip() for s in sources if str(s).strip()]
        target_set = set(clean_sources)

        new_sessions: list[CameraSession] = []
        with self._lock:
            # 1. Stop sessions no longer in target_set
            to_remove = [
                sid
                for sid, s in self._sessions.items()
                if s.source_str not in target_set
                or s.status in TERMINAL_STATES
            ]
            for sid in to_remove:
                s = self._sessions.pop(sid)
                s.stop(wait=False)

            # 2. Existing active sources
            existing_sources = {
                s.source_str
                for s in self._sessions.values()
                if s.status not in TERMINAL_STATES
            }

            # 3. Add sessions for newly checked sources
            for src in clean_sources:
                if src not in existing_sources:
                    opt = CameraStartOptions(
                        source=src,
                        camera_name=options_template.camera_name,
                        min_votes=options_template.min_votes,
                        max_frames=options_template.max_frames,
                        duration_seconds=options_template.duration_seconds,
                        reconnect_attempts=options_template.reconnect_attempts,
                        save_db=options_template.save_db,
                        save_video=options_template.save_video,
                        stream_max_fps=options_template.stream_max_fps,
                        ocr_mode=options_template.ocr_mode,
                        stride=options_template.stride,
                    )
                    session = CameraSession(opt)
                    self._sessions[session.id] = session
                    new_sessions.append(session)

            if not self._primary_id or self._primary_id not in self._sessions:
                self._primary_id = (
                    next(iter(self._sessions.keys())) if self._sessions else None
                )

        # Start newly created sessions
        for s in new_sessions:
            s.start()

        return self.list_sessions()

    def update_config(self, **kwargs) -> dict:
        """Update options for all running sessions in real-time."""
        with self._lock:
            sessions = list(self._sessions.values())
        for session in sessions:
            session.update_config(**kwargs)
        return {"ok": True, "updated_sessions": len(sessions)}

    def stop(self, session_id: str | None = None) -> CameraSession | None:
        if session_id is None:
            stopped = self.stop_all()
            return stopped[0] if stopped else None
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None:
            return None
        session.stop(wait=True, timeout=5.0)
        return session

    def stop_all(self, wait: bool = True, timeout: float = 5.0) -> list[CameraSession]:
        with self._lock:
            sessions = list(self._sessions.values())
        for session in sessions:
            session.stop(wait=wait, timeout=timeout)
        return sessions

    def records(self) -> list[dict]:
        with self._lock:
            sessions = list(self._sessions.values())
        all_records = []
        seen = set()
        for session in sessions:
            for rec in session.records():
                rec_id = rec.get("id") or f"{rec.get('plate_number')}_{rec.get('pts_ms')}"
                if rec_id not in seen:
                    seen.add(rec_id)
                    all_records.append(rec)
        all_records.sort(key=lambda r: r.get("timestamp") or "", reverse=True)
        return all_records
