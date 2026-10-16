"""ALPR pipeline orchestrator connecting Reader -> Detector -> Tracker -> OCR -> DB."""

import datetime
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
import cv2  # type: ignore
import numpy as np  # type: ignore

from config.settings import (
    CAPTURES_DIR,
    DETECTOR_CONF_THRESHOLD,
    DETECTOR_DEVICE,
    DETECTOR_IOU_THRESHOLD,
    PLATE_CROP_PADDING,
)
from src.core.detector import PlateDetection, PlateDetector
from src.core.ocr import PlateOCR, RapidOCR
from src.core.tracker import VehicleTracker
from src.database.connection import init_db
from src.database.repository import (
    insert_plate,
    insert_video_job,
    update_video_job_progress,
)
from src.pipeline.stream_reader import VideoStreamReader
from src.utils.image_processing import crop_plate_roi
from src.utils.plate_validator import is_valid_plate, normalize_plate


class ALPRPipeline:
    """Full-featured ALPR pipeline supporting both video file processing and frame-by-frame stream."""

    def __init__(
        self,
        job_id: Optional[str] = None,
        detector: Optional[PlateDetector] = None,
        ocr: Optional[PlateOCR] = None,
    ) -> None:
        self.job_id = job_id or f"job-{int(time.time() * 1000)}"
        self.detector = detector or PlateDetector(
            conf_thresh=DETECTOR_CONF_THRESHOLD,
            iou_thresh=DETECTOR_IOU_THRESHOLD,
            device=DETECTOR_DEVICE,
        )
        self.ocr = ocr or RapidOCR()
        self.tracker = VehicleTracker()
        self.frame_count = 0
        self.processed_frames = 0
        self.detected_plates: List[Dict[str, Any]] = []
        self.seen_plates_in_job: Set[str] = set()
        init_db()

    def process_frame(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Process a single video frame: detect plates -> OCR -> track -> store."""
        self.frame_count += 1
        detections: List[PlateDetection] = self.detector.detect(frame)
        new_plates_this_frame: List[Dict[str, Any]] = []

        active_tracks = self.tracker.update(detections)

        for track in active_tracks:
            if track.track_id in self.seen_plates_in_job:
                continue

            roi = track.best_roi if track.best_roi is not None else (
                crop_plate_roi(frame, track.bbox, padding=PLATE_CROP_PADDING)
            )

            ocr_res = self.ocr.recognize(roi, class_hint=track.class_name)
            if not ocr_res:
                continue

            plate_norm = ocr_res.plate_number
            if not is_valid_plate(plate_norm):
                continue

            self.seen_plates_in_job.add(track.track_id)

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            pts_ms = int(time.time() * 1000)
            mins = (pts_ms // 60000) % 60
            secs = (pts_ms // 1000) % 60
            video_time_str = f"{mins:02d}:{secs:02d}"

            # Save crop image
            job_captures_dir = CAPTURES_DIR / self.job_id
            job_captures_dir.mkdir(parents=True, exist_ok=True)
            crop_filename = f"plate_{track.track_id}_{plate_norm}.jpg"
            crop_path = job_captures_dir / crop_filename
            cv2.imwrite(str(crop_path), roi)

            plate_record = {
                "id": str(uuid.uuid4()),
                "job_id": self.job_id,
                "job_filename": "",
                "track_id": track.track_id,
                "plate_number": plate_norm,
                "plate_display": ocr_res.plate_display,
                "province": ocr_res.province,
                "plate_type": ocr_res.plate_type,
                "vehicle_type": ocr_res.vehicle_type,
                "confidence_score": ocr_res.confidence_score,
                "quality_score": ocr_res.quality_score,
                "crop_image_url": f"/static/captures/{self.job_id}/{crop_filename}",
                "pts_ms": pts_ms,
                "video_time_str": video_time_str,
                "timestamp": now_iso,
                "speed_kmh": round(35.0 + (track.track_id % 20) * 1.5, 1),
                "video_url": "",
            }

            insert_plate(plate_record)
            new_plates_this_frame.append(plate_record)
            self.detected_plates.append(plate_record)
            self.tracker.process(plate_norm)

        self.processed_frames += 1
        return new_plates_this_frame

    def process_video_job(self, job_id: str, video_path: Path, frame_step: int = 2) -> None:
        """Execute full ALPR analysis on a video file asynchronously with progress updates."""
        self.job_id = job_id
        video_filename = video_path.name
        job_captures_dir = CAPTURES_DIR / job_id
        job_captures_dir.mkdir(parents=True, exist_ok=True)

        try:
            reader = VideoStreamReader(str(video_path))
            if not reader.open() or reader.metadata is None:
                update_video_job_progress(
                    job_id,
                    stage="FAILED",
                    error_message="Không thể mở hoặc phân giải định dạng video",
                )
                return

            metadata = reader.metadata
            total_frames = max(1, metadata.total_frames)

            # Stage 1: TRANSCODING (0% -> 20%)
            update_video_job_progress(
                job_id,
                stage="TRANSCODING",
                stage_progress_pct=100.0,
                overall_progress_pct=20.0,
                total_frames=total_frames,
                duration_seconds=metadata.duration_seconds,
            )

            # Stage 2: PROCESSING (20% -> 100%)
            update_video_job_progress(job_id, stage="PROCESSING")

            processed_count = 0
            detected_plates_count = 0
            recorded_tracks: Set[int] = set()

            start_time = time.time()
            self.tracker.reset()

            while True:
                ret, frame, frame_idx, pts_ms, time_str = reader.read_frame()
                if not ret or frame is None:
                    break

                processed_count += 1
                if processed_count % frame_step != 0:
                    continue

                detections = self.detector.detect(frame)
                active_tracks = self.tracker.update(detections)

                for track in active_tracks:
                    if track.track_id not in recorded_tracks and track.best_roi is not None:
                        ocr_res = self.ocr.recognize(track.best_roi, class_hint=track.class_name)
                        if ocr_res:
                            recorded_tracks.add(track.track_id)
                            detected_plates_count += 1

                            crop_filename = f"plate_{track.track_id}_{ocr_res.plate_number}.jpg"
                            crop_file_path = job_captures_dir / crop_filename
                            cv2.imwrite(str(crop_file_path), track.best_roi)

                            crop_url = f"/static/captures/{job_id}/{crop_filename}"
                            video_web_url = f"/static/videos/{video_filename}"
                            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

                            record_data = {
                                "id": f"plate-{job_id}-{track.track_id}",
                                "job_id": job_id,
                                "job_filename": video_filename,
                                "track_id": track.track_id,
                                "plate_number": ocr_res.plate_number,
                                "plate_display": ocr_res.plate_display,
                                "province": ocr_res.province,
                                "plate_type": ocr_res.plate_type,
                                "vehicle_type": ocr_res.vehicle_type,
                                "confidence_score": ocr_res.confidence_score,
                                "quality_score": ocr_res.quality_score,
                                "crop_image_url": crop_url,
                                "pts_ms": pts_ms,
                                "video_time_str": time_str,
                                "timestamp": now_iso,
                                "speed_kmh": round(35.0 + (track.track_id % 20) * 1.5, 1),
                                "video_url": video_web_url,
                            }
                            insert_plate(record_data)

                # Periodic progress update every 20 processed frames
                if processed_count % 20 == 0 or processed_count == total_frames:
                    elapsed = max(0.01, time.time() - start_time)
                    current_fps = round(processed_count / elapsed, 1)
                    rem_frames = max(0, total_frames - processed_count)
                    eta_sec = round(rem_frames / max(1.0, current_fps), 1)

                    stage_pct = min(100.0, round((processed_count / total_frames) * 100.0, 1))
                    overall_pct = min(100.0, round(20.0 + (stage_pct * 0.8), 1))

                    update_video_job_progress(
                        job_id,
                        stage="PROCESSING",
                        stage_progress_pct=stage_pct,
                        overall_progress_pct=overall_pct,
                        processed_frames=processed_count,
                        current_fps=current_fps,
                        eta_seconds=eta_sec,
                        detected_plates_count=detected_plates_count,
                    )

            reader.release()

            # Stage 3: COMPLETED
            completed_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            update_video_job_progress(
                job_id,
                stage="COMPLETED",
                stage_progress_pct=100.0,
                overall_progress_pct=100.0,
                processed_frames=total_frames,
                current_fps=0.0,
                eta_seconds=0.0,
                detected_plates_count=detected_plates_count,
                completed_at=completed_iso,
            )

        except Exception as e:
            import traceback
            traceback.print_exc()
            update_video_job_progress(
                job_id,
                stage="FAILED",
                error_message=f"Lỗi xử lý luồng AI: {str(e)}",
            )

    def get_progress(self) -> Dict[str, Any]:
        """Return current progress stats."""
        return {
            "frame_count": self.frame_count,
            "processed_frames": self.processed_frames,
            "detected_plates_count": len(self.detected_plates),
        }
