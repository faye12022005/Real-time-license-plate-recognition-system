import os
import sys
import time
from pathlib import Path
import requests
import cv2

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = PROJECT_ROOT / "data" / "sample_videos"
TARGET_DIR.mkdir(parents=True, exist_ok=True)

url = "https://raw.githubusercontent.com/computervisioneng/real-time-number-plate-recognition-anpr/main/sample_30fps_1440.mp4"
dest = TARGET_DIR / "traffic_sample_1440p.mp4"

print(f"[INFO] Downloading {url} -> {dest}...")
t0 = time.time()
r = requests.get(url, stream=True, timeout=60)
if r.status_code == 200:
    total_size = int(r.headers.get("content-length", 0))
    downloaded = 0
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 512):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = (downloaded / total_size) * 100
                    print(f"\r[DOWNLOAD] {downloaded / 1024 / 1024:.2f} MB / {total_size / 1024 / 1024:.2f} MB ({pct:.1f}%)", end="")
    print(f"\n[SUCCESS] Download completed in {time.time() - t0:.2f}s! File size: {dest.stat().st_size / 1024 / 1024:.2f} MB")
    
    # Inspect video with OpenCV
    cap = cv2.VideoCapture(str(dest))
    if cap.isOpened():
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0
        print(f"[INSPECT] Resolution: {width}x{height}")
        print(f"[INSPECT] FPS: {fps:.2f}")
        print(f"[INSPECT] Total Frames: {frame_count}")
        print(f"[INSPECT] Duration: {duration:.2f}s")
        cap.release()
    else:
        print("[WARN] Could not open video with OpenCV")
else:
    print(f"[ERROR] HTTP status {r.status_code}")
