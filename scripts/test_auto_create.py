from pathlib import Path
import sys
import pymysql

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def test_auto_create():
    # 1. Drop 1 table to test auto-creation
    conn = pymysql.connect(host="localhost", port=3306, user="root", password="123456789", database="ALPR_DB")
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS parking_captures;")
    conn.commit()
    cur.close()
    conn.close()
    print("--> Đã chủ động DROP bảng 'parking_captures' để giả lập trường hợp database bị thiếu bảng.")

    # 2. Call init_db() as backend does on startup
    from src.database.connection import init_db
    status = init_db()
    
    # 3. Verify parking_captures is back
    print("--> Kết quả sau khi init_db():")
    print(f"    • Danh sách bảng hiện tại: {list(status['tables'].keys())}")
    print(f"    • Bảng 'parking_captures' có tồn tại: {'parking_captures' in status['tables']}")
    assert "parking_captures" in status["tables"], "Bảng parking_captures không được tạo lại!"
    print("===> TEST TỰ ĐỘNG TẠO BẢNG HOÀN TOÀN THÀNH CÔNG!")

if __name__ == "__main__":
    test_auto_create()
