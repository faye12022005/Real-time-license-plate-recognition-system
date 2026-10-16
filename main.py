"""Main entry point for the ALPR service."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.app import app as api_app
from src.main import start_service

# CORS middleware
cors = CORSMiddleware(
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app = FastAPI(
    title="Smart ALPR 2.0",
    description="Real-time License Plate Recognition System",
    version="2.0.0",
    lifespan=lambda: start_service(),
)

app.add_middleware(cors, cors=cors)

@app.on_event("startup")
async def startup():
    # Initialize database
    from src.database.connection import init_db
    init_db()
    logger.info("ALPR system started")

@app.on_event("shutdown")
async def shutdown():
    logger.info("ALPR system stopped")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
