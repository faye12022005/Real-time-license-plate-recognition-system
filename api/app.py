"""HTTP API entry point for SMART ALPR 2.0 system with interactive Swagger documentation."""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config.settings import CAPTURES_DIR, PARKING_DIR, SAMPLES_DIR
from src.database.connection import init_db
from api.routes.analytics import router as analytics_router
from api.routes.parking import router as parking_router
from api.routes.plates import router as plates_router
from api.routes.training import router as training_router
from api.routes.videos import router as videos_router

TAGS_METADATA = [
    {
        "name": "Apartment Parking",
        "description": (
            "🚗 **Quản lý bãi xe chung cư**: Ghi nhận xe vào (Check-in), xe ra (Check-out), "
            "chụp và lưu ảnh toàn cảnh xe lúc vào/ra, lưu biển số xe, giờ xe ra/vào và tự động tính cước phí."
        ),
    },
    {
        "name": "Cameras",
        "description": "📷 **Quản lý Camera cổng bãi xe**: Thêm/sửa/xóa camera RTSP IP hoặc Webcam làn vào/ra và kiểm tra tín hiệu trực tiếp.",
    },
    {
        "name": "Residents",
        "description": "🏢 **Quản lý xe cư dân chung cư**: Danh sách đăng ký vé xe tháng theo số phòng/căn hộ (A12.05, Sapphire, Ruby...).",
    },
    {
        "name": "Videos",
        "description": "📹 **Luồng tải lên video**: Upload tệp video (.mp4, .mkv, .avi) để phân tích tiến trình kép AI (chuyển mã 20% + nhận diện 80%).",
    },
    {
        "name": "Plates",
        "description": "🔍 **Tra cứu & Truy vết biển số**: Tìm kiếm lịch sử phương tiện đã nhận diện và truy vết hành trình di chuyển.",
    },
    {
        "name": "Analytics",
        "description": "📊 **Thống kê hệ thống**: Dashboard KPIs số lượng xe trong bãi, lượt vào/ra hôm nay và độ chính xác OCR.",
    },
    {
        "name": "Model Training",
        "description": "🧠 **Huấn luyện mô hình AI**: Huấn luyện YOLOv8/v11 nhận diện biển số xe, giám sát tiến trình và đo lường FPS thời gian thực.",
    },
    {
        "name": "Health",
        "description": "🩺 **Kiểm tra trạng thái**: Kiểm tra kết nối máy chủ API.",
    },
]

SWAGGER_DESCRIPTION = """
## 🚀 SMART ALPR 2.0 - BACKEND SWAGGER TEST CONSOLE

Hệ thống tích hợp **Nhận diện biển số xe tự động (ALPR)** & **Quản lý nhà xe chung cư thông minh**.

### 🛠 Hướng dẫn Test Nhanh các luồng chính:
1. **Quản lý Nhà xe Chung Cư (`/api/v1/parking`)**:
   - `POST /api/v1/parking/check-in`: Bấm **Try it out** $\\rightarrow$ **Execute** để ghi nhận xe vào bãi (lưu ảnh vào, lưu biển số và giờ vào).
   - `POST /api/v1/parking/check-out`: Ghi nhận xe ra bãi (lưu ảnh ra, tính thời gian đỗ xe, đối soát biển số và tính cước phí).
   - `GET /api/v1/parking/sessions`: Xem lịch sử tất cả các xe đang trong bãi (`PARKED`) hoặc đã ra (`COMPLETED`).
   - `GET /api/v1/parking/stats`: Xem thống kê số lượng xe trong bãi, lượt xe vào/ra hôm nay.
2. **Camera Cổng Bãi Xe (`/api/v1/parking/cameras`)**:
   - `GET /api/v1/parking/cameras`: Danh sách camera làn xe.
   - `POST /api/v1/parking/cameras/{id}/test`: Kiểm tra kết nối Camera RTSP / Webcam.
3. **Xe Cư Dân Chung Cư (`/api/v1/parking/residents`)**:
   - `GET /api/v1/parking/residents`: Xem danh sách xe cư dân đăng ký theo căn hộ.
   - `POST /api/v1/parking/residents`: Đăng ký thêm xe cho căn hộ mới.
4. **Luồng Video Upload (`/api/v1/videos`)**:
   - `POST /api/v1/videos/upload`: Tải lên video test nhận diện biển số xe.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifespan handler."""
    init_db()
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    PARKING_DIR.mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="SMART ALPR 2.0 - Bãi Xe Chung Cư & Nhận Diện Biển Số",
        description=SWAGGER_DESCRIPTION,
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        openapi_tags=TAGS_METADATA,
        swagger_ui_parameters={
            "docExpansion": "list",
            "filter": True,
            "displayRequestDuration": True,
            "tryItOutEnabled": True,
        },
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

    # Mount static assets for serving crop images, video files, and camera parking snapshots
    app.mount("/static/captures", StaticFiles(directory=str(CAPTURES_DIR)), name="captures")
    app.mount("/static/videos", StaticFiles(directory=str(SAMPLES_DIR)), name="videos")
    app.mount("/static/parking", StaticFiles(directory=str(PARKING_DIR)), name="parking")

    # Register routers with /api/v1 prefix
    app.include_router(parking_router, prefix="/api/v1")
    app.include_router(videos_router, prefix="/api/v1")
    app.include_router(plates_router, prefix="/api/v1")
    app.include_router(analytics_router, prefix="/api/v1")
    app.include_router(training_router, prefix="/api/v1")

    # Also map parking/videos/plates/analytics/training to root so clients without /api/v1 prefix still work seamlessly
    app.include_router(parking_router, include_in_schema=False)
    app.include_router(videos_router, include_in_schema=False)
    app.include_router(plates_router, include_in_schema=False)
    app.include_router(analytics_router, include_in_schema=False)
    app.include_router(training_router, include_in_schema=False)

    @app.get("/", tags=["Health"], summary="Trang chủ API & Chuyển hướng tới Swagger")
    @app.get("/health", tags=["Health"], summary="Kiểm tra trạng thái máy chủ")
    @app.get("/api/v1/health", tags=["Health"], summary="Health check endpoint")
    def health_check():
        return {
            "status": "healthy",
            "app": "SMART ALPR 2.0 Backend & Parking Management",
            "api_version": "v1",
            "docs_url": "/docs",
            "redoc_url": "/redoc",
        }

    return app


# Module-level default instance
app = create_app()
