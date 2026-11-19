"""Tests for the MySQL database layer."""

from datetime import datetime, timezone

from src.database.connection import connection, init_db
from src.database.repository import PlateRepository
from src.models import PlateRecord, VideoJob


def test_init_db_creates_schema_and_repository_persists_records(mysql_database):
    timestamp = datetime.now(timezone.utc).isoformat()

    init_db(mysql_database)
    with connection(mysql_database) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT TABLE_NAME AS name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                """
            )
            tables = {row["name"] for row in cursor.fetchall()}
    assert {"jobs", "plate_records"}.issubset(tables)

    repository = PlateRepository(mysql_database)
    repository.save_job(
        VideoJob(
            id="job-test",
            filename="sample.mp4",
            file_size_bytes=100,
            created_at=timestamp,
        )
    )
    repository.save_record(
        PlateRecord(
            id="record-test",
            job_id="job-test",
            job_filename="sample.mp4",
            track_id=1,
            plate_number="30A12345",
            plate_display="30A-123.45",
            province="Ha Noi",
            plate_type="civilian",
            vehicle_type="car",
            confidence_score=0.95,
            quality_score=0.90,
            crop_image_url="captures/plate.jpg",
            pts_ms=1000,
            video_time_str="00:01",
            timestamp=timestamp,
        )
    )

    assert repository.kpis() == {
        "total_videos": 1,
        "total_plates_detected": 1,
        "unique_plates_count": 1,
        "avg_accuracy_pct": 95.0,
    }
    assert repository.list_records()[0]["plate_number"] == "30A12345"
