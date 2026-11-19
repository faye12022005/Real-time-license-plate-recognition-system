"""Data models for ALPR database (Video Jobs, Plates, Cameras, Parking Sessions, Residents)."""

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class CameraModel:
    """Represents a gate or lane camera in the parking lot."""

    id: str  # e.g., "CAM-IN-01", "CAM-OUT-01"
    name: str  # e.g., "Camera Cổng Vào Làn 1 - Sảnh A"
    camera_type: str  # "ENTRY", "EXIT", "TWO_WAY"
    rtsp_url: str  # RTSP URL or "0" for webcam
    location: str = "Cổng chính"
    resolution: str = "1920x1080"
    fps_limit: int = 25
    is_active: int = 1  # 1 = active, 0 = inactive
    last_heartbeat: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ResidentVehicleModel:
    """Represents a registered resident vehicle in the apartment building."""

    id: str
    plate_number: str  # Normalized (e.g. "51F88234")
    plate_display: str  # Formatted (e.g. "51F-882.34")
    owner_name: str  # Resident full name (e.g. "Nguyễn Văn An")
    apartment_number: str  # Apartment unit (e.g. "A12.05 - Tòa tháp A")
    phone_number: str = ""
    vehicle_type: str = "car"  # "car", "motorcycle", "electric_bike"
    rfid_card_id: Optional[str] = None
    monthly_fee: int = 0
    registered_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    expiry_date: str = "2029-12-31"
    status: str = "ACTIVE"  # "ACTIVE", "EXPIRED", "LOCKED"
    notes: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ParkingSessionModel:
    """Represents an apartment parking session (Vehicle entry -> Parking -> Vehicle exit)."""

    id: str  # e.g. "PARK-20261022-001"
    plate_number: str  # e.g. "51F88234"
    plate_display: str  # e.g. "51F-882.34"
    vehicle_type: str = "car"
    ticket_type: str = "GUEST"  # "RESIDENT", "GUEST", "STAFF"
    status: str = "PARKED"  # "PARKED" (in lot), "COMPLETED" (left lot), "CANCELLED"

    # Entry flow details (Khi xe vào bãi)
    entry_time: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    entry_camera_id: Optional[str] = None
    entry_gate_name: str = "Cổng Vào Làn 1"
    entry_snapshot_url: str = ""  # Full snapshot photo of car entering
    entry_plate_crop_url: str = ""  # Cropped plate photo
    entry_confidence: float = 0.95

    # Exit flow details (Khi xe ra khỏi bãi)
    exit_time: Optional[str] = None  # Departure timestamp
    exit_camera_id: Optional[str] = None
    exit_gate_name: Optional[str] = None
    exit_snapshot_url: Optional[str] = None  # Full snapshot photo of car leaving
    exit_plate_crop_url: Optional[str] = None  # Cropped plate photo at exit
    exit_plate_number: Optional[str] = None  # License plate recognized at exit
    is_plate_matched: Optional[int] = None  # 1 = Match, 0 = Mismatch warning

    # Resident & Fee metadata
    resident_id: Optional[str] = None
    apartment_number: Optional[str] = None
    resident_name: Optional[str] = None
    duration_minutes: int = 0
    parking_fee: int = 0
    payment_status: str = "UNPAID"  # "PAID", "FREE_RESIDENT", "UNPAID"
    notes: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ParkingCaptureModel:
    """Represents a camera capture event with full snapshot and cropped license plate."""

    id: str
    session_id: Optional[str]
    camera_id: str
    capture_type: str  # "ENTRY", "EXIT", "TRIGGER"
    plate_number: str
    snapshot_url: str
    plate_crop_url: Optional[str] = None
    confidence: float = 0.95
    captured_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
