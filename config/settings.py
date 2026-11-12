"""Application settings for the ALPR system."""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = DATA_DIR / "models"
CAPTURES_DIR = DATA_DIR / "captures"
SAMPLE_VIDEOS_DIR = DATA_DIR / "sample_videos"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = PROJECT_ROOT / "output"

MYSQL_HOST = os.getenv("ALPR_MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("ALPR_MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("ALPR_MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("ALPR_MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("ALPR_MYSQL_DATABASE", "alpr")
MYSQL_CHARSET = "utf8mb4"

LEGACY_SQLITE_PATH = DATA_DIR / "alpr.db"

VEHICLE_MODEL_PATH = MODELS_DIR / "vehicle_detector.pt"
PLATE_MODEL_PATH = MODELS_DIR / "plate_detector.pt"
CHAR_MODEL_PATH = MODELS_DIR / "plate_char_detector.pt"

VEHICLE_CLASSES = (
    "bicycle",
    "bus",
    "car",
    "motorbike",
    "rickshaw",
    "truck",
    "van",
)

VEHICLE_TYPE_MAP = {
    "bicycle": "motorcycle",
    "bus": "bus",
    "car": "car",
    "motorbike": "motorcycle",
    "rickshaw": "motorcycle",
    "truck": "truck",
    "van": "car",
}

PLATE_CONFIDENCE = 0.25
VEHICLE_CONFIDENCE = 0.30
CHAR_CONFIDENCE = 0.20
IOU_THRESHOLD = 0.50
IMAGE_SIZE = 640

OCR_MIN_CONFIDENCE = 0.25
OCR_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

FRAME_STRIDE = 1
TRACK_IOU_THRESHOLD = 0.30
TRACK_MAX_AGE = 30
MIN_PLATE_VOTES = 2
HIGH_CONFIDENCE_ACCEPT = 0.75

STREAM_QUEUE_SIZE = 32
STREAM_RECONNECT_ATTEMPTS = 10
STREAM_RECONNECT_DELAY = 1.0

SAVE_CROPS = True
SAVE_ANNOTATED_VIDEO = True
JPEG_QUALITY = 92


def ensure_directories() -> None:
    """Create runtime directories if they do not exist."""
    for directory in (
        DATA_DIR,
        MODELS_DIR,
        CAPTURES_DIR,
        SAMPLE_VIDEOS_DIR,
        UPLOAD_DIR,
        OUTPUT_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)
