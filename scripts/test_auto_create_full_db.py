from pathlib import Path
import sys
import pymysql

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def test_drop_and_recreate_db():
    # 1. Drop entire ALPR_DB database
    conn = pymysql.connect(host="localhost", port=3306, user="root", password="123456789")
    cur = conn.cursor()
    cur.execute("DROP DATABASE IF EXISTS ALPR_DB;")
    conn.commit()
    cur.close()
    conn.close()
    print("--> Đã DROP toàn bộ DATABASE ALPR_DB để giả lập cài đặt mới hoàn toàn!")

    # 2. Call init_db() as backend does on startup
    from src.database.connection import init_db
    status = init_db()

    # 3. Verify database and all tables are created
    print("--> Kết quả sau khi backend init_db():")
    print(f"    • Connected: {status.get('connected')}")
    print(f"    • Database: {status.get('database')}")
    print(f"    • Tables: {status.get('tables')}")
    print(f"    • Message: {status.get('message')}")
    
    assert status.get("connected") is True
    assert len(status.get("tables", {})) == 6
    for t in ["cameras", "resident_vehicles", "parking_sessions", "parking_captures", "video_jobs", "plates"]:
        assert t in status["tables"]

    print("===> TEST TỰ ĐỘNG TẠO TOÀN BỘ DATABASE & BẢNG THÀNH CÔNG 100%!")

if __name__ == "__main__":
    test_drop_and_recreate_db()
