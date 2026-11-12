"""FastAPI entry point for the live ALPR dashboard."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes.camera import manager
from api.routes.camera import router as camera_router
from api.routes.videos import router as videos_router
from api.video_manager import video_manager
from config import settings


def create_app() -> FastAPI:
    """Create and configure the API application."""
    settings.ensure_directories()

    app = FastAPI(
        title="ALPR Live Camera API",
        version="1.0.0",
        description="REST + MJPEG endpoints for testing the ALPR pipeline in a browser.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount(
        "/media",
        StaticFiles(directory=str(settings.OUTPUT_DIR)),
        name="media",
    )
    app.include_router(camera_router)
    app.include_router(videos_router)

    @app.get("/api/health", tags=["Health"])
    @app.get("/api/v1/health", tags=["Health"])
    def health() -> dict:
        session = manager.current
        return {
            "status": "ok",
            "camera_status": session.status if session else "idle",
        }

    @app.get("/api/v1/analytics/kpis", tags=["Dashboard"])
    def kpis() -> dict:
        session = manager.current
        camera_records = session.records() if session else []
        video_records = video_manager.latest_records()
        records = camera_records + video_records
        unique_plates = {record["plate_number"] for record in records}
        confidence_values = [
            float(record.get("confidence_score") or 0.0) for record in records
        ]
        avg_confidence = (
            sum(confidence_values) / len(confidence_values)
            if confidence_values
            else 0.0
        )
        video_stats = video_manager.analytics()
        return {
            "total_videos": video_stats["total_jobs"],
            "total_plates_detected": len(records),
            "unique_plates_count": len(unique_plates),
            "avg_accuracy_pct": round(avg_confidence * 100, 2),
        }

    @app.get("/api/v1/plates/records", tags=["Dashboard"])
    def plates(job_id: str | None = None) -> list[dict]:
        if job_id:
            return video_manager.get_records(job_id) or []
        session = manager.current
        camera_records = session.records() if session else []
        return video_manager.latest_records() + camera_records

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.app:app", host="127.0.0.1", port=8000, reload=False)
