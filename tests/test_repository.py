"""Tests for SQLite persistence."""

from __future__ import annotations

from src.database.repository import PlateRepository
from src.models import PlateRecord, VideoJob


def make_job(job_id: str = "job-1") -> VideoJob:
    return VideoJob(
        id=job_id,
        filename="video.mp4",
        file_size_bytes=1024,
        stage="COMPLETED",
        created_at="2026-01-01T00:00:00+00:00",
        completed_at="2026-01-01T00:01:00+00:00",
        detected_plates_count=1,
    )


def make_record(record_id: str = "rec-1", plate: str = "51F88234") -> PlateRecord:
    return PlateRecord(
        id=record_id,
        job_id="job-1",
        job_filename="video.mp4",
        track_id=1,
        plate_number=plate,
        plate_display="51F-882.34",
        province="TP. Hồ Chí Minh",
        plate_type="white",
        vehicle_type="car",
        confidence_score=0.9,
        quality_score=0.8,
        crop_image_url="crops/plate.jpg",
        pts_ms=1000,
        video_time_str="00:01",
        timestamp="2026-01-01T00:00:01+00:00",
        votes=3,
        source="hybrid",
    )


def test_repository_persists_and_queries(tmp_path) -> None:
    db_path = tmp_path / "alpr.db"
    repository = PlateRepository(db_path)
    repository.save_job(make_job())
    repository.save_record(make_record())

    records = repository.list_records(query="51F")
    assert len(records) == 1
    assert records[0]["plate_number"] == "51F88234"

    trace = repository.trace("51F*")
    assert len(trace) == 1
    assert trace[0]["total_detections"] == 1
    assert trace[0]["distinct_videos"] == 1

    kpis = repository.kpis()
    assert kpis["total_videos"] == 1
    assert kpis["total_plates_detected"] == 1
    assert kpis["unique_plates_count"] == 1
    assert kpis["avg_accuracy_pct"] == 90.0
