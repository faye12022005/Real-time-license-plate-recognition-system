"""HTTP API entry point for SMART ALPR 2.0 system."""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config.settings import CAPTURES_DIR, SAMPLES_DIR
from src.database.connection import init_db
from api.routes.analytics import router as analytics_router
from api.routes.plates import router as plates_router
from api.routes.videos import router as videos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifespan handler."""
    # Initialize SQLite tables on startup
    init_db()
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="SMART ALPR 2.0 API",
        description="Real-time License Plate Recognition and Vehicle Tracing System Backend",
        version="2.0.0",
        lifespan=lifespan,
    )

    # Configure CORS for Next.js frontend (localhost:3000) and other clients
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount static assets for serving crop images and video files
    app.mount("/static/captures", StaticFiles(directory=str(CAPTURES_DIR)), name="captures")
    app.mount("/static/videos", StaticFiles(directory=str(SAMPLES_DIR)), name="videos")

    # Register routers with /api/v1 prefix (standard contract)
    app.include_router(analytics_router, prefix="/api/v1")
    app.include_router(videos_router, prefix="/api/v1")
    app.include_router(plates_router, prefix="/api/v1")

    # Also register at root for convenience
    app.include_router(analytics_router)
    app.include_router(videos_router)
    app.include_router(plates_router)

    @app.get("/", tags=["Health"])
    def health_check():
        return {
            "status": "online",
            "app": "SMART ALPR 2.0 Backend",
            "api_version": "v1",
            "docs_url": "/docs",
        }

    return app
