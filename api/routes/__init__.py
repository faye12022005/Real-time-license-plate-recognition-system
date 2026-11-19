"""API route modules."""

from api.routes.analytics import router as analytics_router
from api.routes.parking import router as parking_router
from api.routes.plates import router as plates_router
from api.routes.videos import router as videos_router

__all__ = ["analytics_router", "parking_router", "plates_router", "videos_router"]
