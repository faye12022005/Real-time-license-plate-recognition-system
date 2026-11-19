"""Frontend REST/WS contract tests, using a disposable MySQL database and media."""

import queue
import threading
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api import video_manager as manager_module
from api.routes import videos, plates, analytics, parking
from config import settings
from src.database import connection as db
from src.database import repository as repo
from src.models import VideoJob, PlateRecord, ProcessingResult, Detection, OCRResult
from src.utils import settings_store
from src.pipeline import camera_connector


@pytest.fixture
def context(monkeypatch, tmp_path):
    database = f"alpr_contract_{uuid.uuid4().hex[:12]}"
    db.init_db(database)
    monkeypatch.setattr(db, "MYSQL_DATABASE", database)
    monkeypatch.setattr(repo.default_repo, "database", database)
    for name in ("UPLOAD_DIR", "OUTPUT_DIR", "CAPTURES_DIR", "PARKING_DIR", "SAMPLES_DIR"):
        folder = tmp_path / name
        folder.mkdir()
        monkeypatch.setattr(settings, name, folder)
        if hasattr(settings_store, name):
            monkeypatch.setattr(settings_store, name, folder)
    monkeypatch.setattr(settings_store, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.setattr(settings_store, "BACKUP_DIR", tmp_path / "backups")
    monkeypatch.setattr(camera_connector, "PARKING_DIR", settings.PARKING_DIR)

    # Drive the worker synchronously: integration tests never run YOLO or race deletion.
    manager = manager_module.VideoJobManager.__new__(manager_module.VideoJobManager)
    manager._lock = threading.Lock()
    manager._queue = queue.Queue()
    manager._jobs, manager._paths, manager._options, manager._records = {}, {}, {}, {}
    for module in (manager_module, videos, plates, analytics):
        monkeypatch.setattr(module, "video_manager", manager)
    try:
        with TestClient(create_app()) as client:
            yield client, manager
    finally:
        conn = db._connect(None)
        try:
            with conn.cursor() as cursor:
                cursor.execute(f"DROP DATABASE `{database}`")
        finally:
            conn.close()


def test_read_endpoints_and_cors(context):
    client, _ = context
    for endpoint in (
        "health", "analytics/kpis", "videos/jobs", "plates/records",
        "parking/cameras", "parking/residents", "parking/sessions",
        "parking/stats", "settings", "settings/storage", "settings/database/status",
    ):
        response = client.get(f"/api/v1/{endpoint}")
        assert response.status_code == 200, (endpoint, response.text)
    stats = client.get("/api/v1/parking/stats").json()
    assert {
        "currently_parked", "resident_parked", "guest_parked", "revenue_today_vnd",
        "total_registered_residents", "total_cameras", "active_cameras", "recent_sessions",
    } <= stats.keys()
    response = client.options("/api/v1/settings", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] in ("*", "http://localhost:3000")


def test_camera_resident_crud_filters(context):
    client, _ = context
    camera = client.post("/api/v1/parking/cameras", json={"name": "Test gate", "rtsp_url": "0"}).json()
    assert camera["id"] and camera["created_at"]
    assert len(client.get("/api/v1/parking/cameras?camera_type=ENTRY&is_active=1").json()) == 1
    assert client.get("/api/v1/parking/cameras?is_active=0").json() == []
    resident = client.post("/api/v1/parking/residents", json={
        "plate_number": "51F-123.45", "owner_name": "Contract Test", "apartment_number": "TEST-101",
    }).json()
    assert resident["id"] and resident["plate_number"] == "51F12345"
    assert len(client.get("/api/v1/parking/residents?q=Contract&apartment=TEST&status=ACTIVE").json()) == 1
    assert client.get("/api/v1/parking/residents?status=LOCKED").json() == []
    assert client.delete(f"/api/v1/parking/cameras/{camera['id']}").status_code == 200
    assert client.delete(f"/api/v1/parking/residents/{resident['id']}").status_code == 200


def test_checkin_checkout_contract_and_websocket(context, monkeypatch):
    client, _ = context
    monkeypatch.setattr(parking.connector, "capture_frame_from_camera", lambda _: np.zeros((100, 200, 3), dtype=np.uint8))
    monkeypatch.setattr(parking.connector, "detector", SimpleNamespace(
        predict=lambda _: [Detection(10, 10, 80, 40, .99, 0, "plate")],
    ))
    monkeypatch.setattr(parking.connector, "ocr", SimpleNamespace(
        read=lambda _: OCRResult("51F12345", .98, "test"),
    ))
    with client.websocket_connect("/api/v1/ws") as ws:
        assert ws.receive_json()["event"] == "handshake"
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
        response = client.post("/api/v1/parking/check-in", json={
            "plate_number": "51F12345", "vehicle_type": "motorcycle",
        })
        assert response.status_code == 200, response.text
        session = response.json()["data"]
        assert session["vehicle_type"] == "motorcycle"
        events = [ws.receive_json()["event"] for _ in range(3)]
        assert "parking_check_in" in events
        assert len(client.get("/api/v1/parking/sessions?ticket_type=GUEST").json()) == 1
        assert client.get("/api/v1/parking/sessions?ticket_type=RESIDENT").json() == []
        response = client.post("/api/v1/parking/check-out", json={
            "plate_number": "51F12345", "session_id": session["id"], "vehicle_type": "motorcycle",
        })
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == "COMPLETED"
        events = [ws.receive_json()["event"] for _ in range(3)]
        assert "parking_check_out" in events


def test_upload_history_media_trace_delete_and_events(context, monkeypatch):
    client, manager = context
    from src.pipeline import alpr_pipeline

    class Pipeline:
        def __init__(self, **kwargs):
            pass

        def process_video(self, video_path, output_dir, job_id, progress_callback, display_name, **kwargs):
            output_dir.mkdir(parents=True)
            crop = output_dir / "plate.jpg"
            crop.write_bytes(b"test-image")
            now = datetime.now(timezone.utc).isoformat()
            job = VideoJob(job_id, display_name, video_path.stat().st_size, stage="PROCESSING", created_at=now)
            progress_callback(job)
            record = PlateRecord(
                "rec-" + job_id, job_id, display_name, 1, "51F12345", "51F-123.45",
                "TP.HCM", "white", "car", .98, .9, str(crop), 1000, "00:01", now,
                video_url=str(video_path),
            )
            job.stage = "COMPLETED"
            job.detected_plates_count = 1
            job.overall_progress_pct = 100
            return ProcessingResult(job=job, records=[record])

    monkeypatch.setattr(alpr_pipeline, "ALPRPipeline", Pipeline)
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["event"] == "handshake"
        response = client.post("/api/v1/videos/upload", files={"file": ("contract.mp4", b"test-video", "video/mp4")})
        assert response.status_code == 200, response.text
        job_id = response.json()["job_id"]
        assert ws.receive_json()["event"] == "video_job_created"
        assert ws.receive_json()["event"] == "kpis_updated"
        assert client.delete(f"/api/v1/videos/jobs/{job_id}").status_code == 409
        manager._process(job_id)
        events = [ws.receive_json()["event"] for _ in range(4)]
        assert events == ["video_job_updated", "plate_detected", "video_job_updated", "kpis_updated"]

    job = client.get(f"/api/v1/videos/jobs/{job_id}").json()
    assert job["stage"] == "COMPLETED"
    assert client.get(job["video_url"]).content == b"test-video"
    ranged = client.get(job["video_url"], headers={"Range": "bytes=0-3"})
    assert ranged.status_code == 206
    assert ranged.content == b"test"
    records = client.get(f"/api/v1/plates/records?job_id={job_id}").json()
    assert len(records) == 1
    assert client.get(records[0]["crop_image_url"]).status_code == 200
    assert client.get("/api/v1/plates/records?q=99ZZ99999").json() == []
    trace = client.get("/api/v1/plates/trace?plate=51F12345").json()
    assert trace[0]["records"][0]["video_url"].startswith("/static/uploads/")
    # Simulate restart: history and media must still work using persisted rows.
    manager.remove_jobs([job_id])
    assert any(j["id"] == job_id for j in client.get("/api/v1/videos/jobs").json())
    assert client.get(f"/api/v1/videos/{job_id}/file").content == b"test-video"
    response = client.post("/api/v1/videos/jobs/delete", json={"job_ids": [job_id, job_id]})
    assert response.json()["deleted_count"] == 1
    assert client.get(f"/api/v1/videos/jobs/{job_id}").status_code == 404
    assert client.get(job["video_url"]).status_code == 404
    assert client.get("/api/v1/plates/trace?plate=51F12345").json() == []


def test_settings_save_and_backup(context):
    client, _ = context
    data = client.get("/api/v1/settings").json()
    data["building"]["name"] = "Contract building"
    assert client.put("/api/v1/settings", json=data).status_code == 200
    assert client.get("/api/v1/settings").json()["building"]["name"] == "Contract building"
    response = client.get("/api/v1/settings/database/backup")
    assert response.status_code == 200, response.text
    assert "CREATE TABLE" in response.text
    assert "attachment" in response.headers["content-disposition"]
