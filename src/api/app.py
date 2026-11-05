"""Bridge module re-exporting API from root api package."""
from api.app import app, create_app

__all__ = ["app", "create_app"]
