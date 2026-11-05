import cv2
from pathlib import Path
from ultralytics import YOLO

model = YOLO("models/plate_detector.pt")
frame = cv2.imread("data/sample_videos/frame_0.jpg")

results = model(frame, conf=0.4, iou=0.5, verbose=True)
boxes = results[0].boxes
print(f"Total detections at conf=0.4: {len(boxes)}")

for box in boxes:
    cls_id = int(box.cls[0].item())
    cls_name = model.names[cls_id]
    conf = float(box.conf[0].item())
    xyxy = [int(v) for v in box.xyxy[0].tolist()]
    w = xyxy[2] - xyxy[0]
    h = xyxy[3] - xyxy[1]
    print(f"Box: {cls_name} conf={conf:.3f} pos={xyxy} size=({w}x{h})")
    cv2.rectangle(frame, (xyxy[0], xyxy[1]), (xyxy[2], xyxy[3]), (0, 255, 0), 2)
    cv2.putText(frame, f"{cls_name} {conf:.2f}", (xyxy[0], max(20, xyxy[1] - 5)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

cv2.imwrite("data/sample_videos/frame_0_detected.jpg", frame)
print("Saved frame_0_detected.jpg")
