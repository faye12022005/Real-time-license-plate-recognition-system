"""License plate records and trace endpoints."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.video_manager import video_manager
from src.database.repository import (
    delete_plate,
    delete_plates,
    get_plate,
    get_plate_trace,
    list_plates,
)

router = APIRouter(prefix="/plates", tags=["Plates"])


class PlateDeleteRequest(BaseModel):
    """Payload for deleting multiple plate records."""
    plate_ids: List[str]


@router.get("")
@router.get("/records")
def get_plate_records(
    q: Optional[str] = Query(None, description="Search query string"),
    vehicle_type: Optional[str] = Query(None, description="Filter by vehicle type"),
    job_id: Optional[str] = Query(None, description="Filter by video job ID"),
):
    """Retrieve list of recognized license plate records with optional filters."""
    records = list_plates(q=q, vehicle_type=vehicle_type, job_id=job_id)
    if not records:
        records = video_manager.latest_records()
    return records


@router.delete("/records/{plate_id}")
def delete_plate_record(plate_id: str):
    """Delete a single license plate record by its ID."""
    deleted = delete_plate(plate_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi biển số xe cần xóa")
    return {"status": "success", "plate_id": plate_id, "deleted": True}


@router.post("/records/delete")
def delete_plates_records_bulk(payload: PlateDeleteRequest):
    """Delete multiple license plate records."""
    if not payload.plate_ids:
        return {"deleted_count": 0, "requested_count": 0}
    deleted_count = delete_plates(payload.plate_ids)
    return {"deleted_count": deleted_count, "requested_count": len(payload.plate_ids)}


@router.delete("/records")
def delete_plates_records_by_query(
    plate_ids: Optional[str] = Query(None, description="Comma-separated plate IDs")
):
    """Delete multiple plate records via query param comma-separated IDs."""
    if not plate_ids:
        return {"deleted_count": 0, "requested_count": 0}
    ids = [i.strip() for i in plate_ids.split(",") if i.strip()]
    deleted_count = delete_plates(ids)
    return {"deleted_count": deleted_count, "requested_count": len(ids)}


@router.get("/trace")
def trace_vehicle_plate(
    plate: str = Query(..., description="License plate query (supports wildcards)"),
):
    """Search and trace vehicle journey by plate number with timeline summary."""
    if not plate or not plate.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp biển số xe cần truy vết")

    return get_plate_trace(query_plate=plate)


@router.post("/simulate")
def simulate_realtime_plate_detection():
    """Simulate a real-time plate recognition event.

    Inserts record into database and broadcasts 'plate_detected' over WebSocket
    to verify real-time frontend animation instantly.
    """
    import random
    import datetime
    from src.database.repository import insert_plate

    samples = [
        ("51F88234", "51F-882.34", "TP. Hồ Chí Minh", "car"),
        ("29A56789", "29A-567.89", "Hà Nội", "car"),
        ("59P234567", "59-P2 345.67", "TP. Hồ Chí Minh", "motorcycle"),
        ("43C12345", "43C-123.45", "Đà Nẵng", "truck"),
        ("60B09876", "60B-098.76", "Đồng Nai", "bus"),
        ("30E99999", "30E-999.99", "Hà Nội", "car"),
        ("61A88888", "61A-888.88", "Bình Dương", "car"),
        ("92A23456", "92A-234.56", "Quảng Nam", "car"),
        ("79A11223", "79A-112.23", "Khánh Hòa", "car"),
    ]
    p_num, p_disp, prov, v_type = random.choice(samples)
    rand_id = random.randint(100, 999)
    now = datetime.datetime.now(datetime.timezone.utc)

    plate_record = {
        "id": f"plate-sim-{int(now.timestamp() * 1000)}-{rand_id}",
        "job_id": "job-live-stream",
        "job_filename": "live_camera_entrance.mp4",
        "track_id": random.randint(10, 99),
        "plate_number": p_num,
        "plate_display": p_disp,
        "province": prov,
        "plate_type": "white",
        "vehicle_type": v_type,
        "confidence_score": round(random.uniform(0.93, 0.99), 2),
        "quality_score": round(random.uniform(0.89, 0.98), 2),
        "crop_image_url": "/static/captures/sample/sample_plate.jpg",
        "pts_ms": random.randint(1000, 12000),
        "video_time_str": now.strftime("%H:%M:%S"),
        "timestamp": now.isoformat(),
        "speed_kmh": round(random.uniform(32.0, 58.0), 1),
        "video_url": "",
    }

    insert_plate(plate_record)
    return {"status": "success", "plate": plate_record}
