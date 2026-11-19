"""Quick test script to run inference on a sample image and draw detected license plates."""

import argparse
from pathlib import Path
import sys
import cv2  # type: ignore

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.detector import PlateDetector
from config.settings import CAPTURES_DIR


def test_inference(image_path: Optional[Path] = None):
    # Default sample image
    if image_path is None or not image_path.is_file():
        default_sample = PROJECT_ROOT / "data" / "datasets" / "car_plate_detection" / "images" / "Cars0.png"
        if not default_sample.is_file():
            # Pick any image from dataset
            samples = list((PROJECT_ROOT / "data" / "datasets" / "car_plate_detection" / "images").glob("*.png"))
            if samples:
                default_sample = samples[0]
        image_path = default_sample

    print("\n" + "=" * 65)
    print(" 🚗 KIỂM THỬ NHẬN DIỆN BIỂN SỐ XE THỰC TẾ (INFERENCE TEST)")
    print("=" * 65)
    print(f" • Tệp ảnh kiểm thử: {image_path}")

    frame = cv2.imread(str(image_path))
    if frame is None:
        print(f"[ERROR] Không đọc được ảnh: {image_path}")
        return

    # Initialize PlateDetector (loads models/plate_detector.pt)
    detector = PlateDetector()
    if not detector.is_ready():
        print("[ERROR] Mô hình PlateDetector chưa sẵn sàng hoặc thiếu file models/plate_detector.pt!")
        return

    # Detect
    detections = detector.detect(frame)
    print(f"[*] Phát hiện: {len(detections)} biển số xe trong ảnh.")

    annotated = frame.copy()
    for idx, det in enumerate(detections):
        x1, y1, x2, y2 = det.bbox
        conf = det.confidence
        cls_name = det.class_name

        print(f"   • Biển #{idx+1}: Box=({x1}, {y1}, {x2}, {y2}), Phân loại={cls_name}, Độ tin cậy={conf*100:.1f}%")

        # Draw box and label
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            annotated,
            f"{cls_name} ({conf*100:.0f}%)",
            (x1, max(20, y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )

    # Save output visualization
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = CAPTURES_DIR / "test_prediction.jpg"
    cv2.imwrite(str(out_path), annotated)
    print("-" * 65)
    print(f" ✅ Đã lưu ảnh kết quả vẽ Bounding Box tại: {out_path}")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    from typing import Optional
    parser = argparse.ArgumentParser(description="Chạy kiểm thử nhận diện trên 1 ảnh bất kỳ")
    parser.add_argument("--image", type=str, default=None, help="Đường dẫn file ảnh kiểm thử")
    args = parser.parse_args()

    img = Path(args.image) if args.image else None
    test_inference(img)
