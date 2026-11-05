"""Integration test for apartment parking database and camera connection flow."""

import os
import sys
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from src.database.connection import get_connection, init_db
from src.database.repository import (
    check_in_vehicle,
    check_out_vehicle,
    get_camera,
    get_parking_dashboard_stats,
    get_parking_session,
    list_cameras,
    list_parking_sessions,
    list_residents,
    upsert_camera,
    upsert_resident_vehicle,
)
from src.pipeline.camera_connector import CameraConnector


def main():
    print("--- 1. Testing Database Initialization ---")
    init_db()
    conn = get_connection()
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    print("Tables created in SQLite:", tables)
    assert "parking_sessions" in tables
    assert "cameras" in tables
    assert "resident_vehicles" in tables
    assert "parking_captures" in tables
    assert "video_jobs" in tables
    assert "plates" in tables

    print("\n--- 2. Registering Test Camera & Resident ---")
    upsert_camera({
        "id": "CAM-IN-01",
        "name": "Cổng Vào Làn 1 - Sảnh Chính",
        "camera_type": "ENTRY",
        "rtsp_url": "test_stream",
    })
    upsert_camera({
        "id": "CAM-OUT-01",
        "name": "Cổng Ra Làn 1 - Sảnh Chính",
        "camera_type": "EXIT",
        "rtsp_url": "test_stream",
    })
    upsert_resident_vehicle({
        "id": "RES-TEST-01",
        "plate_number": "51F88234",
        "plate_display": "51F-882.34",
        "owner_name": "Trần Minh Đức",
        "apartment_number": "A12.05 - Tòa Sapphire",
        "status": "ACTIVE",
    })

    print("\n--- 3. Testing Vehicle Check-In (Xe vào bãi chung cư) ---")
    session_in = check_in_vehicle(
        plate_number="51F-882.34",
        entry_snapshot_url="/static/parking/2026-10-22/ENTRY_51F88234_demo_full.jpg",
        entry_plate_crop_url="/static/parking/2026-10-22/ENTRY_51F88234_demo_plate.jpg",
        entry_camera_id="CAM-IN-01",
        entry_gate_name="Cổng Vào Làn 1 - Sảnh Chính",
        vehicle_type="car",
        confidence=0.98,
        notes="Xe cư dân đi làm về",
    )
    print("Check-in result:")
    print(f"  • ID Phiên đỗ: {session_in['id']}")
    print(f"  • Biển số: {session_in['plate_display']} ({session_in['ticket_type']})")
    print(f"  • Căn hộ: {session_in['apartment_number']} - Cư dân: {session_in['resident_name']}")
    print(f"  • Giờ vào: {session_in['entry_time']}")
    print(f"  • Ảnh toàn cảnh lúc vào: {session_in['entry_snapshot_url']}")
    print(f"  • Ảnh crop biển số lúc vào: {session_in['entry_plate_crop_url']}")
    print(f"  • Trạng thái: {session_in['status']}")
    assert session_in["status"] == "PARKED"
    assert session_in["ticket_type"] == "RESIDENT"

    # Simulate a guest vehicle entering
    guest_in = check_in_vehicle(
        plate_number="30F-999.88",
        entry_snapshot_url="/static/parking/2026-10-22/ENTRY_30F99988_guest_full.jpg",
        entry_plate_crop_url="/static/parking/2026-10-22/ENTRY_30F99988_guest_plate.jpg",
        entry_camera_id="CAM-IN-01",
        entry_gate_name="Cổng Vào Làn 1",
        vehicle_type="car",
        confidence=0.96,
        notes="Khách đến thăm người thân",
    )
    print(f"\nKhách vãng lai check-in: {guest_in['plate_display']} ({guest_in['ticket_type']}) - Trạng thái: {guest_in['status']}")
    assert guest_in["ticket_type"] == "GUEST"

    print("\n--- 4. Testing Vehicle Check-Out (Xe ra khỏi bãi chung cư) ---")
    session_out = check_out_vehicle(
        plate_number="51F-882.34",
        exit_snapshot_url="/static/parking/2026-10-22/EXIT_51F88234_demo_full.jpg",
        exit_plate_crop_url="/static/parking/2026-10-22/EXIT_51F88234_demo_plate.jpg",
        exit_camera_id="CAM-OUT-01",
        exit_gate_name="Cổng Ra Làn 1 - Sảnh Chính",
        session_id=session_in["id"],
        notes="Xe ra bình thường, thẻ hợp lệ",
    )
    print("Check-out result:")
    print(f"  • ID Phiên đỗ: {session_out['id']}")
    print(f"  • Biển lúc vào: {session_out['plate_display']} | Biển lúc ra: {session_out['exit_plate_number']}")
    print(f"  • Giờ vào: {session_out['entry_time']}")
    print(f"  • Giờ ra: {session_out['exit_time']}")
    print(f"  • Thời gian đỗ (phút): {session_out['duration_minutes']}")
    print(f"  • Phí gửi xe: {session_out['parking_fee']:,} VND ({session_out['payment_status']})")
    print(f"  • Đối soát trùng khớp: {'ĐÚNG' if session_out['is_plate_matched'] == 1 else 'CẢNH BÁO LỆCH BIỂN'}")
    print(f"  • Ảnh toàn cảnh lúc ra: {session_out['exit_snapshot_url']}")
    print(f"  • Trạng thái: {session_out['status']}")
    assert session_out["status"] == "COMPLETED"
    assert session_out["is_plate_matched"] == 1

    print("\n--- 5. Testing Dashboard Stats ---")
    stats = get_parking_dashboard_stats()
    print(f"  • Số xe đang trong bãi hiện tại: {stats['currently_parked']}")
    print(f"  • Xe cư dân trong bãi: {stats['resident_parked']}")
    print(f"  • Xe khách trong bãi: {stats['guest_parked']}")
    print(f"  • Lượt vào hôm nay: {stats['entries_today']}")
    print(f"  • Lượt ra hôm nay: {stats['exits_today']}")
    print(f"  • Camera hoạt động: {stats['active_cameras']}/{stats['total_cameras']}")

    import numpy as np
    fake_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    connector = CameraConnector()
    test_entry = connector.process_camera_entry(
        camera_id="CAM-IN-01",
        frame=fake_frame,
        fallback_plate="59X3-7890",
        notes="Test Camera Connector snapshot",
    )
    print(f"Camera connector processed entry: {test_entry['plate_display']}, saved snapshot: {test_entry['entry_snapshot_url']}")
    assert test_entry["plate_number"] == "59X37890"

    # Clean up all test rows to keep backend database completely clean
    conn = get_connection()
    for t in ["parking_captures", "parking_sessions", "resident_vehicles", "cameras"]:
        conn.execute(f"DELETE FROM {t}")
    conn.commit()
    conn.close()

    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! DATABASE KEPT CLEAN! <<<")


if __name__ == "__main__":
    main()
