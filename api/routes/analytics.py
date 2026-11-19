"""Analytics and KPI endpoints."""

from fastapi import APIRouter
from api.video_manager import video_manager
from src.database.repository import get_kpis

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/kpis")
def read_kpis():
    """Retrieve dashboard KPIs (total videos, plates detected, unique plates, avg accuracy)."""
    db_kpis = get_kpis()
    vm_stats = video_manager.analytics()
    total_videos = max(int(db_kpis.get("total_videos") or 0), int(vm_stats.get("total_jobs") or 0))
    total_plates = max(int(db_kpis.get("total_plates_detected") or 0), int(vm_stats.get("total_records") or 0))
    unique_plates = max(int(db_kpis.get("unique_plates_count") or 0), int(vm_stats.get("unique_plates") or 0))
    avg_conf = float(db_kpis.get("avg_accuracy_pct") or 0.0)
    if avg_conf <= 0 and vm_stats.get("average_confidence"):
        avg_conf = round(float(vm_stats["average_confidence"]) * 100, 2)
    return {
        "total_videos": total_videos,
        "total_plates_detected": total_plates,
        "unique_plates_count": unique_plates,
        "avg_accuracy_pct": avg_conf,
    }
