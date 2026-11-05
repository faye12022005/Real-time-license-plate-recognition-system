"""FastAPI router for Apartment Parking Lot Management & Camera Integration."""

import datetime
from pathlib import Path
from typing import List, Optional
import cv2  # type: ignore
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
import numpy as np  # type: ignore
from pydantic import BaseModel, Field

from config.settings import PARKING_DIR
from src.database.repository import (
    delete_camera,
    delete_resident_vehicle,
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
from src.utils.plate_validator import format_vietnamese_plate, normalize_plate

router = APIRouter(prefix="/parking")

# Reusable camera connector instance
connector = CameraConnector()


# ==============================================================================
# Pydantic Request & Response Schemas
# ==============================================================================

class CameraCreateUpdate(BaseModel):
    id: Optional[str] = Field(None, description="Mã camera (tự sinh nếu để trống)", examples=["CAM-IN-01"])
    name: str = Field(..., description="Tên camera cổng", examples=["Camera Cổng Vào Làn 1 - Sảnh Chính"])
    camera_type: str = Field("ENTRY", description="ENTRY: Làn vào | EXIT: Làn ra | TWO_WAY: 2 chiều", examples=["ENTRY"])
    rtsp_url: str = Field("0", description="Luồng RTSP IP hoặc '0' cho webcam máy tính", examples=["0"])
    location: str = Field("Cổng chính", description="Vị trí lắp đặt", examples=["Cổng chính - Làn 1"])
    resolution: str = Field("1920x1080", description="Độ phân giải", examples=["1920x1080"])
    fps_limit: int = Field(25, description="Giới hạn FPS xử lý", examples=[25])
    is_active: int = Field(1, description="1: Kích hoạt, 0: Tạm dừng", examples=[1])


class ResidentVehicleCreate(BaseModel):
    id: Optional[str] = Field(None, description="Mã định danh cư dân", examples=["RES-001"])
    plate_number: str = Field(..., description="Biển số xe (VD: 51F-882.34)", examples=["51F-882.34"])
    plate_display: Optional[str] = Field(None, description="Biển số hiển thị", examples=["51F-882.34"])
    owner_name: str = Field(..., description="Họ tên cư dân chủ hộ", examples=["Trần Minh Đức"])
    apartment_number: str = Field(..., description="Số căn hộ", examples=["A12.05 - Tòa Sapphire"])
    phone_number: Optional[str] = Field("", description="Số điện thoại", examples=["0908123456"])
    vehicle_type: str = Field("car", description="Loại xe: car | motorcycle | electric_bike", examples=["car"])
    rfid_card_id: Optional[str] = Field(None, description="Mã thẻ từ RFID", examples=["RFID-987654"])
    monthly_fee: int = Field(1200000, description="Phí gửi xe hàng tháng (VNĐ)", examples=[1200000])
    registered_at: Optional[str] = Field(None, description="Ngày bắt đầu", examples=["2025-01-01"])
    expiry_date: Optional[str] = Field("2029-12-31", description="Ngày hết hạn vé tháng", examples=["2029-12-31"])
    status: str = Field("ACTIVE", description="ACTIVE | EXPIRED | LOCKED", examples=["ACTIVE"])
    notes: Optional[str] = Field("Cư dân chính chủ", description="Ghi chú", examples=["Cư dân chính chủ"])


class CheckInPayload(BaseModel):
    camera_id: str = Field("CAM-IN-01", description="Mã camera cổng vào", examples=["CAM-IN-01"])
    plate_number: Optional[str] = Field("51F-882.34", description="Biển số xe cần check-in", examples=["51F-882.34"])
    vehicle_type: str = Field("car", description="Loại phương tiện: car | motorcycle", examples=["car"])
    notes: Optional[str] = Field("Xe vào bãi", description="Ghi chú thêm", examples=["Xe vào bãi"])


class CheckOutPayload(BaseModel):
    camera_id: str = Field("CAM-OUT-01", description="Mã camera cổng ra", examples=["CAM-OUT-01"])
    plate_number: Optional[str] = Field("51F-882.34", description="Biển số xe cần check-out", examples=["51F-882.34"])
    session_id: Optional[str] = Field(None, description="Mã phiên gửi xe (tùy chọn)", examples=[None])
    notes: Optional[str] = Field("Xe ra bình thường", description="Ghi chú xuất bãi", examples=["Xe ra bình thường"])


# ==============================================================================
# 1. CAMERAS MANAGEMENT ENDPOINTS
# ==============================================================================

@router.get("/cameras")
def get_all_cameras(
    camera_type: Optional[str] = Query(None, description="Lọc theo loại: ENTRY | EXIT"),
    is_active: Optional[int] = Query(None, description="Lọc theo trạng thái kích hoạt"),
):
    """Lấy danh sách tất cả camera làn xe trong chung cư."""
    return list_cameras(camera_type=camera_type, is_active=is_active)


@router.post("/cameras")
def create_or_update_camera(payload: CameraCreateUpdate):
    """Thêm mới hoặc cập nhật thông tin Camera / Luồng RTSP."""
    return upsert_camera(payload.dict())


@router.delete("/cameras/{camera_id}")
def remove_camera(camera_id: str):
    """Xóa cấu hình camera."""
    success = delete_camera(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy camera để xóa")
    return {"status": "success", "message": f"Đã xóa camera {camera_id}"}


@router.post("/cameras/{camera_id}/test")
def test_camera(camera_id: str):
    """Kiểm tra tín hiệu kết nối thực tế tới Camera IP / RTSP / Webcam."""
    camera = get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera không tồn tại")

    success, msg = CameraConnector.test_connection(camera["rtsp_url"])
    return {
        "camera_id": camera_id,
        "name": camera["name"],
        "rtsp_url": camera["rtsp_url"],
        "connected": success,
        "message": msg,
    }


@router.get("/cameras/{camera_id}/snapshot")
def get_camera_snapshot(camera_id: str):
    """Chụp 1 khung hình JPEG trực tiếp từ Camera để xem trước trên giao diện."""
    camera = get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera không tồn tại")

    frame = connector.capture_frame_from_camera(camera["rtsp_url"])
    if frame is None:
        raise HTTPException(
            status_code=503,
            detail=f"Không lấy được khung hình từ camera {camera['name']} ({camera['rtsp_url']})",
        )

    encoded, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not encoded:
        raise HTTPException(status_code=500, detail="Không thể mã hóa ảnh từ camera")

    return Response(
        content=buffer.tobytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


# ==============================================================================
# 2. RESIDENT VEHICLES ENDPOINTS (Quản lý xe cư dân chung cư)
# ==============================================================================

@router.get("/residents")
def get_residents(
    q: Optional[str] = Query(None, description="Tìm theo biển số, họ tên chủ xe, hoặc căn hộ"),
    apartment: Optional[str] = Query(None, description="Lọc theo căn hộ (VD: A12.05)"),
    status: Optional[str] = Query(None, description="ACTIVE | EXPIRED | LOCKED"),
):
    """Danh sách biển số xe cư dân đăng ký vé tháng tại chung cư."""
    return list_residents(q=q, apartment=apartment, status=status)


@router.post("/residents")
def register_resident_vehicle(payload: ResidentVehicleCreate):
    """Đăng ký mới hoặc gia hạn vé xe cư dân cho căn hộ."""
    return upsert_resident_vehicle(payload.dict())


@router.delete("/residents/{resident_id}")
def unregister_resident_vehicle(resident_id: str):
    """Xóa thông tin đăng ký xe của cư dân."""
    success = delete_resident_vehicle(resident_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi xe cư dân")
    return {"status": "success", "message": "Đã xóa xe cư dân khỏi hệ thống"}


# ==============================================================================
# 3. PARKING SESSIONS & VEHICLE ENTRY / EXIT (Luồng xe vào / xe ra)
# ==============================================================================

@router.get("/stats")
def get_parking_stats():
    """Lấy thống kê bãi xe chung cư: xe đang đỗ, lượt vào/ra hôm nay, doanh thu."""
    return get_parking_dashboard_stats()


@router.get("/sessions")
def get_parking_sessions(
    status: Optional[str] = Query(None, description="PARKED (đang trong bãi) | COMPLETED (đã ra)"),
    plate: Optional[str] = Query(None, description="Tìm theo biển số xe"),
    ticket_type: Optional[str] = Query(None, description="RESIDENT | GUEST"),
    apartment: Optional[str] = Query(None, description="Lọc theo căn hộ"),
    limit: int = Query(100, ge=1, le=500),
):
    """Tra cứu lịch sử xe vào/ra và các xe đang gửi trong bãi."""
    return list_parking_sessions(
        status=status,
        plate=plate,
        ticket_type=ticket_type,
        apartment=apartment,
        limit=limit,
    )


@router.get("/sessions/{session_id}")
def get_parking_session_detail(session_id: str):
    """Xem chi tiết 1 phiên gửi xe kèm ảnh chụp lúc vào và ảnh chụp lúc ra."""
    session = get_parking_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên gửi xe")
    return session


@router.post("/check-in")
def check_in_by_trigger(payload: CheckInPayload):
    """Ghi nhận xe đi vào bãi qua tín hiệu trigger / kết nối camera.

    Hệ thống chụp 1 tấm ảnh từ camera làn vào, nhận dạng biển số,
    lưu ảnh và thời gian xe vào, đối chiếu căn hộ cư dân.
    """
    try:
        session = connector.process_camera_entry(
            camera_id=payload.camera_id,
            fallback_plate=payload.plate_number,
            notes=payload.notes,
        )
        return {
            "status": "success",
            "message": "Ghi nhận xe vào bãi thành công",
            "data": session,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý xe vào bãi: {str(e)}")


@router.post("/check-in/upload")
async def check_in_by_image_upload(
    camera_id: str = Form("CAM-IN-01"),
    plate_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    """Chụp / Tải lên 1 tấm ảnh xe vào từ camera hoặc thiết bị di động."""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=422, detail="Tệp tải lên không phải là ảnh hợp lệ")

    session = connector.process_camera_entry(
        camera_id=camera_id,
        frame=frame,
        fallback_plate=plate_number,
        notes=notes or f"Tải lên từ thiết bị: {file.filename}",
    )
    return {
        "status": "success",
        "message": "Đã chụp ảnh xe vào và lưu cơ sở dữ liệu",
        "data": session,
    }


@router.post("/check-out")
def check_out_by_trigger(payload: CheckOutPayload):
    """Ghi nhận xe đi ra bãi qua camera làn ra.

    Hệ thống chụp 1 tấm ảnh lúc ra, nhận diện biển số, tính thời gian đỗ,
    tính cước phí và đối chiếu so khớp với ảnh chụp lúc vào.
    """
    try:
        session = connector.process_camera_exit(
            camera_id=payload.camera_id,
            fallback_plate=payload.plate_number,
            session_id=payload.session_id,
            notes=payload.notes,
        )
        return {
            "status": "success",
            "message": "Ghi nhận xe ra bãi thành công",
            "data": session,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý xe ra bãi: {str(e)}")


@router.post("/check-out/upload")
async def check_out_by_image_upload(
    camera_id: str = Form("CAM-OUT-01"),
    plate_number: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    """Chụp / Tải lên 1 tấm ảnh xe ra từ camera để hoàn tất thanh toán và rời bãi."""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=422, detail="Tệp tải lên không phải là ảnh hợp lệ")

    try:
        session = connector.process_camera_exit(
            camera_id=camera_id,
            frame=frame,
            fallback_plate=plate_number,
            session_id=session_id,
            notes=notes or f"Tải lên lúc ra: {file.filename}",
        )
        return {
            "status": "success",
            "message": "Đã ghi nhận xe ra và đối soát biển số",
            "data": session,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý xe ra bãi: {str(e)}")


@router.get("/database/status")
def get_database_connection_status():
    """Kiểm tra trạng thái kết nối trực tiếp tới SQL Server / MySQL trong src và thống kê số lượng dữ liệu các bảng."""
    from src.database.connection import check_db_status
    return check_db_status()
