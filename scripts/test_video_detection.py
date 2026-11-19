import cv2
import torch
from pathlib import Path
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent
video_path = PROJECT_ROOT / "data" / "sample_videos" / "traffic_sample_1440p.mp4"
model_path = PROJECT_ROOT / "models" / "plate_detector.pt"

print(f"[INFO] Loading model from {model_path}...")
model = YOLO(str(model_path))

cap = cv2.VideoCapture(str(video_path))
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"[INFO] Video loaded: {total_frames} frames, {fps:.1f} FPS")

detected_plates = 0
tested_frames = 0

# Sample every 15 frames for 300 frames (~10 seconds)
for frame_idx in range(0, min(total_frames, 300), 15):
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    if not ret:
        break
    tested_frames += 1
    results = model(frame, conf=0.25, verbose=False)
    boxes = results[0].boxes
    if len(boxes) > 0:
        detected_plates += len(boxes)
        for box in boxes:
            cls_id = int(box.cls[0].item())
            cls_name = model.names[cls_id]
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()
            print(f"  Frame {frame_idx:4d} ({(frame_idx/fps):.1f}s): [{cls_name}] conf={conf:.2f}, bbox={[round(x, 1) for x in xyxy]}")

cap.release()
print(f"[SUMMARY] Tested {tested_frames} sampled frames, found {detected_plates} license plate detections!")
