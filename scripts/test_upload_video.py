"""Test video upload and pipeline execution via FastAPI endpoint."""

import requests
import time
from pathlib import Path

BASE_URL = "http://localhost:8000/api/v1"
VIDEO_PATH = Path("data/sample_videos/traffic_benchmark_cars.mp4")

def test_upload():
    if not VIDEO_PATH.is_file():
        print(f"[ERROR] Video file not found: {VIDEO_PATH}")
        return

    print(f"[INFO] Uploading {VIDEO_PATH.name} ({VIDEO_PATH.stat().st_size / (1024*1024):.2f} MB) to {BASE_URL}/videos/upload...")
    with open(VIDEO_PATH, "rb") as f:
        files = {"file": (VIDEO_PATH.name, f, "video/mp4")}
        res = requests.post(f"{BASE_URL}/videos/upload", files=files)

    if res.status_code != 200:
        print(f"[ERROR] Upload failed with status {res.status_code}: {res.text}")
        return

    job_data = res.json()
    job_id = job_data.get("job_id")
    print(f"[SUCCESS] Video uploaded! Job ID: {job_id}")
    print(f"[INFO] Initial response: {job_data}")

    # Poll status
    print("[INFO] Polling job status...")
    for _ in range(6):
        time.sleep(2)
        status_res = requests.get(f"{BASE_URL}/videos/jobs/{job_id}")
        if status_res.status_code == 200:
            status = status_res.json()
            stage = status.get("stage")
            progress = status.get("overall_progress_pct", 0)
            plates = status.get("detected_plates_count", 0)
            print(f"  Stage: {stage:<12} | Progress: {progress:5.1f}% | Plates Detected: {plates}")
            if stage in ("COMPLETED", "FAILED"):
                break

if __name__ == "__main__":
    test_upload()
