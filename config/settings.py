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

for d in [DATA_DIR, MODELS_DIR, CAPTURES_DIR, SAMPLES_DIR, DATASETS_DIR]:
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
DB_PATH = BASE_DIR / "data" / "alpr.db"

# Video upload settings
MAX_UPLOAD_MB = 1024
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv"}

# API settings
API_HOST = "0.0.0.0"
API_PORT = 8000
