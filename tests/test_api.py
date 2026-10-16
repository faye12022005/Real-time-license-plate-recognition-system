"""Comprehensive integration tests for SMART ALPR 2.0 FastAPI backend."""

import io
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient
from api.app import create_app
from src.database.connection import init_db
from src.database.repository import insert_plate, insert_video_job

app = create_app()
client = TestClient(app)


def setup_module():
    """Ensure clean database for testing."""
    init_db()


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"


def test_analytics_kpis():
    response = client.get("/api/v1/analytics/kpis")
    assert response.status_code == 200
    data = response.json()
    assert "total_videos" in data
    assert "total_plates_detected" in data
    assert "unique_plates_count" in data
    assert "avg_accuracy_pct" in data


def test_video_upload_and_job_lifecycle():
    # 1. Upload mock mp4 file
    fake_video_content = b"fake-mp4-video-header-and-bytes-for-testing"
    files = {"file": ("test_traffic_hang_xanh.mp4", io.BytesIO(fake_video_content), "video/mp4")}

    upload_res = client.post("/api/v1/videos/upload", files=files)
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert "job_id" in upload_data
    job_id = upload_data["job_id"]

    # 2. Get list of jobs
    jobs_res = client.get("/api/v1/videos/jobs")
    assert jobs_res.status_code == 200
    jobs_list = jobs_res.json()
    assert any(j["id"] == job_id for j in jobs_list)

    # 3. Get single job detail
    single_res = client.get(f"/api/v1/videos/jobs/{job_id}")
    assert single_res.status_code == 200
    job = single_res.json()
    assert job["id"] == job_id
    assert job["filename"] == "test_traffic_hang_xanh.mp4"


def test_plates_records_and_trace():
    # Insert test plate records
    test_plate_1 = {
        "id": "plate-test-001",
        "job_id": "job-test-101",
        "job_filename": "street_cam1.mp4",
        "track_id": 1,
        "plate_number": "51F88234",
        "plate_display": "51F-882.34",
        "province": "TP. Hồ Chí Minh",
        "plate_type": "white",
        "vehicle_type": "car",
        "confidence_score": 0.95,
        "quality_score": 0.88,
        "crop_image_url": "/static/captures/test/crop1.jpg",
        "pts_ms": 1250,
        "video_time_str": "00:01",
        "timestamp": "2026-10-15T08:30:00Z",
        "speed_kmh": 45.0,
        "video_url": "/static/videos/street_cam1.mp4",
    }
    test_plate_2 = {
        "id": "plate-test-002",
        "job_id": "job-test-102",
        "job_filename": "street_cam2.mp4",
        "track_id": 2,
        "plate_number": "51F88234",
        "plate_display": "51F-882.34",
        "province": "TP. Hồ Chí Minh",
        "plate_type": "white",
        "vehicle_type": "car",
        "confidence_score": 0.98,
        "quality_score": 0.92,
        "crop_image_url": "/static/captures/test/crop2.jpg",
        "pts_ms": 3400,
        "video_time_str": "00:03",
        "timestamp": "2026-10-15T09:15:00Z",
        "speed_kmh": 48.2,
        "video_url": "/static/videos/street_cam2.mp4",
    }

    insert_plate(test_plate_1)
    insert_plate(test_plate_2)

    # 1. Test GET /plates/records
    records_res = client.get("/api/v1/plates/records?q=51F")
    assert records_res.status_code == 200
    records = records_res.json()
    assert len(records) >= 2

    # 2. Test GET /plates/trace
    trace_res = client.get("/api/v1/plates/trace?plate=51F88234")
    assert trace_res.status_code == 200
    trace_data = trace_res.json()
    assert len(trace_data) >= 1
    summary = trace_data[0]
    assert summary["plate_number"] == "51F88234"
    assert summary["total_detections"] >= 2
    assert summary["distinct_videos"] >= 2
    assert len(summary["records"]) >= 2


if __name__ == "__main__":
    setup_module()
    test_health_check()
    test_analytics_kpis()
    test_video_upload_and_job_lifecycle()
    test_plates_records_and_trace()
    print("[SUCCESS] All API endpoint tests passed flawlessly!")
