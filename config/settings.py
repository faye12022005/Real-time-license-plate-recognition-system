"""Application configuration."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR

# Directories
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = DATA_DIR / "models"
CAPTURES_DIR = DATA_DIR / "captures"
SAMPLES_DIR = DATA_DIR / "sample_videos"
DATASETS_DIR = DATA_DIR / "datasets"
PARKING_DIR = DATA_DIR / "parking_captures"

for d in [DATA_DIR, MODELS_DIR, CAPTURES_DIR, SAMPLES_DIR, DATASETS_DIR, PARKING_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Detector settings
DETECTOR_MODEL_PATH = BASE_DIR / "models" / "plate_detector.pt"
DETECTOR_CONF_THRESHOLD = 0.25
DETECTOR_IOU_THRESHOLD = 0.45
DETECTOR_DEVICE = "cpu"  # or "cuda"
CLASS_NAMES = {0: "plate_1_line", 1: "plate_2_line"}
PLATE_CROP_PADDING = 10

# Pipeline settings
PIPELINE_FPS_TARGET = 30
PIPELINE_MAX_FRAMES = 0  # 0 = unlimited

# Database settings
import os
try:
    from dotenv import load_dotenv  # type: ignore
    if (BASE_DIR / ".env.local").is_file():
        load_dotenv(BASE_DIR / ".env.local", override=True)
    if (BASE_DIR / ".env").is_file():
        load_dotenv(BASE_DIR / ".env", override=False)
    load_dotenv()
except ImportError:
    pass

DB_ENGINE = os.getenv("DB_ENGINE", "sqlserver").lower()  # "sqlserver", "mysql", "postgres", or "sqlite"
DB_PATH = BASE_DIR / "data" / "alpr.db"

# SQL Server / MySQL configuration (seamless support for both)
SQLSERVER_HOST = os.getenv("SQLSERVER_HOST", os.getenv("MYSQL_HOST", "localhost"))
SQLSERVER_PORT = int(os.getenv("SQLSERVER_PORT", os.getenv("MYSQL_PORT", "3306")))
SQLSERVER_DB = os.getenv("SQLSERVER_DB", os.getenv("MYSQL_DB", "ALPR_DB"))
SQLSERVER_USER = os.getenv("SQLSERVER_USER", os.getenv("MYSQL_USER", "root"))
SQLSERVER_PASSWORD = os.getenv("SQLSERVER_PASSWORD", os.getenv("MYSQL_PASSWORD", "123456789"))
SQLSERVER_DRIVER = os.getenv("SQLSERVER_DRIVER", "SQL Server")
SQLSERVER_TRUSTED = os.getenv("SQLSERVER_TRUSTED", "no").lower() in ("yes", "true", "1")

# Explicit MySQL aliases
MYSQL_HOST = SQLSERVER_HOST
MYSQL_PORT = SQLSERVER_PORT
MYSQL_DB = SQLSERVER_DB
MYSQL_USER = SQLSERVER_USER
MYSQL_PASSWORD = SQLSERVER_PASSWORD

# Video upload settings
MAX_UPLOAD_MB = 1024
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv"}

# API settings
API_HOST = "0.0.0.0"
API_PORT = 8000
