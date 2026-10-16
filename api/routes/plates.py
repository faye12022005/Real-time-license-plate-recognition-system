"""License plate records and trace endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from src.database.repository import get_plate_trace, list_plates

router = APIRouter(prefix="/plates", tags=["Plates"])


@router.get("/records")
def get_plate_records(
    q: Optional[str] = Query(None, description="Search query string"),
    vehicle_type: Optional[str] = Query(None, description="Filter by vehicle type"),
    job_id: Optional[str] = Query(None, description="Filter by video job ID"),
):
    """Retrieve list of recognized license plate records with optional filters."""
    return list_plates(q=q, vehicle_type=vehicle_type, job_id=job_id)


@router.get("/trace")
def trace_vehicle_plate(
    plate: str = Query(..., description="License plate query (supports wildcards)"),
):
    """Search and trace vehicle journey by plate number with timeline summary."""
    if not plate or not plate.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp biển số xe cần truy vết")

    return get_plate_trace(query_plate=plate)
