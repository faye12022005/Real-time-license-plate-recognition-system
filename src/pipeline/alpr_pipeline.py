"""Detector -> OCR -> tracker orchestration for files and live cameras."""

from __future__ import annotations

import csv
import json
import re
import threading
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

from config import settings
from src.core.detector import (
    PlateDetector,
    VehicleDetector,
    map_vehicle_type,
    select_vehicle_for_plate,
)
from src.core.ocr import PlateOCR
from src.core.tracker import IoUTracker
from src.database.repository import PlateRepository
from src.models import OCRResult, PlateRecord, ProcessingResult, VideoJob
from src.pipeline.stream_reader import StreamReader
from src.utils.image_processing import (
    crop_with_padding,
    draw_plate_label,
    estimate_plate_color,
    format_seconds,
    quality_score,
)
from src.utils.logger import get_logger
from src.utils.plate_validator import (
    canonicalize_plate,
    format_plate,
    is_valid_plate,
    province_name,
)
from src.utils.source import camera_label, redact_source, safe_filename

LOGGER = get_logger(__name__)


def _notify_job(
    callback: Callable[[VideoJob], None] | None,
    job: VideoJob,
) -> None:
    """Invoke an optional job progress callback without breaking processing."""
    if callback is None:
        return
    try:
        callback(job)
    except Exception as exc:  # noqa: BLE001 - callbacks must not abort the job
        LOGGER.debug("Job callback failed: %s", exc)


@dataclass
class TrackState:
    """Aggregated OCR evidence for one tracked plate."""

    track_id: int
    votes: Counter = field(default_factory=Counter)
    vote_scores: Counter = field(default_factory=Counter)
    vehicle_votes: Counter = field(default_factory=Counter)
    plate_type_votes: Counter = field(default_factory=Counter)
    best_text: str = ""
    best_confidence: float = 0.0
    best_quality: float = 0.0
    best_crop: Optional[np.ndarray] = None
    first_pts_ms: int = 0
    last_pts_ms: int = 0
    last_frame_index: int = 0
    emitted: bool = False
    vehicle_type: str = "car"
    plate_type: str = "white"
    source: str = ""


def _trailing_digits(plate: str) -> str:
    match = re.search(r"(\d{4})$", plate)
    return match.group(1) if match else plate[-4:]


def _is_subsequence(shorter: str, longer: str) -> bool:
    iterator = iter(longer)
    return all(character in iterator for character in shorter)


def _has_only_letter_insertions(shorter: str, longer: str) -> bool:
    """True when `longer` adds only letters around the characters of `shorter`.

    This matches dash misreads inside the series (17FF21618 -> 17F21618) but
    rejects a candidate that simply dropped a registration digit
    (99V13428 -> 99V3428).
    """
    if not _is_subsequence(shorter, longer):
        return False
    extra: list[str] = []
    position = 0
    for character in longer:
        if position < len(shorter) and character == shorter[position]:
            position += 1
        else:
            extra.append(character)
    return bool(extra) and all(character.isalpha() for character in extra)


