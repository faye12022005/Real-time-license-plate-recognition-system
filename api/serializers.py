"""Shared serializers for API payloads."""

from __future__ import annotations

from pathlib import Path

from config import settings
from src.models import PlateRecord


def record_payload(record: PlateRecord) -> dict:
    """Serialize a plate record and make crop images web-accessible."""
    payload = record.to_dict()
    crop = payload.get("crop_image_url")
    if crop:
        try:
            relative = Path(crop).resolve().relative_to(settings.OUTPUT_DIR.resolve())
            payload["crop_image_url"] = f"/media/{relative.as_posix()}"
        except (OSError, ValueError):
            pass
    return payload
