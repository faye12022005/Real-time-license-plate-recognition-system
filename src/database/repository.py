"""CRUD operations for ALPR system: Video jobs, plates, cameras, resident vehicles, and parking sessions."""

import datetime
import math
import uuid
from typing import Any, Dict, List, Optional
from src.database.connection import get_connection
from src.utils.plate_validator import format_vietnamese_plate, normalize_plate


# ==============================================================================
# 1. VIDEO JOBS & DETECTED PLATES REPOSITORY (Existing Flow)
# ==============================================================================

def insert_plate(record: Dict[str, Any]) -> None:
    conn = get_connection()
    conn.execute(
        """
        INSERT OR REPLACE INTO plates (
            id, job_id, job_filename, track_id, plate_number, plate_display,
            province, plate_type, vehicle_type, confidence_score, quality_score,
            crop_image_url, pts_ms, video_time_str, timestamp, speed_kmh, video_url
        ) VALUES (:id, :job_id, :job_filename, :track_id, :plate_number, :plate_display,
                  :province, :plate_type, :vehicle_type, :confidence_score, :quality_score,
                  :crop_image_url, :pts_ms, :video_time_str, :timestamp, :speed_kmh, :video_url)
        """,
        record,
    )
    conn.commit()
    conn.close()


def list_plates(
    q: Optional[str] = None,
    vehicle_type: Optional[str] = None,
    job_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM plates WHERE 1=1"
    params: Dict[str, Any] = {}

    if q:
        query += " AND (UPPER(plate_number) LIKE UPPER(:q) OR UPPER(plate_display) LIKE UPPER(:q))"
        params["q"] = f"%{q}%"

    if vehicle_type and vehicle_type != "all":
        query += " AND vehicle_type = :vehicle_type"
        params["vehicle_type"] = vehicle_type

    if job_id:
        query += " AND job_id = :job_id"
        params["job_id"] = job_id

    query += " ORDER BY timestamp DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def trace_plate(plate_number: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    norm = normalize_plate(plate_number)
    rows = conn.execute(
        "SELECT * FROM plates WHERE UPPER(plate_number) LIKE UPPER(:q)",
        {"q": f"%{norm}%"},
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def insert_video_job(job: Dict[str, Any]) -> None:
    conn = get_connection()
    conn.execute(
        """
        INSERT OR REPLACE INTO video_jobs (
            id, filename, file_size_bytes, stage, stage_progress_pct, overall_progress_pct,
            total_frames, processed_frames, duration_seconds, current_fps, eta_seconds,
            detected_plates_count, video_url, error_message, created_at, completed_at
        ) VALUES (:id, :filename, :file_size_bytes, :stage, :stage_progress_pct,
                  :overall_progress_pct, :total_frames, :processed_frames, :duration_seconds,
                  :current_fps, :eta_seconds, :detected_plates_count, :video_url,
                  :error_message, :created_at, :completed_at)
        """,
        job,
    )
    conn.commit()
    conn.close()


def list_video_jobs() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM video_jobs ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_video_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM video_jobs WHERE id = :id", {"id": job_id}).fetchone()
    conn.close()
    return dict(row) if row else None


def update_video_job_progress(job_id: str, **kwargs: Any) -> None:
    if not kwargs:
        return
    conn = get_connection()
    set_clause = ", ".join(f"{k} = :{k}" for k in kwargs.keys())
    params = dict(kwargs)
    params["_job_id"] = job_id
    conn.execute(f"UPDATE video_jobs SET {set_clause} WHERE id = :_job_id", params)
    conn.commit()
    conn.close()


def get_kpis() -> Dict[str, Any]:
    conn = get_connection()
    total_videos = conn.execute("SELECT COUNT(*) FROM video_jobs").fetchone()[0] or 0
    total_plates = conn.execute("SELECT COUNT(*) FROM plates").fetchone()[0] or 0
    unique_plates = conn.execute("SELECT COUNT(DISTINCT plate_number) FROM plates").fetchone()[0] or 0
    avg_acc_row = conn.execute("SELECT AVG(confidence_score) FROM plates").fetchone()[0]
    avg_acc = round(float(avg_acc_row) * 100, 1) if avg_acc_row is not None else 98.4
    conn.close()
    return {
        "total_videos": total_videos,
        "total_plates_detected": total_plates,
        "unique_plates_count": unique_plates,
        "avg_accuracy_pct": avg_acc,
    }


def get_plate_trace(query_plate: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    norm = normalize_plate(query_plate)
    q_wildcard = f"%{norm}%" if "%" not in norm else norm

    rows = conn.execute(
        "SELECT * FROM plates WHERE UPPER(plate_number) LIKE :q OR UPPER(plate_display) LIKE :q ORDER BY timestamp ASC",
        {"q": q_wildcard},
    ).fetchall()
    conn.close()

    records = [dict(row) for row in rows]
    if not records:
        return []

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        p_num = r.get("plate_number") or "UNKNOWN"
        grouped.setdefault(p_num, []).append(r)

    summaries = []
    for p_num, group in grouped.items():
        best_record = max(group, key=lambda x: (x.get("quality_score") or 0.0, x.get("confidence_score") or 0.0))
        distinct_videos = len({r["job_id"] for r in group if r.get("job_id")})
        first_seen = group[0].get("timestamp") or ""
        last_seen = group[-1].get("timestamp") or ""

        summaries.append({
            "plate_number": p_num,
            "plate_display": best_record.get("plate_display") or p_num,
            "province": best_record.get("province") or "Không xác định",
            "vehicle_type": best_record.get("vehicle_type") or "car",
            "plate_type": best_record.get("plate_type") or "white",
            "total_detections": len(group),
            "distinct_videos": max(1, distinct_videos),
            "first_seen": first_seen,
            "last_seen": last_seen,
            "best_crop_image_url": best_record.get("crop_image_url") or "",
            "records": sorted(group, key=lambda x: x.get("timestamp") or "", reverse=True),
        })

    return summaries


# ==============================================================================
# 2. CAMERA MANAGEMENT REPOSITORY (Làn vào / ra bãi xe chung cư)
# ==============================================================================

def list_cameras(camera_type: Optional[str] = None, is_active: Optional[int] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM cameras WHERE 1=1"
    params: Dict[str, Any] = {}
    if camera_type:
        query += " AND camera_type = :camera_type"
        params["camera_type"] = camera_type
    if is_active is not None:
        query += " AND is_active = :is_active"
        params["is_active"] = is_active
    query += " ORDER BY id ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_camera(camera_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM cameras WHERE id = :id", {"id": camera_id}).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_camera(camera: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now_str = datetime.datetime.now().isoformat()
    cid = camera.get("id") or f"CAM-{uuid.uuid4().hex[:6].upper()}"
    existing = conn.execute("SELECT id FROM cameras WHERE id = :id", {"id": cid}).fetchone()

    if existing:
        conn.execute(
            """
            UPDATE cameras SET
                name = :name,
                camera_type = :camera_type,
                rtsp_url = :rtsp_url,
                location = :location,
                resolution = :resolution,
                fps_limit = :fps_limit,
                is_active = :is_active,
                updated_at = :updated_at
            WHERE id = :id
            """,
            {
                "id": cid,
                "name": camera.get("name", "Camera Giám Sát Cổng"),
                "camera_type": camera.get("camera_type", "ENTRY"),
                "rtsp_url": camera.get("rtsp_url", "0"),
                "location": camera.get("location", "Cổng bãi xe"),
                "resolution": camera.get("resolution", "1920x1080"),
                "fps_limit": camera.get("fps_limit", 25),
                "is_active": camera.get("is_active", 1),
                "updated_at": now_str,
            },
        )
    else:
        conn.execute(
            """
            INSERT INTO cameras (id, name, camera_type, rtsp_url, location, resolution, fps_limit, is_active, created_at, updated_at)
            VALUES (:id, :name, :camera_type, :rtsp_url, :location, :resolution, :fps_limit, :is_active, :created_at, :updated_at)
            """,
            {
                "id": cid,
                "name": camera.get("name", "Camera Giám Sát Cổng"),
                "camera_type": camera.get("camera_type", "ENTRY"),
                "rtsp_url": camera.get("rtsp_url", "0"),
                "location": camera.get("location", "Cổng bãi xe"),
                "resolution": camera.get("resolution", "1920x1080"),
                "fps_limit": camera.get("fps_limit", 25),
                "is_active": camera.get("is_active", 1),
                "created_at": camera.get("created_at", now_str),
                "updated_at": now_str,
            },
        )
    conn.commit()
    conn.close()
    return get_camera(cid) or {}


def update_camera(camera_id: str, **kwargs: Any) -> Optional[Dict[str, Any]]:
    if not kwargs:
        return get_camera(camera_id)
    conn = get_connection()
    kwargs["updated_at"] = datetime.datetime.now().isoformat()
    set_clause = ", ".join(f"{k} = :{k}" for k in kwargs.keys())
    params = dict(kwargs)
    params["_cid"] = camera_id
    conn.execute(f"UPDATE cameras SET {set_clause} WHERE id = :_cid", params)
    conn.commit()
    conn.close()
    return get_camera(camera_id)


def delete_camera(camera_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM cameras WHERE id = :id", {"id": camera_id})
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ==============================================================================
# 3. RESIDENT VEHICLES REPOSITORY (Cư dân chung cư đăng ký biển số)
# ==============================================================================

def list_residents(
    q: Optional[str] = None,
    status: Optional[str] = None,
    apartment: Optional[str] = None,
) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM resident_vehicles WHERE 1=1"
    params: Dict[str, Any] = {}

    if q:
        query += " AND (plate_number LIKE :q OR owner_name LIKE :q OR apartment_number LIKE :q)"
        params["q"] = f"%{q}%"

    if status:
        query += " AND status = :status"
        params["status"] = status

    if apartment:
        query += " AND apartment_number LIKE :apt"
        params["apt"] = f"%{apartment}%"

    query += " ORDER BY registered_at DESC, apartment_number ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_resident_by_plate(plate_number: str) -> Optional[Dict[str, Any]]:
    norm = normalize_plate(plate_number)
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM resident_vehicles WHERE plate_number = :p LIMIT 1",
        {"p": norm},
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_resident_vehicle(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now_str = datetime.datetime.now().isoformat()
    rid = data.get("id") or f"RES-{uuid.uuid4().hex[:6].upper()}"
    norm = normalize_plate(data.get("plate_number", ""))
    display = data.get("plate_display") or format_vietnamese_plate(norm)

    existing = conn.execute("SELECT id FROM resident_vehicles WHERE plate_number = :p", {"p": norm}).fetchone()
    if existing:
        conn.execute(
            """
            UPDATE resident_vehicles SET
                plate_display = :plate_display,
                owner_name = :owner_name,
                apartment_number = :apartment_number,
                phone_number = :phone_number,
                vehicle_type = :vehicle_type,
                rfid_card_id = :rfid_card_id,
                monthly_fee = :monthly_fee,
                expiry_date = :expiry_date,
                status = :status,
                notes = :notes,
                updated_at = :updated_at
            WHERE plate_number = :plate_number
            """,
            {
                "plate_number": norm,
                "plate_display": display,
                "owner_name": data.get("owner_name", "Cư dân chung cư"),
                "apartment_number": data.get("apartment_number", "Chưa rõ phòng"),
                "phone_number": data.get("phone_number", ""),
                "vehicle_type": data.get("vehicle_type", "car"),
                "rfid_card_id": data.get("rfid_card_id"),
                "monthly_fee": int(data.get("monthly_fee", 0)),
                "expiry_date": data.get("expiry_date", "2029-12-31"),
                "status": data.get("status", "ACTIVE"),
                "notes": data.get("notes"),
                "updated_at": now_str,
            },
        )
    else:
        conn.execute(
            """
            INSERT INTO resident_vehicles (
                id, plate_number, plate_display, owner_name, apartment_number, phone_number,
                vehicle_type, rfid_card_id, monthly_fee, registered_at, expiry_date,
                status, notes, created_at, updated_at
            ) VALUES (
                :id, :plate_number, :plate_display, :owner_name, :apartment_number, :phone_number,
                :vehicle_type, :rfid_card_id, :monthly_fee, :registered_at, :expiry_date,
                :status, :notes, :created_at, :updated_at
            )
            """,
            {
                "id": rid,
                "plate_number": norm,
                "plate_display": display,
                "owner_name": data.get("owner_name", "Cư dân chung cư"),
                "apartment_number": data.get("apartment_number", "Chưa rõ phòng"),
                "phone_number": data.get("phone_number", ""),
                "vehicle_type": data.get("vehicle_type", "car"),
                "rfid_card_id": data.get("rfid_card_id"),
                "monthly_fee": int(data.get("monthly_fee", 0)),
                "registered_at": data.get("registered_at", datetime.datetime.now().strftime("%Y-%m-%d")),
                "expiry_date": data.get("expiry_date", "2029-12-31"),
                "status": data.get("status", "ACTIVE"),
                "notes": data.get("notes"),
                "created_at": data.get("created_at", now_str),
                "updated_at": now_str,
            },
        )
    conn.commit()
    conn.close()
    return get_resident_by_plate(norm) or {}


def delete_resident_vehicle(resident_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM resident_vehicles WHERE id = :id", {"id": resident_id})
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ==============================================================================
# 4. PARKING SESSIONS REPOSITORY (Quản lý xe vào / xe ra nhà xe chung cư)
# ==============================================================================

def calculate_parking_fee(vehicle_type: str, ticket_type: str, duration_minutes: int) -> int:
    """Calculate parking fee in VND based on apartment parking rate table."""
    # Residents with registered active passes park for free (monthly billed)
    if ticket_type == "RESIDENT":
        return 0

    # Guest parking rates
    if vehicle_type == "motorcycle":
        # Xe máy: 5,000 VND per 4 hours block
        blocks = max(1, math.ceil(duration_minutes / 240))
        return blocks * 5000
    else:
        # Ô tô: 25,000 VND for first 2 hours, then 10,000 VND per hour
        if duration_minutes <= 120:
            return 25000
        extra_minutes = duration_minutes - 120
        extra_hours = math.ceil(extra_minutes / 60)
        return 25000 + (extra_hours * 10000)


def check_in_vehicle(
    plate_number: str,
    entry_snapshot_url: str,
    entry_plate_crop_url: str = "",
    entry_camera_id: Optional[str] = "CAM-IN-01",
    entry_gate_name: str = "Cổng Vào Làn 1",
    vehicle_type: str = "car",
    confidence: float = 0.95,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Check in a vehicle entering the apartment parking lot.

    Saves photo snapshot, plate crop, entry timestamp, and checks resident status.
    """
    norm = normalize_plate(plate_number)
    display = format_vietnamese_plate(norm)
    now_dt = datetime.datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    now_iso = now_dt.isoformat()

    # Verify if plate belongs to a registered apartment resident
    resident = get_resident_by_plate(norm)
    is_resident = resident is not None and resident.get("status") == "ACTIVE"

    ticket_type = "RESIDENT" if is_resident else "GUEST"
    resident_id = resident["id"] if is_resident else None
    apt_number = resident["apartment_number"] if is_resident else None
    res_name = resident["owner_name"] if is_resident else None
    veh_type = resident["vehicle_type"] if is_resident else vehicle_type

    session_id = f"PARK-{now_dt.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

    conn = get_connection()

    # 1. Insert Parking Session
    conn.execute(
        """
        INSERT INTO parking_sessions (
            id, plate_number, plate_display, vehicle_type, ticket_type, status,
            entry_time, entry_camera_id, entry_gate_name, entry_snapshot_url,
            entry_plate_crop_url, entry_confidence, resident_id, apartment_number,
            resident_name, duration_minutes, parking_fee, payment_status, notes,
            created_at, updated_at
        ) VALUES (
            :id, :plate_number, :plate_display, :vehicle_type, :ticket_type, 'PARKED',
            :entry_time, :entry_camera_id, :entry_gate_name, :entry_snapshot_url,
            :entry_plate_crop_url, :entry_confidence, :resident_id, :apartment_number,
            :resident_name, 0, 0, :payment_status, :notes,
            :created_at, :updated_at
        )
        """,
        {
            "id": session_id,
            "plate_number": norm,
            "plate_display": display,
            "vehicle_type": veh_type,
            "ticket_type": ticket_type,
            "entry_time": now_str,
            "entry_camera_id": entry_camera_id,
            "entry_gate_name": entry_gate_name,
            "entry_snapshot_url": entry_snapshot_url,
            "entry_plate_crop_url": entry_plate_crop_url,
            "entry_confidence": confidence,
            "resident_id": resident_id,
            "apartment_number": apt_number,
            "resident_name": res_name,
            "payment_status": "FREE_RESIDENT" if is_resident else "UNPAID",
            "notes": notes or ("Xe Cư Dân Chung Cư" if is_resident else "Khách vãng lai"),
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    )

    # 2. Record capture event
    capture_id = f"CAP-IN-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO parking_captures (
            id, session_id, camera_id, capture_type, plate_number,
            snapshot_url, plate_crop_url, confidence, captured_at
        ) VALUES (
            :id, :session_id, :camera_id, 'ENTRY', :plate_number,
            :snapshot_url, :plate_crop_url, :confidence, :captured_at
        )
        """,
        {
            "id": capture_id,
            "session_id": session_id,
            "camera_id": entry_camera_id or "CAM-IN-01",
            "plate_number": norm,
            "snapshot_url": entry_snapshot_url,
            "plate_crop_url": entry_plate_crop_url,
            "confidence": confidence,
            "captured_at": now_iso,
        },
    )

    conn.commit()
    conn.close()

    return get_parking_session(session_id) or {}


def check_out_vehicle(
    plate_number: str,
    exit_snapshot_url: str,
    exit_plate_crop_url: str = "",
    exit_camera_id: Optional[str] = "CAM-OUT-01",
    exit_gate_name: str = "Cổng Ra Làn 1",
    session_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Check out a vehicle leaving the apartment parking lot.

    Matches against currently parked session, records exit snapshot, calculates
    duration and parking fee, and verifies plate match.
    """
    norm = normalize_plate(plate_number)
    now_dt = datetime.datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    now_iso = now_dt.isoformat()

    conn = get_connection()

    # Find the active parking session
    session = None
    if session_id:
        row = conn.execute(
            "SELECT * FROM parking_sessions WHERE id = :id AND status = 'PARKED'",
            {"id": session_id},
        ).fetchone()
        if row:
            session = dict(row)

    if not session:
        # Search by plate number
        row = conn.execute(
            "SELECT * FROM parking_sessions WHERE plate_number = :p AND status = 'PARKED' ORDER BY entry_time DESC LIMIT 1",
            {"p": norm},
        ).fetchone()
        if row:
            session = dict(row)

    if not session:
        # Fallback: search partial match
        row = conn.execute(
            "SELECT * FROM parking_sessions WHERE plate_number LIKE :p AND status = 'PARKED' ORDER BY entry_time DESC LIMIT 1",
            {"p": f"%{norm}%"},
        ).fetchone()
        if row:
            session = dict(row)

    if not session:
        conn.close()
        raise ValueError(f"Không tìm thấy xe đang trong bãi với biển số '{norm}'. Xe có thể chưa quẹt vào hoặc đã check-out.")

    sid = session["id"]
    entry_time_str = session["entry_time"]

    # Calculate duration
    try:
        entry_dt = datetime.datetime.strptime(entry_time_str, "%Y-%m-%d %H:%M:%S")
        delta = now_dt - entry_dt
        duration_minutes = max(1, int(delta.total_seconds() / 60))
    except Exception:
        duration_minutes = 30

    # Calculate fee
    fee = calculate_parking_fee(
        vehicle_type=session.get("vehicle_type", "car"),
        ticket_type=session.get("ticket_type", "GUEST"),
        duration_minutes=duration_minutes,
    )

    is_matched = 1 if norm == session["plate_number"] else 0
    payment_status = "FREE_RESIDENT" if session.get("ticket_type") == "RESIDENT" else "PAID"

    # Update session
    conn.execute(
        """
        UPDATE parking_sessions SET
            exit_time = :exit_time,
            exit_camera_id = :exit_camera_id,
            exit_gate_name = :exit_gate_name,
            exit_snapshot_url = :exit_snapshot_url,
            exit_plate_crop_url = :exit_plate_crop_url,
            exit_plate_number = :exit_plate_number,
            is_plate_matched = :is_plate_matched,
            duration_minutes = :duration_minutes,
            parking_fee = :parking_fee,
            payment_status = :payment_status,
            status = 'COMPLETED',
            notes = COALESCE(:notes, notes),
            updated_at = :updated_at
        WHERE id = :id
        """,
        {
            "id": sid,
            "exit_time": now_str,
            "exit_camera_id": exit_camera_id,
            "exit_gate_name": exit_gate_name,
            "exit_snapshot_url": exit_snapshot_url,
            "exit_plate_crop_url": exit_plate_crop_url,
            "exit_plate_number": norm,
            "is_plate_matched": is_matched,
            "duration_minutes": duration_minutes,
            "parking_fee": fee,
            "payment_status": payment_status,
            "notes": notes,
            "updated_at": now_iso,
        },
    )

    # Record exit capture
    capture_id = f"CAP-OUT-{uuid.uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO parking_captures (
            id, session_id, camera_id, capture_type, plate_number,
            snapshot_url, plate_crop_url, confidence, captured_at
        ) VALUES (
            :id, :session_id, :camera_id, 'EXIT', :plate_number,
            :snapshot_url, :plate_crop_url, 0.95, :captured_at
        )
        """,
        {
            "id": capture_id,
            "session_id": sid,
            "camera_id": exit_camera_id or "CAM-OUT-01",
            "plate_number": norm,
            "snapshot_url": exit_snapshot_url,
            "plate_crop_url": exit_plate_crop_url,
            "captured_at": now_iso,
        },
    )

    conn.commit()
    conn.close()

    return get_parking_session(sid) or {}


def get_parking_session(session_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM parking_sessions WHERE id = :id", {"id": session_id}).fetchone()
    conn.close()
    return dict(row) if row else None


def list_parking_sessions(
    status: Optional[str] = None,
    plate: Optional[str] = None,
    ticket_type: Optional[str] = None,
    apartment: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM parking_sessions WHERE 1=1"
    params: Dict[str, Any] = {}

    if status and status != "ALL":
        query += " AND status = :status"
        params["status"] = status

    if plate:
        norm = normalize_plate(plate)
        query += " AND (plate_number LIKE :p OR plate_display LIKE :p)"
        params["p"] = f"%{norm}%"

    if ticket_type and ticket_type != "ALL":
        query += " AND ticket_type = :ticket_type"
        params["ticket_type"] = ticket_type

    if apartment:
        query += " AND apartment_number LIKE :apt"
        params["apt"] = f"%{apartment}%"

    query += " ORDER BY entry_time DESC LIMIT :limit"
    params["limit"] = limit

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_parking_dashboard_stats() -> Dict[str, Any]:
    """Retrieve high-level apartment parking statistics."""
    conn = get_connection()
    today_prefix = datetime.datetime.now().strftime("%Y-%m-%d")

    currently_parked = conn.execute(
        "SELECT COUNT(*) FROM parking_sessions WHERE status = 'PARKED'"
    ).fetchone()[0] or 0

    resident_parked = conn.execute(
        "SELECT COUNT(*) FROM parking_sessions WHERE status = 'PARKED' AND ticket_type = 'RESIDENT'"
    ).fetchone()[0] or 0

    guest_parked = conn.execute(
        "SELECT COUNT(*) FROM parking_sessions WHERE status = 'PARKED' AND ticket_type != 'RESIDENT'"
    ).fetchone()[0] or 0

    entries_today = conn.execute(
        "SELECT COUNT(*) FROM parking_sessions WHERE entry_time LIKE :t",
        {"t": f"{today_prefix}%"},
    ).fetchone()[0] or 0

    exits_today = conn.execute(
        "SELECT COUNT(*) FROM parking_sessions WHERE exit_time LIKE :t",
        {"t": f"{today_prefix}%"},
    ).fetchone()[0] or 0

    total_residents = conn.execute("SELECT COUNT(*) FROM resident_vehicles").fetchone()[0] or 0
    total_cameras = conn.execute("SELECT COUNT(*) FROM cameras").fetchone()[0] or 0
    active_cameras = conn.execute("SELECT COUNT(*) FROM cameras WHERE is_active = 1").fetchone()[0] or 0

    # Total revenue today
    revenue_today = conn.execute(
        "SELECT SUM(parking_fee) FROM parking_sessions WHERE exit_time LIKE :t",
        {"t": f"{today_prefix}%"},
    ).fetchone()[0] or 0

    # Recent 10 parking activities
    recent_rows = conn.execute(
        "SELECT * FROM parking_sessions ORDER BY entry_time DESC LIMIT 10"
    ).fetchall()

    conn.close()

    return {
        "currently_parked": currently_parked,
        "resident_parked": resident_parked,
        "guest_parked": guest_parked,
        "entries_today": entries_today,
        "exits_today": exits_today,
        "revenue_today_vnd": revenue_today,
        "total_registered_residents": total_residents,
        "total_cameras": total_cameras,
        "active_cameras": active_cameras,
        "recent_sessions": [dict(r) for r in recent_rows],
    }