class ALPRPipeline:
    """End-to-end license plate recognition pipeline."""

    def __init__(
        self,
        plate_model_path: str | Path = settings.PLATE_MODEL_PATH,
        vehicle_model_path: Optional[str | Path] = settings.VEHICLE_MODEL_PATH,
        char_model_path: str | Path = settings.CHAR_MODEL_PATH,
        ocr_mode: str = "hybrid",
        gpu: bool = False,
        plate_confidence: float = settings.PLATE_CONFIDENCE,
        vehicle_confidence: float = settings.VEHICLE_CONFIDENCE,
        char_confidence: float = settings.CHAR_CONFIDENCE,
        imgsz: int = settings.IMAGE_SIZE,
        device: Optional[str] = None,
        stride: int = settings.FRAME_STRIDE,
        min_votes: int = settings.MIN_PLATE_VOTES,
        high_confidence_accept: float = settings.HIGH_CONFIDENCE_ACCEPT,
        track_iou: float = settings.TRACK_IOU_THRESHOLD,
        track_max_age: int = settings.TRACK_MAX_AGE,
        save_crops: bool = settings.SAVE_CROPS,
    ) -> None:
        self.plate_detector = PlateDetector(
            model_path=plate_model_path,
            confidence=plate_confidence,
            iou=settings.IOU_THRESHOLD,
            imgsz=imgsz,
            device=device,
        )

        self.vehicle_detector: Optional[VehicleDetector] = None
        if vehicle_model_path is not None and Path(vehicle_model_path).exists():
            try:
                self.vehicle_detector = VehicleDetector(
                    model_path=vehicle_model_path,
                    confidence=vehicle_confidence,
                    iou=settings.IOU_THRESHOLD,
                    imgsz=imgsz,
                    device=device,
                )
            except Exception as exc:  # noqa: BLE001 - vehicle model is optional
                LOGGER.warning("Vehicle detector disabled: %s", exc)
        else:
            LOGGER.warning("Vehicle model not found; vehicle_type will default to 'car'.")

        self.ocr = PlateOCR(
            char_model_path=char_model_path,
            mode=ocr_mode,
            gpu=gpu,
            char_confidence=char_confidence,
            imgsz=imgsz,
            device=device,
        )
        self.tracker = IoUTracker(iou_threshold=track_iou, max_age=track_max_age)
        self.stride = max(1, int(stride))
        self.min_votes = max(1, int(min_votes))
        self.high_confidence_accept = float(high_confidence_accept)
        self.save_crops = bool(save_crops)

    def process_video(
        self,
        video_path: str | Path,
        output_dir: str | Path | None = None,
        save_annotated: bool = True,
        display: bool = False,
        save_db: bool = True,
        job_id: str | None = None,
        progress_callback: Callable[[VideoJob], None] | None = None,
        display_name: str | None = None,
    ) -> ProcessingResult:
        """Process one video file and return validated plate records."""
        video_path = Path(video_path).resolve()
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        job_id = job_id or f"job-{int(time.time() * 1000)}"
        default_output = settings.OUTPUT_DIR / f"{video_path.stem}_{job_id}"
        output_path = Path(output_dir).resolve() if output_dir else default_output
        crops_dir = output_path / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)

        created_at = datetime.now(timezone.utc).isoformat()
        job = VideoJob(
            id=job_id,
            filename=display_name or video_path.name,
            file_size_bytes=video_path.stat().st_size,
            stage="PROCESSING",
            created_at=created_at,
            video_url=str(video_path),
        )

        repository: Optional[PlateRepository] = None
        if save_db:
            try:
                repository = PlateRepository()
                repository.save_job(job)
            except Exception as exc:  # noqa: BLE001 - persistence is optional
                LOGGER.warning("Database persistence disabled: %s", exc)
                repository = None

        reader = StreamReader(video_path)
        job.total_frames = reader.frame_count
        job.duration_seconds = reader.duration_seconds
        _notify_job(progress_callback, job)

        output_video: Optional[Path] = None
        writer: Optional[cv2.VideoWriter] = None
        if save_annotated:
            output_video = output_path / f"{video_path.stem}_annotated.mp4"
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            size = (reader.width, reader.height)
            writer = cv2.VideoWriter(str(output_video), fourcc, reader.fps, size)
            if not writer.isOpened():
                LOGGER.warning("Could not open video writer for %s", output_video)
                writer = None
                output_video = None

        states: dict[int, TrackState] = {}
        processed_frames = 0
        last_report = time.perf_counter()
        start_time = time.perf_counter()

        LOGGER.info(
            "Processing %s (%.1fs, %d frames, %.1f fps)",
            video_path.name,
            reader.duration_seconds,
            reader.frame_count,
            reader.fps,
        )

        reader.start()
        try:
            for frame_index, frame in enumerate(reader.frames()):
                processed_frames = frame_index + 1

                if frame_index % self.stride == 0:
                    self._process_frame(frame, frame_index, reader.fps, states)

                if writer is not None:
                    writer.write(frame)

                if display:
                    try:
                        cv2.imshow("ALPR", frame)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            break
                    except cv2.error:
                        display = False

                now = time.perf_counter()
                if now - last_report >= 2.0:
                    elapsed = max(1e-6, now - start_time)
                    current_fps = processed_frames / elapsed
                    job.processed_frames = processed_frames
                    job.current_fps = current_fps
                    job.overall_progress_pct = (
                        100.0 * processed_frames / reader.frame_count
                        if reader.frame_count
                        else 0.0
                    )
                    if current_fps > 0 and reader.frame_count > processed_frames:
                        job.eta_seconds = (reader.frame_count - processed_frames) / current_fps
                    LOGGER.info(
                        "Progress %5.1f%% | frame %d/%d | %.1f fps | ETA %s",
                        job.overall_progress_pct,
                        processed_frames,
                        reader.frame_count,
                        current_fps,
                        format_seconds(job.eta_seconds),
                    )
                    _notify_job(progress_callback, job)
                    last_report = now
        finally:
            reader.stop()
            if writer is not None:
                writer.release()
            if display:
                try:
                    cv2.destroyAllWindows()
                except cv2.error:
                    pass

        elapsed = max(1e-6, time.perf_counter() - start_time)
        records = self._build_records(
            states=states,
            job=job,
            video_path=video_path,
            crops_dir=crops_dir,
        )

        job.stage = "COMPLETED"
        job.stage_progress_pct = 100.0
        job.overall_progress_pct = 100.0
        job.processed_frames = processed_frames
        job.current_fps = processed_frames / elapsed
        job.eta_seconds = 0.0
        job.detected_plates_count = len(records)
        job.completed_at = datetime.now(timezone.utc).isoformat()
        _notify_job(progress_callback, job)

        results_json = output_path / "results.json"
        results_csv = output_path / "results.csv"
        self._write_results(results_json, results_csv, job, records)

        if repository is not None:
            try:
                repository.save_job(job)
                repository.save_records(records)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Could not persist results: %s", exc)

        LOGGER.info(
            "Finished %s in %.1fs | %d plate record(s) | output: %s",
            video_path.name,
            elapsed,
            len(records),
            output_path,
        )
        return ProcessingResult(
            job=job,
            records=records,
            output_dir=output_path,
            output_video=output_video,
            results_json=results_json,
            results_csv=results_csv,
        )

    def process_camera(
        self,
        source: str | int,
        output_dir: str | Path | None = None,
        save_annotated: bool = False,
        display: bool = True,
        save_db: bool = True,
        max_frames: int | None = None,
        duration_seconds: float | None = None,
        reconnect_attempts: int = settings.STREAM_RECONNECT_ATTEMPTS,
        camera_name: str | None = None,
        stop_event: threading.Event | None = None,
        frame_callback: Callable[[np.ndarray], None] | None = None,
        record_callback: Callable[[list[PlateRecord]], None] | None = None,
    ) -> ProcessingResult:
        """Process a live camera/stream and emit plate records as they are confirmed.

        ``stop_event`` lets a caller stop the loop externally. ``frame_callback``
        receives every annotated frame (for MJPEG/WebSocket streaming) and
        ``record_callback`` is notified whenever new records are confirmed.
        """
        job_id = f"job-{int(time.time() * 1000)}"
        label = camera_label(source, camera_name)
        output_path = (
            Path(output_dir).resolve()
            if output_dir
            else settings.OUTPUT_DIR / f"{label}_{job_id}"
        )
        crops_dir = output_path / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)

        created_at = datetime.now(timezone.utc).isoformat()
        source_url = redact_source(source)
        job = VideoJob(
            id=job_id,
            filename=label,
            file_size_bytes=0,
            stage="PROCESSING",
            created_at=created_at,
            video_url=source_url,
        )

        repository: Optional[PlateRepository] = None
        if save_db:
            try:
                repository = PlateRepository()
                repository.save_job(job)
            except Exception as exc:  # noqa: BLE001 - persistence is optional
                LOGGER.warning("Database persistence disabled: %s", exc)
                repository = None

        reader = StreamReader(
            source,
            reconnect_attempts=reconnect_attempts,
            drop_old_frames=True,
        )
        job.total_frames = reader.frame_count
        job.duration_seconds = reader.duration_seconds

        output_video: Optional[Path] = (
            output_path / f"{label}_annotated.mp4" if save_annotated else None
        )
        writer: Optional[cv2.VideoWriter] = None
        writer_failed = False

        states: dict[int, TrackState] = {}
        records: list[PlateRecord] = []
        processed_frames = 0
        started_at = time.perf_counter()
        last_report = started_at
        stopped = False

        LOGGER.info(
            "Starting real-time camera %s (fps=%.1f, reconnect=%s)",
            label,
            reader.fps,
            reconnect_attempts,
        )

        reader.start()
        try:
            for frame_index, frame in enumerate(reader.frames()):
                if stop_event is not None and stop_event.is_set():
                    stopped = True
                    break
                if (
                    max_frames is not None
                    and max_frames > 0
                    and frame_index >= max_frames
                ):
                    break
                if (
                    duration_seconds is not None
                    and duration_seconds > 0
                    and time.perf_counter() - started_at >= duration_seconds
                ):
                    break

                processed_frames = frame_index + 1

                if frame_index % self.stride == 0:
                    self._process_frame(
                        frame,
                        frame_index,
                        reader.fps,
                        states,
                        pts_ms=int(round((time.perf_counter() - started_at) * 1000.0)),
                    )
                    new_records = self._collect_realtime_records(
                        states=states,
                        job=job,
                        video_source=source_url,
                        crops_dir=crops_dir,
                    )
                    if new_records:
                        records.extend(new_records)
                        self._persist_records(repository, new_records)
                        if record_callback is not None:
                            record_callback(new_records)
                        LOGGER.info(
                            "New plate(s): %s",
                            ", ".join(record.plate_display for record in new_records),
                        )

                if frame_callback is not None:
                    try:
                        frame_callback(frame)
                    except Exception as exc:  # noqa: BLE001 - streaming is best effort
                        LOGGER.debug("Frame callback failed: %s", exc)

                if save_annotated and writer is None and not writer_failed:
                    height, width = frame.shape[:2]
                    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                    writer = cv2.VideoWriter(
                        str(output_video), fourcc, reader.fps, (width, height)
                    )
                    if not writer.isOpened():
                        LOGGER.warning(
                            "Could not open video writer for %s", output_video
                        )
                        writer = None
                        writer_failed = True
                        output_video = None

                if writer is not None:
                    writer.write(frame)

                if display:
                    try:
                        cv2.imshow("ALPR Camera", frame)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            stopped = True
                            break
                    except cv2.error:
                        display = False

                now = time.perf_counter()
                if now - last_report >= 2.0:
                    elapsed = max(1e-6, now - started_at)
                    job.processed_frames = processed_frames
                    job.current_fps = processed_frames / elapsed
                    LOGGER.info(
                        "Live frame %d | %.1f fps | %d plate(s) confirmed",
                        processed_frames,
                        job.current_fps,
                        len(records),
                    )
                    last_report = now
        except KeyboardInterrupt:
            stopped = True
            LOGGER.warning("Real-time camera interrupted by user.")
        finally:
            reader.stop()
            if writer is not None:
                writer.release()
            if display:
                try:
                    cv2.destroyAllWindows()
                except cv2.error:
                    pass

        remaining_states = {
            track_id: state
            for track_id, state in states.items()
            if not state.emitted
        }
        if remaining_states:
            final_records = self._build_records(
                states=remaining_states,
                job=job,
                video_path=source_url,
                crops_dir=crops_dir,
            )
            if final_records:
                records.extend(final_records)
                self._persist_records(repository, final_records)
                if record_callback is not None:
                    record_callback(final_records)

        records.sort(key=lambda record: (record.pts_ms, record.plate_number))

        elapsed = max(1e-6, time.perf_counter() - started_at)
        job.stage = "STOPPED" if stopped else "COMPLETED"
        job.stage_progress_pct = 100.0
        job.overall_progress_pct = 100.0
        job.processed_frames = processed_frames
        job.current_fps = processed_frames / elapsed
        job.eta_seconds = 0.0
        job.detected_plates_count = len(records)
        job.completed_at = datetime.now(timezone.utc).isoformat()

        results_json = output_path / "results.json"
        results_csv = output_path / "results.csv"
        self._write_results(results_json, results_csv, job, records)

        if repository is not None:
            try:
                repository.save_job(job)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Could not persist camera job: %s", exc)

        LOGGER.info(
            "Camera %s stopped after %.1fs | %d plate record(s) | output: %s",
            label,
            elapsed,
            len(records),
            output_path,
        )
        return ProcessingResult(
            job=job,
            records=records,
            output_dir=output_path,
            output_video=output_video,
            results_json=results_json,
            results_csv=results_csv,
        )

    def _collect_realtime_records(
        self,
        states: dict[int, TrackState],
        job: VideoJob,
        video_source: str,
        crops_dir: Path,
    ) -> list[PlateRecord]:
        """Emit records for tracks that reached the support threshold and drop expired state."""
        active_tracks = set(self.tracker.tracks.keys())
        eligible: dict[int, TrackState] = {}

        for track_id, state in list(states.items()):
            is_active = track_id in active_tracks
            if state.emitted:
                if not is_active:
                    states.pop(track_id, None)
                continue
            if self._is_candidate_ready(state):
                eligible[track_id] = state
            elif not is_active:
                states.pop(track_id, None)

        if not eligible:
            return []

        records = self._build_records(
            states=eligible,
            job=job,
            video_path=video_source,
            crops_dir=crops_dir,
        )
        for track_id, state in eligible.items():
            state.emitted = True
            if track_id not in active_tracks:
                states.pop(track_id, None)
        return records

    def _is_candidate_ready(self, state: TrackState) -> bool:
        if not state.votes:
            return False
        plate_number = max(
            state.votes,
            key=lambda candidate: (
                state.vote_scores.get(candidate, 0.0)
                / max(1, state.votes.get(candidate, 1)),
                state.votes.get(candidate, 0),
            ),
        )
        votes = state.votes.get(plate_number, 0)
        average_confidence = state.vote_scores.get(plate_number, 0.0) / max(1, votes)
        return (
            votes >= self.min_votes
            or average_confidence >= self.high_confidence_accept
        )

    @staticmethod
    def _persist_records(
        repository: Optional[PlateRepository],
        records: list[PlateRecord],
    ) -> None:
        if repository is None or not records:
            return
        try:
            repository.save_records(records)
        except Exception as exc:  # noqa: BLE001 - keep the camera running
            LOGGER.warning("Could not persist real-time records: %s", exc)

    def _process_frame(
        self,
        frame: np.ndarray,
        frame_index: int,
        fps: float,
        states: dict[int, TrackState],
        pts_ms: int | None = None,
    ) -> None:
        plate_detections = self.plate_detector.predict(frame)
        matches = self.tracker.update(plate_detections, frame_index)
        if not plate_detections:
            return

        vehicle_detections = (
            self.vehicle_detector.predict(frame) if self.vehicle_detector else []
        )
        if pts_ms is None:
            pts_ms = int(round(frame_index / fps * 1000.0)) if fps > 0 else 0

        for track, detection in matches:
            crop = crop_with_padding(frame, detection.bbox, pad_ratio=0.15)
            if crop.size == 0:
                continue
            ocr_result = self.ocr.read(crop)
            plate_number = canonicalize_plate(ocr_result.text)
            if not is_valid_plate(plate_number):
                LOGGER.debug(
                    "Discarded OCR candidate %r from track %d",
                    ocr_result.text,
                    track.track_id,
                )
                continue

            state = states.get(track.track_id)
            if state is None:
                state = TrackState(track_id=track.track_id, first_pts_ms=pts_ms)
                states[track.track_id] = state
            state.last_frame_index = frame_index

            crop_quality = quality_score(crop)
            combined_confidence = self._combined_confidence(detection.confidence, ocr_result)

            state.votes[plate_number] += 1
            state.vote_scores[plate_number] += combined_confidence
            state.last_pts_ms = pts_ms
            state.source = ocr_result.source
            estimated_color = estimate_plate_color(crop)
            state.plate_type = estimated_color
            state.plate_type_votes[estimated_color] += 1

            vehicle = select_vehicle_for_plate(detection, vehicle_detections)
            if vehicle is not None:
                vehicle_type = map_vehicle_type(vehicle.class_name)
                state.vehicle_type = vehicle_type
                state.vehicle_votes[vehicle_type] += 1

            is_better = (
                combined_confidence > state.best_confidence
                or (
                    abs(combined_confidence - state.best_confidence) < 1e-9
                    and crop_quality > state.best_quality
                )
            )
            if is_better:
                state.best_text = plate_number
                state.best_confidence = combined_confidence
                state.best_quality = crop_quality
                state.best_crop = crop.copy()

            draw_plate_label(
                frame,
                detection.bbox,
                format_plate(plate_number),
                combined_confidence,
            )

    @staticmethod
    def _combined_confidence(
        detection_confidence: float,
        ocr_result: OCRResult,
    ) -> float:
        return float(
            max(0.0, min(1.0, 0.6 * detection_confidence + 0.4 * ocr_result.confidence))
        )

    def _build_records(
        self,
        states: dict[int, TrackState],
        job: VideoJob,
        video_path: str | Path,
        crops_dir: Path,
    ) -> list[PlateRecord]:
        candidate_groups: dict[str, list[tuple[TrackState, int, float]]] = defaultdict(list)
        for state in states.values():
            for plate_number, vote_count in state.votes.items():
                if not vote_count:
                    continue
                average_confidence = state.vote_scores.get(plate_number, 0.0) / vote_count
                if (
                    vote_count < self.min_votes
                    and average_confidence < self.high_confidence_accept
                ):
                    continue
                if not is_valid_plate(plate_number):
                    continue
                candidate_groups[plate_number].append(
                    (state, vote_count, average_confidence)
                )

        candidates: list[dict] = []
        for plate_number, entries in candidate_groups.items():
            group_states = [entry[0] for entry in entries]
            best_state = max(
                group_states,
                key=lambda state: (
                    state.vote_scores.get(plate_number, 0.0)
                    / max(1, state.votes.get(plate_number, 1)),
                    state.best_quality,
                ),
            )
            candidates.append(
                {
                    "plate_number": plate_number,
                    "states": group_states,
                    "votes": sum(entry[1] for entry in entries),
                    "confidence": max(entry[2] for entry in entries),
                    "quality": best_state.best_quality,
                    "first_pts_ms": min(state.first_pts_ms for state in group_states),
                    "last_pts_ms": max(state.last_pts_ms for state in group_states),
                    "tail": _trailing_digits(plate_number),
                }
            )

        clusters: list[dict] = []
        for candidate in sorted(candidates, key=lambda item: item["first_pts_ms"]):
            for cluster in clusters:
                if cluster["tail"] != candidate["tail"]:
                    continue
                if candidate["first_pts_ms"] - cluster["last_pts_ms"] > 3000:
                    continue
                if cluster["first_pts_ms"] - candidate["last_pts_ms"] > 3000:
                    continue
                cluster["members"].append(candidate)
                cluster["first_pts_ms"] = min(
                    cluster["first_pts_ms"], candidate["first_pts_ms"]
                )
                cluster["last_pts_ms"] = max(
                    cluster["last_pts_ms"], candidate["last_pts_ms"]
                )
                break
            else:
                clusters.append(
                    {
                        "tail": candidate["tail"],
                        "members": [candidate],
                        "first_pts_ms": candidate["first_pts_ms"],
                        "last_pts_ms": candidate["last_pts_ms"],
                    }
                )

        records: list[PlateRecord] = []
        for cluster in clusters:
            members: list[dict] = cluster["members"]
            base = max(
                members,
                key=lambda item: (item["votes"], item["confidence"]),
            )
            representative = base
            shorter = [
                member
                for member in members
                if member is not base
                and len(member["plate_number"]) < len(base["plate_number"])
                and _has_only_letter_insertions(
                    member["plate_number"], base["plate_number"]
                )
                and member["confidence"] >= base["confidence"] - 0.03
            ]
            if shorter:
                representative = max(
                    shorter,
                    key=lambda item: (
                        item["confidence"],
                        item["votes"],
                        -len(item["plate_number"]),
                    ),
                )

            plate_number = representative["plate_number"]
            if not is_valid_plate(plate_number):
                continue

            member_states_by_track = {
                state.track_id: state
                for member in members
                for state in member["states"]
            }
            member_states = list(member_states_by_track.values())
            matching_states = [
                state for state in member_states if state.votes.get(plate_number)
            ]
            best_state = max(
                matching_states or member_states,
                key=lambda state: (
                    state.vote_scores.get(plate_number, 0.0)
                    / max(1, state.votes.get(plate_number, 1)),
                    state.best_confidence,
                    state.best_quality,
                ),
            )

            vehicle_votes: Counter = Counter()
            plate_type_votes: Counter = Counter()
            for state in member_states:
                vehicle_votes.update(state.vehicle_votes)
                plate_type_votes.update(state.plate_type_votes)
            vehicle_type = (
                vehicle_votes.most_common(1)[0][0]
                if vehicle_votes
                else best_state.vehicle_type
            )
            plate_type = (
                plate_type_votes.most_common(1)[0][0]
                if plate_type_votes
                else best_state.plate_type
            )

            total_votes = sum(member["votes"] for member in members)
            first_pts_ms = cluster["first_pts_ms"]
            confidence_score = representative["confidence"]
            quality = representative["quality"]

            crop_reference = ""
            if (
                self.save_crops
                and best_state.best_crop is not None
                and best_state.best_crop.size > 0
            ):
                crop_path = crops_dir / f"{job.id}_track{best_state.track_id}_{plate_number}.jpg"
                written = cv2.imwrite(
                    str(crop_path),
                    best_state.best_crop,
                    [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY],
                )
                if written:
                    crop_reference = str(crop_path)

            first_seconds = first_pts_ms / 1000.0
            records.append(
                PlateRecord(
                    id=f"rec-{uuid.uuid4().hex[:12]}",
                    job_id=job.id,
                    job_filename=job.filename,
                    track_id=best_state.track_id,
                    plate_number=plate_number,
                    plate_display=format_plate(plate_number),
                    province=province_name(plate_number),
                    plate_type=plate_type,
                    vehicle_type=vehicle_type,
                    confidence_score=confidence_score,
                    quality_score=quality,
                    crop_image_url=crop_reference,
                    pts_ms=first_pts_ms,
                    video_time_str=format_seconds(first_seconds),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    video_url=str(video_path),
                    votes=total_votes,
                    source=best_state.source,
                )
            )

        records.sort(key=lambda record: (record.pts_ms, record.plate_number))
        return records

    @staticmethod
    def _write_results(
        results_json: Path,
        results_csv: Path,
        job: VideoJob,
        records: list[PlateRecord],
    ) -> None:
        payload = {
            "job": {
                "id": job.id,
                "filename": job.filename,
                "stage": job.stage,
                "total_frames": job.total_frames,
                "processed_frames": job.processed_frames,
                "duration_seconds": job.duration_seconds,
                "current_fps": round(job.current_fps, 2),
                "detected_plates_count": job.detected_plates_count,
                "created_at": job.created_at,
                "completed_at": job.completed_at,
            },
            "records": [record.to_dict() for record in records],
        }
        results_json.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        fieldnames = [
            "id",
            "job_id",
            "job_filename",
            "track_id",
            "plate_number",
            "plate_display",
            "province",
            "plate_type",
            "vehicle_type",
            "confidence_score",
            "quality_score",
            "pts_ms",
            "video_time_str",
            "votes",
            "source",
            "crop_image_url",
        ]
        with results_csv.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for record in records:
                row = record.to_dict()
                writer.writerow({key: row.get(key, "") for key in fieldnames})
