"""Generate a realistic traffic camera simulation video from genuine vehicle images."""

import cv2
import numpy as np
from pathlib import Path
import random

PROJECT_ROOT = Path(__file__).resolve().parent.parent
IMAGE_DIR = PROJECT_ROOT / "data" / "datasets" / "car_plate_detection" / "images"
OUTPUT_VIDEO = PROJECT_ROOT / "data" / "sample_videos" / "traffic_benchmark_cars.mp4"

WIDTH = 1280
HEIGHT = 720
FPS = 25
SECONDS_PER_CAR = 3.0
FRAMES_PER_CAR = int(FPS * SECONDS_PER_CAR)

def create_traffic_video():
    if not IMAGE_DIR.is_dir():
        print(f"[ERROR] Image directory not found: {IMAGE_DIR}")
        return

    # Pick 10 representative vehicle images
    sample_indices = [0, 1, 10, 25, 50, 75, 100, 150, 200, 250, 300, 350]
    image_paths = []
    for idx in sample_indices:
        p = IMAGE_DIR / f"Cars{idx}.png"
        if p.is_file():
            image_paths.append(p)

    if not image_paths:
        print("[WARN] Specific indices not found, selecting first 10 pngs")
        image_paths = sorted(list(IMAGE_DIR.glob("*.png")))[:10]

    print(f"[INFO] Compiling {len(image_paths)} genuine vehicles into traffic video: {OUTPUT_VIDEO}")
    
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(OUTPUT_VIDEO), fourcc, FPS, (WIDTH, HEIGHT))

    total_frames = 0
    for img_idx, p in enumerate(image_paths):
        img = cv2.imread(str(p))
        if img is None:
            continue
        h, w = img.shape[:2]

        for frame_i in range(FRAMES_PER_CAR):
            progress = frame_i / float(FRAMES_PER_CAR)
            # Simulate vehicle driving closer (scale from 0.85 to 1.10)
            scale = 0.85 + 0.25 * progress
            cur_w = int(w * scale)
            cur_h = int(h * scale)
            resized = cv2.resize(img, (cur_w, cur_h), interpolation=cv2.INTER_LINEAR)

            # Center crop or pad onto canvas
            canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
            # Create a subtle dark road background
            canvas[:] = (40, 42, 45)

            # Calculate placement
            x_start = max(0, (WIDTH - cur_w) // 2)
            y_start = max(0, (HEIGHT - cur_h) // 2)
            
            # Source crop if larger than canvas
            src_x = max(0, (cur_w - WIDTH) // 2)
            src_y = max(0, (cur_h - HEIGHT) // 2)
            
            crop_w = min(WIDTH, cur_w)
            crop_h = min(HEIGHT, cur_h)

            canvas[y_start:y_start+crop_h, x_start:x_start+crop_w] = resized[src_y:src_y+crop_h, src_x:src_x+crop_w]

            # Add simulated CCTV timestamp overlay in top corner
            time_str = f"CAM-01 [ENTRANCE] | 2026-10-22 16:30:{total_frames // FPS:02d}.{(total_frames % FPS) * 4:02d}"
            cv2.putText(canvas, time_str, (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(canvas, f"VEHICLE #{img_idx + 1:02d}", (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 2, cv2.LINE_AA)

            out.write(canvas)
            total_frames += 1

    out.release()
    print(f"[SUCCESS] Created {OUTPUT_VIDEO.name}: {total_frames} frames ({total_frames / FPS:.1f}s), size: {OUTPUT_VIDEO.stat().st_size / (1024*1024):.2f} MB")

if __name__ == "__main__":
    create_traffic_video()
