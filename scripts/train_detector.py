"""Training script for YOLO License Plate Detector.

Fine-tunes YOLOv8n / YOLOv11n on the prepared license plate dataset (1-line & 2-line plates).
Automatically saves the best model weights to `models/plate_detector.pt` for real-time inference.
"""

import argparse
import json
from pathlib import Path
import shutil
import sys
import time

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

DATASET_YAML = PROJECT_ROOT / "data" / "datasets" / "yolo_plate_dataset" / "dataset.yaml"
OUTPUT_MODELS_DIR = PROJECT_ROOT / "models"
TARGET_MODEL_PATH = OUTPUT_MODELS_DIR / "plate_detector.pt"


def train(
    base_model: str = "yolov8n.pt",
    epochs: int = 30,
    batch_size: int = 16,
    img_size: int = 640,
    device: str = "cpu",
    patience: int = 8,
    workers: int = 4,
) -> Path:
    """Train YOLO model on the license plate dataset and save to models/plate_detector.pt."""
    from ultralytics import YOLO

    OUTPUT_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 65)
    print(" 🚀 BẮT ĐẦU HUẤN LUYỆN MÔ HÌNH NHẬN DIỆN BIỂN SỐ XE (YOLO)")
    print("=" * 65)
    print(f" • Mô hình nền (Base) : {base_model}")
    print(f" • Tệp cấu hình Data   : {DATASET_YAML}")
    print(f" • Kích thước ảnh     : {img_size}x{img_size}")
    print(f" • Batch size          : {batch_size}")
    print(f" • Số Epochs           : {epochs} (Early Stopping: {patience})")
    print(f" • Thiết bị tính toán  : {device.upper()}")
    print(f" • CPU Workers         : {workers}")
    print(f" • Đích lưu trọng số   : {TARGET_MODEL_PATH}")
    print("-" * 65)

    if not DATASET_YAML.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy {DATASET_YAML}. Hãy chạy scripts/prepare_yolo_dataset.py trước!"
        )

    # Load base model
    model = YOLO(base_model)

    start_time = time.time()

    # Train model
    results = model.train(
        data=str(DATASET_YAML),
        epochs=epochs,
        batch=batch_size,
        imgsz=img_size,
        device=device,
        patience=patience,
        workers=workers,
        save=True,
        save_period=-1,
        val=True,
        plots=True,
        verbose=True,
        name="plate_detector_run",
        exist_ok=True,
    )

    elapsed_seconds = round(time.time() - start_time, 2)

    # Locate best.pt
    run_dir = Path(model.trainer.save_dir)
    best_weights = run_dir / "weights" / "best.pt"
    if not best_weights.is_file():
        best_weights = run_dir / "weights" / "last.pt"

    if best_weights.is_file():
        shutil.copy2(best_weights, TARGET_MODEL_PATH)
        print("\n" + "=" * 65)
        print(" 🎉 HUẤN LUYỆN THÀNH CÔNG VÀ ĐÃ XUẤT MÔ HÌNH!")
        print("=" * 65)
        print(f" • Trọng số gốc lưu tại : {best_weights}")
        print(f" • Đã triển khai vào    : {TARGET_MODEL_PATH}")
        print(f" • Dung lượng tệp       : {TARGET_MODEL_PATH.stat().st_size / (1024*1024):.2f} MB")
        print(f" • Thời gian huấn luyện : {elapsed_seconds / 60:.1f} phút ({elapsed_seconds} giây)")

        # Validate trained model
        val_metrics = model.val(data=str(DATASET_YAML), device=device)
        map50 = round(float(val_metrics.box.map50), 4)
        map50_95 = round(float(val_metrics.box.map), 4)
        precision = round(float(val_metrics.box.mp), 4)
        recall = round(float(val_metrics.box.mr), 4)

        print("-" * 65)
        print(f" • mAP@50     : {map50 * 100:.2f}%")
        print(f" • mAP@50-95  : {map50_95 * 100:.2f}%")
        print(f" • Precision  : {precision * 100:.2f}%")
        print(f" • Recall     : {recall * 100:.2f}%")
        print("=" * 65 + "\n")

        # Save training summary
        summary = {
            "base_model": base_model,
            "epochs_target": epochs,
            "batch_size": batch_size,
            "img_size": img_size,
            "training_duration_seconds": elapsed_seconds,
            "model_path": str(TARGET_MODEL_PATH),
            "model_size_mb": round(TARGET_MODEL_PATH.stat().st_size / (1024 * 1024), 2),
            "metrics": {
                "mAP50": map50,
                "mAP50_95": map50_95,
                "precision": precision,
                "recall": recall,
            },
            "classes": {0: "plate_1_line", 1: "plate_2_line"},
        }
        summary_path = OUTPUT_MODELS_DIR / "training_summary.json"
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[*] Báo cáo huấn luyện đã lưu tại: {summary_path}")

    return TARGET_MODEL_PATH


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Huấn luyện mô hình YOLO nhận diện biển số xe")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Mô hình nền (yolov8n.pt, yolo11n.pt)")
    parser.add_argument("--epochs", type=int, default=30, help="Số epoch huấn luyện (mặc định: 30)")
    parser.add_argument("--batch", type=int, default=16, help="Kích thước batch (mặc định: 16)")
    parser.add_argument("--imgsz", type=int, default=640, help="Kích thước ảnh đầu vào (mặc định: 640)")
    parser.add_argument("--device", type=str, default="cpu", help="Thiết bị: cpu hoặc cuda")
    parser.add_argument("--patience", type=int, default=8, help="Early stopping patience")
    parser.add_argument("--workers", type=int, default=4, help="Số worker CPU nạp dữ liệu")

    args = parser.parse_args()

    train(
        base_model=args.model,
        epochs=args.epochs,
        batch_size=args.batch,
        img_size=args.imgsz,
        device=args.device,
        patience=args.patience,
        workers=args.workers,
    )
