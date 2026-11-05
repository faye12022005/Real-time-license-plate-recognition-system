"""FastAPI router for AI Model Training, Evaluation, and Pipeline Status."""

import json
from pathlib import Path
import threading
from typing import Any, Dict, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from config.settings import PROJECT_ROOT

router = APIRouter(prefix="/training", tags=["Model Training"])

MODELS_DIR = PROJECT_ROOT / "models"
SUMMARY_PATH = MODELS_DIR / "training_summary.json"
REPORT_PATH = MODELS_DIR / "evaluation_report.json"
WEIGHTS_PATH = MODELS_DIR / "plate_detector.pt"

# Global training lock & status state
_TRAINING_LOCK = threading.Lock()
_TRAINING_STATE = {
    "is_training": False,
    "status": "IDLE",
    "current_epoch": 0,
    "total_epochs": 0,
    "start_time": None,
    "last_error": None,
}


class TrainRequest(BaseModel):
    model: str = Field("yolov8n.pt", description="Kiến trúc mô hình nền: yolov8n.pt | yolo11n.pt", examples=["yolov8n.pt"])
    epochs: int = Field(15, description="Số epoch huấn luyện", ge=1, le=100, examples=[15])
    batch_size: int = Field(16, description="Kích thước batch", ge=1, le=64, examples=[16])
    img_size: int = Field(640, description="Độ phân giải đầu vào", examples=[640])
    patience: int = Field(8, description="Early stopping patience", examples=[8])


def _run_training_worker(req: TrainRequest):
    global _TRAINING_STATE
    try:
        from scripts.train_detector import train
        _TRAINING_STATE["is_training"] = True
        _TRAINING_STATE["status"] = "TRAINING"
        _TRAINING_STATE["total_epochs"] = req.epochs

        train(
            base_model=req.model,
            epochs=req.epochs,
            batch_size=req.batch_size,
            img_size=req.img_size,
            device="cpu",
            patience=req.patience,
            workers=2,
        )

        _TRAINING_STATE["status"] = "COMPLETED"
    except Exception as e:
        _TRAINING_STATE["status"] = "FAILED"
        _TRAINING_STATE["last_error"] = str(e)
    finally:
        _TRAINING_STATE["is_training"] = False


@router.get("/status")
def get_training_status() -> Dict[str, Any]:
    """Lấy trạng thái hiện tại của mô hình AI và tiến trình huấn luyện."""
    model_exists = WEIGHTS_PATH.is_file()
    model_size_mb = round(WEIGHTS_PATH.stat().st_size / (1024 * 1024), 2) if model_exists else 0.0

    last_summary = {}
    if SUMMARY_PATH.is_file():
        try:
            last_summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    return {
        "model_available": model_exists,
        "model_path": str(WEIGHTS_PATH),
        "model_size_mb": model_size_mb,
        "training_state": _TRAINING_STATE,
        "last_training_summary": last_summary,
    }


@router.post("/start")
def start_training(req: TrainRequest, background_tasks: BackgroundTasks):
    """Kích hoạt tiến trình huấn luyện mô hình YOLO phát hiện biển số xe (chạy ngầm)."""
    if _TRAINING_STATE["is_training"]:
        raise HTTPException(
            status_code=409,
            detail="Tiến trình huấn luyện đang chạy. Vui lòng chờ phiên hiện tại hoàn tất.",
        )

    _TRAINING_STATE["is_training"] = True
    _TRAINING_STATE["status"] = "STARTING"
    _TRAINING_STATE["last_error"] = None

    background_tasks.add_task(_run_training_worker, req)

    return {
        "status": "accepted",
        "message": f"Đã bắt đầu huấn luyện mô hình {req.model} ({req.epochs} epochs, batch {req.batch_size})",
        "config": req.dict(),
    }


@router.post("/prepare-dataset")
def prepare_yolo_dataset(val_ratio: float = Query(0.2, ge=0.1, le=0.4, description="Tỷ lệ tập validation")):
    """Chuyển đổi và phân chia lại bộ dữ liệu Kaggle Pascal VOC sang chuẩn YOLO."""
    from scripts.prepare_yolo_dataset import prepare_dataset, verify_dataset
    try:
        stats = prepare_dataset(val_ratio=val_ratio)
        is_valid = verify_dataset()
        return {
            "status": "success",
            "message": "Đã chuyển đổi và xác minh toàn vẹn dataset thành công!",
            "is_valid": is_valid,
            "statistics": stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi chuẩn bị dataset: {e}")


@router.get("/metrics")
def get_evaluation_metrics():
    """Xem báo cáo đánh giá độ chính xác (mAP50, Precision, Recall) và đo lường FPS thực tế."""
    if REPORT_PATH.is_file():
        try:
            return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    if SUMMARY_PATH.is_file():
        try:
            return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    raise HTTPException(
        status_code=404,
        detail="Chưa có báo cáo đánh giá. Hãy chạy scripts/evaluate_detector.py trước.",
    )
