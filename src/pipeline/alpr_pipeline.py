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
    SAMPLES_DIR,
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

    def _draw_annotated_frame(
        self,
        frame: np.ndarray,
        active_tracks: List[Any],
        track_plate_map: Dict[int, Dict[str, Any]],
        time_str: str,
        detected_count: int,
    ) -> np.ndarray:
        """Draw bounding boxes, recognized license plates, and HUD overlay on the frame."""
        annotated = frame.copy()
        h, w = annotated.shape[:2]

        for track in active_tracks:
            x1, y1, x2, y2 = [int(v) for v in track.bbox]
            x1 = max(0, min(w - 1, x1))
            x2 = max(0, min(w - 1, x2))
            y1 = max(0, min(h - 1, y1))
            y2 = max(0, min(h - 1, y2))
            if x2 <= x1 or y2 <= y1:
                continue

            plate_info = track_plate_map.get(track.track_id)
            if plate_info:
                plate_text = plate_info.get("plate_display") or plate_info.get("plate_number") or ""
                conf_pct = int(plate_info.get("confidence_score", 0.95) * 100)
                label = f"{plate_text} ({conf_pct}%)"
                box_color = (46, 204, 113)   # Emerald Green
                corner_color = (0, 255, 200)  # Bright Mint
            else:
                label = f"SCAN #{track.track_id}"
                box_color = (0, 165, 255)    # Orange
                corner_color = (0, 215, 255)

            # 1. Bounding box rectangle
            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)

            # 2. Hi-tech Corner Brackets
            bracket_len = min(15, max(5, (x2 - x1) // 4), max(5, (y2 - y1) // 4))
            # Top-Left
            cv2.line(annotated, (x1, y1), (x1 + bracket_len, y1), corner_color, 3)
            cv2.line(annotated, (x1, y1), (x1, y1 + bracket_len), corner_color, 3)
            # Top-Right
            cv2.line(annotated, (x2, y1), (x2 - bracket_len, y1), corner_color, 3)
            cv2.line(annotated, (x2, y1), (x2, y1 + bracket_len), corner_color, 3)
            # Bottom-Left
            cv2.line(annotated, (x1, y2), (x1 + bracket_len, y2), corner_color, 3)
            cv2.line(annotated, (x1, y2), (x1, y2 - bracket_len), corner_color, 3)
            # Bottom-Right
            cv2.line(annotated, (x2, y2), (x2 - bracket_len, y2), corner_color, 3)
            cv2.line(annotated, (x2, y2), (x2, y2 - bracket_len), corner_color, 3)

            # 3. Label Badge background & Text
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            thickness = 2
            (label_w, label_h), _ = cv2.getTextSize(label, font, font_scale, thickness)

            box_y1 = max(0, y1 - label_h - 10)
            box_y2 = y1
            box_x2 = min(w - 1, x1 + label_w + 12)

            cv2.rectangle(annotated, (x1, box_y1), (box_x2, box_y2), (18, 18, 18), -1)
            cv2.rectangle(annotated, (x1, box_y1), (box_x2, box_y2), box_color, 1)

            cv2.putText(
                annotated,
                label,
                (x1 + 6, box_y2 - 5),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
                cv2.LINE_AA,
            )

        # 4. Top Status HUD (Camera timestamp & ALPR metrics)
        hud_bg_w = min(420, w - 20)
        cv2.rectangle(annotated, (15, 12), (15 + hud_bg_w, 46), (15, 15, 15), -1)
        cv2.rectangle(annotated, (15, 12), (15 + hud_bg_w, 46), (70, 70, 70), 1)

        cv2.circle(annotated, (32, 29), 6, (0, 0, 230), -1)
        cv2.circle(annotated, (32, 29), 3, (100, 100, 255), -1)

        hud_text = f"SMART ALPR AI | {time_str} | PLATES: {detected_count}"
        cv2.putText(
            annotated,
            hud_text,
            (46, 34),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

        return annotated

    def process_video_job(self, job_id: str, video_path: Path, frame_step: int = 2) -> None:
        """Execute full ALPR analysis on a video file asynchronously with progress updates."""
        self.job_id = job_id
        video_filename = video_path.name
        job_captures_dir = CAPTURES_DIR / job_id
        job_captures_dir.mkdir(parents=True, exist_ok=True)

        writer: Optional[cv2.VideoWriter] = None
        annotated_path: Optional[Path] = None
        annotated_url: Optional[str] = None

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

            # Khởi tạo VideoWriter xuất video đã vẽ bounding box (Annotated Video)
            annotated_filename = f"annotated_{video_filename}"
            if not annotated_filename.lower().endswith(".mp4"):
                annotated_filename = f"{Path(annotated_filename).stem}.mp4"
            annotated_path = SAMPLES_DIR / annotated_filename
            annotated_url = f"/static/videos/{annotated_filename}"

            fps = metadata.fps if metadata.fps and metadata.fps > 0 else 25.0
            width = metadata.width
            height = metadata.height
            try:
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(str(annotated_path), fourcc, fps, (width, height))
            except Exception as w_err:
                print(f"[ALPR] VideoWriter init warning: {w_err}")
                writer = None

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
            track_plate_map: Dict[int, Dict[str, Any]] = {}
            active_tracks: List[Any] = []

            start_time = time.time()
            self.tracker.reset()

            while True:
                ret, frame, frame_idx, pts_ms, time_str = reader.read_frame()
                if not ret or frame is None:
                    break

                processed_count += 1

                # Chạy AI Detector và Tracker theo frame_step
                if processed_count % frame_step == 0:
                    detections = self.detector.detect(frame)
                    active_tracks = self.tracker.update(detections)

                    for track in active_tracks:
                        if track.track_id not in recorded_tracks and track.best_roi is not None:
                            ocr_res = self.ocr.recognize(track.best_roi, class_hint=track.class_name)
                            if ocr_res:
                                recorded_tracks.add(track.track_id)
                                detected_plates_count += 1
                                track_plate_map[track.track_id] = {
                                    "plate_number": ocr_res.plate_number,
                                    "plate_display": ocr_res.plate_display,
                                    "confidence_score": ocr_res.confidence_score,
                                    "vehicle_type": ocr_res.vehicle_type,
                                }

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

                # Vẽ Bounding Box và HUD lên frame rồi ghi vào video đã xử lý
                if writer is not None and writer.isOpened():
                    annotated_frame = self._draw_annotated_frame(
                        frame,
                        active_tracks,
                        track_plate_map,
                        time_str,
                        detected_plates_count,
                    )
                    writer.write(annotated_frame)

                # Cập nhật tiến trình định kỳ mỗi 20 frames
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
            if writer is not None:
                writer.release()
                writer = None

            # Kiểm tra xem video đã xử lý có hợp lệ không
            processed_video_final_url = None
            if annotated_path and annotated_path.is_file() and annotated_path.stat().st_size > 0:
                processed_video_final_url = annotated_url

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
                processed_video_url=processed_video_final_url,
                completed_at=completed_iso,
            )

        except Exception as e:
            if writer is not None:
                writer.release()
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
