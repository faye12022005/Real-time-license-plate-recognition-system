"""System settings, storage retention, and database backup endpoints."""

from typing import Any, Dict

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse

from src.database.connection import check_db_status
from src.utils.settings_store import (
    cleanup_storage,
    create_database_backup,
    get_storage_usage,
    load_settings,
    save_settings,
)

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("")
def get_settings():
    """Return persisted system settings with defaults merged in."""
    return load_settings()


@router.put("")
def update_settings(payload: Dict[str, Any] = Body(...)):
    """Persist system settings (parking tariff, AI thresholds, security, retention...)."""
    try:
        return save_settings(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không thể lưu cấu hình: {exc}")


@router.get("/storage")
def get_storage():
    """Return disk usage for captures, parking captures, and uploaded videos."""
    try:
        return get_storage_usage()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Không thể đọc dung lượng ổ đĩa: {exc}")


@router.post("/cleanup")
def run_cleanup(payload: Dict[str, Any] | None = Body(None)):
    """Delete old media files according to the configured retention windows.

    Accepts an optional settings body so the UI can clean up using unsaved values;
    otherwise the persisted settings are used.
    """
    try:
        return cleanup_storage(payload or load_settings())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Dọn dẹp thất bại: {exc}")


@router.get("/database/status")
def get_database_status():
    """Check active database connectivity and table/record counts."""
    return check_db_status()


@router.get("/database/backup")
def download_database_backup():
    """Create and download a .sql backup of the active MySQL database."""
    try:
        result = create_database_backup()
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Sao lưu database thất bại: {exc}")

    return FileResponse(
        path=result["path"],
        filename=result["filename"],
        media_type="application/sql",
    )
