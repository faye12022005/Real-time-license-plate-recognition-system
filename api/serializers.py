"""Shared serializers for API payloads."""

from __future__ import annotations

from pathlib import Path
from collections.abc import Mapping

from config import settings
from src.models import PlateRecord


def media_url(value: str | None) -> str:
    """Convert local media paths to mounted HTTP paths without exposing disk paths."""
    if not value:
        return ""
    value = str(value)
    if value.startswith(("http://", "https://", "/media/", "/static/", "/api/")):
        return value
    for root, prefix in (
        (settings.OUTPUT_DIR, "/media"),
        (settings.UPLOAD_DIR, "/static/uploads"),
        (settings.CAPTURES_DIR, "/static/captures"),
        (settings.PARKING_DIR, "/static/parking"),
        (settings.SAMPLES_DIR, "/static/videos"),
    ):
        try:
            relative = Path(value).resolve().relative_to(root.resolve())
            return f"{prefix}/{relative.as_posix()}"
        except (OSError, ValueError):
            continue
    return ""


def record_payload(record: PlateRecord | Mapping) -> dict:
    """Serialize a plate record and make crop images web-accessible."""
    payload = dict(record) if isinstance(record, Mapping) else record.to_dict()
    payload["crop_image_url"] = media_url(payload.get("crop_image_url"))
    payload["video_url"] = media_url(payload.get("video_url"))
    return payload


def job_payload(job: dict) -> dict:
    payload = dict(job)
    payload["stage"] = str(payload.get("stage") or "QUEUED").upper()
    payload["video_url"] = media_url(payload.get("video_url"))
    if "overall_progress_pct" in payload and payload["overall_progress_pct"] is not None:
        try:
            payload["overall_progress_pct"] = round(float(payload["overall_progress_pct"]))
        except (ValueError, TypeError):
            pass
    if "stage_progress_pct" in payload and payload["stage_progress_pct"] is not None:
        try:
            payload["stage_progress_pct"] = round(float(payload["stage_progress_pct"]))
        except (ValueError, TypeError):
            pass
    if "current_fps" in payload and payload["current_fps"] is not None:
        try:
            payload["current_fps"] = round(float(payload["current_fps"]))
        except (ValueError, TypeError):
            pass
    return payload
