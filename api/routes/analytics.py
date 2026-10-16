"""Analytics and KPI endpoints."""

from fastapi import APIRouter
from src.database.repository import get_kpis

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/kpis")
def read_kpis():
    """Retrieve dashboard KPIs (total videos, plates detected, unique plates, avg accuracy)."""
    return get_kpis()
