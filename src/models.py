"""Shared data models used across the ALPR pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Detection:
    """A single object detection in pixel coordinates."""

    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float
    class_id: int
    class_name: str

    @property
    def bbox(self) -> tuple[int, int, int, int]:
        return self.x1, self.y1, self.x2, self.y2

    @property
    def width(self) -> int:
        return max(0, self.x2 - self.x1)

    @property
    def height(self) -> int:
        return max(0, self.y2 - self.y1)

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return (self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0

    def to_dict(self) -> dict:
        return {
            "bbox": [self.x1, self.y1, self.x2, self.y2],
            "confidence": round(float(self.confidence), 5),
            "class_id": int(self.class_id),
            "class_name": self.class_name,
        }


@dataclass
class OCRResult:
    """Text read from a license plate crop."""

    text: str
    confidence: float
    source: str
    raw_text: str = ""
    letters: str = ""

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "confidence": round(float(self.confidence), 5),
            "source": self.source,
            "raw_text": self.raw_text,
            "letters": self.letters,
        }


@dataclass
class VideoJob:
    """A video processing task."""

    id: str
    filename: str
    file_size_bytes: int
    stage: str = "QUEUED"
    stage_progress_pct: float = 0.0
    overall_progress_pct: float = 0.0
    total_frames: int = 0
    processed_frames: int = 0
    duration_seconds: float = 0.0
    current_fps: float = 0.0
    eta_seconds: float = 0.0
    detected_plates_count: int = 0
    video_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str = ""
    completed_at: Optional[str] = None


@dataclass
class PlateRecord:
    """A validated license plate observation."""

    id: str
    job_id: str
    job_filename: str
    track_id: int
    plate_number: str
    plate_display: str
    province: str
    plate_type: str
    vehicle_type: str
    confidence_score: float
    quality_score: float
    crop_image_url: str
    pts_ms: int
    video_time_str: str
    timestamp: str
    speed_kmh: Optional[float] = None
    video_url: Optional[str] = None
    votes: int = 0
    source: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "job_filename": self.job_filename,
            "track_id": self.track_id,
            "plate_number": self.plate_number,
            "plate_display": self.plate_display,
            "province": self.province,
            "plate_type": self.plate_type,
            "vehicle_type": self.vehicle_type,
            "confidence_score": round(float(self.confidence_score), 5),
            "quality_score": round(float(self.quality_score), 5),
            "crop_image_url": self.crop_image_url,
            "pts_ms": int(self.pts_ms),
            "video_time_str": self.video_time_str,
            "timestamp": self.timestamp,
            "speed_kmh": self.speed_kmh,
            "video_url": self.video_url,
            "votes": int(self.votes),
            "source": self.source,
        }


@dataclass
class ProcessingResult:
    """Result of processing one video file."""

    job: VideoJob
    records: list[PlateRecord] = field(default_factory=list)
    output_dir: Optional[Path] = None
    output_video: Optional[Path] = None
    results_json: Optional[Path] = None
    results_csv: Optional[Path] = None
