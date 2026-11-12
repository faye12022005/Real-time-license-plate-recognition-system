"""Smoke tests for the camera and video upload HTTP API."""

from pathlib import Path

from fastapi.testclient import TestClient

from api.app import app
from api.routes import videos as videos_route
from config import settings

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["camera_status"] in {"idle", "running", "stopped", "failed"}


def test_camera_status_without_session() -> None:
    response = client.get("/api/cameras/status")
    assert response.status_code == 200
    assert response.json() == {"active": False, "session": None}


def test_camera_stream_without_session() -> None:
    response = client.get("/api/cameras/stream")
    assert response.status_code == 404


def test_video_job_not_found() -> None:
    response = client.get("/api/v1/videos/jobs/job-missing")
    assert response.status_code == 404


def test_upload_rejects_non_video() -> None:
    response = client.post(
        "/api/v1/videos/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_accepts_video(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", tmp_path)
    captured: dict = {}

    def fake_submit(video_path, filename: str, options=None):
        captured["path"] = Path(video_path)
        captured["filename"] = filename
        return {
            "id": "job-test",
            "filename": filename,
            "video_url": "/api/v1/videos/job-test/file",
        }

    monkeypatch.setattr(videos_route.video_manager, "submit", fake_submit)

    response = client.post(
        "/api/v1/videos/upload",
        files={"file": ("sample.mp4", b"fake-video-bytes", "video/mp4")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["job_id"] == "job-test"
    assert payload["video_url"] == "/api/v1/videos/job-test/file"
    assert captured["filename"] == "sample.mp4"
    assert captured["path"].exists()
    assert captured["path"].read_bytes() == b"fake-video-bytes"
