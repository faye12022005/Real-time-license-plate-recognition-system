"""Model evaluation and real-time benchmark script for YOLO Plate Detector.

Evaluates:
  1. Detection Accuracy: mAP50, mAP50-95, Precision, Recall on Validation dataset
  2. Real-Time Performance: Inference latency (ms) and Throughput (FPS) on CPU/GPU
"""

import argparse
import json
from pathlib import Path
import sys
import time
import numpy as np  # type: ignore

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from ultralytics import YOLO

DATASET_YAML = PROJECT_ROOT / "data" / "datasets" / "yolo_plate_dataset" / "dataset.yaml"
DEFAULT_MODEL_PATH = PROJECT_ROOT / "models" / "plate_detector.pt"


def evaluate_and_benchmark(
    model_path: Path = DEFAULT_MODEL_PATH,
    dataset_yaml: Path = DATASET_YAML,
    device: str = "cpu",
    benchmark_iters: int = 50,
) -> dict:
    """Evaluate accuracy on validation set and benchmark FPS latency."""
    print("\n" + "=" * 65)
    print(" 📊 ĐÁNH GIÁ ĐỘ CHÍNH XÁC & BENCHMARK TỐC ĐỘ THỰC TẾ (REAL-TIME)")
    print("=" * 65)
    print(f" • Tệp mô hình       : {model_path}")
    print(f" • Tệp nhãn kiểm thử : {dataset_yaml}")
    print(f" • Thiết bị đo lường : {device.upper()}")
    print("-" * 65)

    if not model_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy trọng số tại {model_path}!")

    model = YOLO(str(model_path))

    # 1. Evaluate accuracy on Validation Set
    print("\n[*] 1. Đang tính toán ma trận độ chính xác trên tập Validation...")
    val_results = model.val(data=str(dataset_yaml), device=device, verbose=False)

    box = val_results.box
    map50 = float(box.map50)
    map50_95 = float(box.map)
    precision = float(box.mp)
    recall = float(box.mr)

    # Class-specific mAP50
    class_map50 = {}
    names = val_results.names
    for idx, name in names.items():
        if idx < len(box.maps):
            class_map50[name] = float(box.maps[idx])

    print("\n" + "-" * 65)
    print(" 🎯 KẾT QUẢ ĐỘ CHÍNH XÁC (ACCURACY METRICS):")
    print("-" * 65)
    print(f" • mAP@50 (Toàn bộ)   : {map50 * 100:.2f}%")
    print(f" • mAP@50-95          : {map50_95 * 100:.2f}%")
    print(f" • Precision (Độ chuẩn): {precision * 100:.2f}%")
    print(f" • Recall (Độ bao phủ) : {recall * 100:.2f}%")
    for cls_name, val in class_map50.items():
        print(f"   - {cls_name:18}: mAP50 = {val * 100:.2f}%")

    # 2. Benchmark Inference Latency & FPS
    print("\n" + "-" * 65)
    print(f"[*] 2. Đang đo tốc độ xử lý thời gian thực ({benchmark_iters} vòng lặp)...")
    print("-" * 65)

    # Test synthetic frame 1280x720 (Standard HD Camera)
    test_frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)

    # Warmup
    for _ in range(5):
        _ = model.predict(source=test_frame, device=device, verbose=False)

    latencies = []
    for _ in range(benchmark_iters):
        t0 = time.perf_counter()
        _ = model.predict(source=test_frame, device=device, verbose=False)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000)  # ms

    avg_latency = float(np.mean(latencies))
    min_latency = float(np.min(latencies))
    p95_latency = float(np.percentile(latencies, 95))
    fps = 1000.0 / avg_latency if avg_latency > 0 else 0.0

    print(f" • Độ phân giải kiểm tra: 1280x720 (HD RTSP Stream)")
    print(f" • Độ trễ trung bình    : {avg_latency:.2f} ms")
    print(f" • Độ trễ tốt nhất      : {min_latency:.2f} ms")
    print(f" • Độ trễ p95           : {p95_latency:.2f} ms")
    print(f" • Tốc độ xử lý (FPS)   : {fps:.1f} FPS")

    realtime_status = "ĐẠT CHUẨN REAL-TIME (> 30 FPS)" if fps >= 30 else "KHẢ QUAN (Cần tối ưu thread)"
    print(f" • Đánh giá thời gian thực: {realtime_status}")
    print("=" * 65 + "\n")

    report = {
        "model_path": str(model_path),
        "device": device,
        "metrics": {
            "mAP50": round(map50, 4),
            "mAP50_95": round(map50_95, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "classes": {k: round(v, 4) for k, v in class_map50.items()},
        },
        "performance": {
            "resolution": "1280x720",
            "avg_latency_ms": round(avg_latency, 2),
            "min_latency_ms": round(min_latency, 2),
            "p95_latency_ms": round(p95_latency, 2),
            "fps": round(fps, 1),
            "is_realtime": fps >= 30,
        },
    }

    report_path = model_path.parent / "evaluation_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Đánh giá mô hình nhận diện biển số")
    parser.add_argument("--model", type=str, default=str(DEFAULT_MODEL_PATH), help="Đường dẫn file .pt")
    parser.add_argument("--device", type=str, default="cpu", help="Thiết bị đo lường (cpu hoặc cuda)")
    parser.add_argument("--iters", type=int, default=30, help="Số lần lặp đo tốc độ")

    args = parser.parse_args()
    evaluate_and_benchmark(
        model_path=Path(args.model),
        device=args.device,
        benchmark_iters=args.iters,
    )
