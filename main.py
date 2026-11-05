"""Main entry point for SMART ALPR 2.0 Backend Server."""

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure UTF-8 output on Windows terminal
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import uvicorn
from api.app import app
from src.database.connection import init_db


def main() -> None:
    """Initialize database and start FastAPI server with Uvicorn."""
    db_status = init_db()

    print("\n" + "=" * 68)
    print(" 🚀 SMART ALPR 2.0 BACKEND SERVER (PARKING & LICENSE PLATE SYSTEM)")
    print("=" * 68)
    print(f" • Cơ sở dữ liệu  : {db_status.get('server_version', db_status.get('engine', 'Unknown')).upper()}")
    print(f" • Tên Database   : {db_status.get('database', db_status.get('database_path', 'ALPR_DB'))}")
    print(f" • Trạng thái DB  : {db_status.get('message', 'Kết nối thành công')}")
    print(f" • Số lượng bảng  : {len(db_status.get('tables', {}))} bảng (Tổng bản ghi: {db_status.get('total_records', 0)} - Sạch)")
    print(" • API Base URL   : http://localhost:8000/api/v1")
    print(" • Swagger Docs   : http://localhost:8000/docs")
    print(" • ReDoc          : http://localhost:8000/redoc")
    print(" • Next.js Client : http://localhost:3000")
    print("=" * 68 + "\n")

    uvicorn.run(
        "api.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
