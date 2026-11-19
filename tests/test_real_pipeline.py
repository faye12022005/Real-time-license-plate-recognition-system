"""End-to-end integration test processing a real generated MP4 video through ALPR pipeline."""

import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import cv2  # type: ignore
import numpy as np  # type: ignore
from config.settings import SAMPLES_DIR, CAPTURES_DIR
from src.database.connection import init_db
from src.database.repository import get_video_job, list_plates, insert_video_job
from src.pipeline.alpr_pipeline import ALPRPipeline
from src.core.detector import PlateDetector, PlateDetection


def create_synthetic_test_video(output_path: Path, num_frames: int = 30) -> None:
    """Generate a valid MP4 video containing moving vehicle and plate."""
    width, height = 640, 480
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(output_path), fourcc, 25.0, (width, height))

    for i in range(num_frames):
        # Gray background
        frame = np.ones((height, width, 3), dtype=np.uint8) * 120

        # Draw moving car (blue rectangle)
        x_car = 100 + i * 5
        y_car = 200
        cv2.rectangle(frame, (x_car, y_car), (x_car + 200, y_car + 120), (255, 0, 0), -1)

        # Draw white license plate
        x_plate = x_car + 50
        y_plate = y_car + 70
        cv2.rectangle(frame, (x_plate, y_plate), (x_plate + 100, y_plate + 35), (255, 255, 255), -1)
        cv2.rectangle(frame, (x_plate, y_plate), (x_plate + 100, y_plate + 35), (0, 0, 0), 2)

        # Text on plate
        cv2.putText(
            frame,
            "51K-888.88",
            (x_plate + 5, y_plate + 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            2,
        )

        out.write(frame)

    out.release()


class MockDetector(PlateDetector):
    """Detector stub that finds the synthetic plate for testing."""

    def detect(self, frame: np.ndarray) -> list[PlateDetection]:
        # Locate the white plate
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, (0, 0, 200), (180, 40, 255))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        dets = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if 80 <= w <= 130 and 25 <= h <= 50:
                roi = frame[y : y + h, x : x + w].copy()
                dets.append(
                    PlateDetection(
                        bbox=(x, y, x + w, y + h),
                        confidence=0.96,
                        class_id=0,
                        class_name="plate_1_line",
                        cropped_roi=roi,
                    )
                )
        return dets


def test_real_video_pipeline_execution():
    """Verify end-to-end video processing from file to DB records and crop files."""
    init_db()

    job_id = "job-e2e-real-test"
    test_video_path = SAMPLES_DIR / "synthetic_traffic_test.mp4"

    # 1. Create real MP4 video
    create_synthetic_test_video(test_video_path, num_frames=30)
    assert test_video_path.is_file()
    assert test_video_path.stat().st_size > 1000

    # 2. Register initial job
    insert_video_job(
        {
            "id": job_id,
            "filename": test_video_path.name,
            "file_size_bytes": test_video_path.stat().st_size,
            "stage": "UPLOADED",
            "stage_progress_pct": 0.0,
            "overall_progress_pct": 5.0,
            "total_frames": 30,
            "processed_frames": 0,
            "duration_seconds": 1.2,
            "current_fps": 0.0,
            "eta_seconds": 0.0,
            "detected_plates_count": 0,
            "video_url": f"/static/videos/{test_video_path.name}",
            "error_message": None,
            "created_at": "2026-10-16T10:00:00Z",
            "completed_at": None,
        }
    )

    # 3. Process video using ALPRPipeline
    pipeline = ALPRPipeline(detector=MockDetector())
    pipeline.process_video_job(job_id, test_video_path, frame_step=1)

    # 4. Verify Job completed
    job = get_video_job(job_id)
    assert job is not None
    assert job["stage"] == "COMPLETED"
    assert job["overall_progress_pct"] == 100.0
    assert job["processed_frames"] == 30
    assert job["detected_plates_count"] >= 1

    # 5. Verify Plate record in DB
    plates = list_plates(job_id=job_id)
    assert len(plates) >= 1
    p = plates[0]
    assert p["job_id"] == job_id
    assert p["crop_image_url"].startswith(f"/static/captures/{job_id}/")

    # 6. Verify crop image file on disk
    crop_filename = Path(p["crop_image_url"]).name
    saved_crop_file = CAPTURES_DIR / job_id / crop_filename
    assert saved_crop_file.is_file()
    assert saved_crop_file.stat().st_size > 100

    print(f"[SUCCESS] Real video pipeline test passed! Verified {job['processed_frames']} frames and plate {p['plate_display']}.")


if __name__ == "__main__":
    test_real_video_pipeline_execution()
