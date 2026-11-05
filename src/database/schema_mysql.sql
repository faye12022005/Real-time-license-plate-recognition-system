-- ==============================================================================
-- Schema MySQL 8.0+ / 9.0+ cho Hệ Thống Nhận Diện Biển Số Xe & Quản Lý Nhà Xe Chung Cư
-- Đảm bảo: Hỗ trợ tiếng Việt UTF-8 (utf8mb4), indexing tối ưu, ZERO SEED DATA
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS ALPR_DB
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ALPR_DB;

-- 1. BẢNG CAMERAS: Quản lý Camera cổng vào / cổng ra chung cư
CREATE TABLE IF NOT EXISTS cameras (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    camera_type VARCHAR(32) NOT NULL, -- ENTRY, EXIT, TWO_WAY
    rtsp_url VARCHAR(512) NOT NULL,
    location VARCHAR(255) DEFAULT NULL,
    resolution VARCHAR(32) DEFAULT '1920x1080',
    fps_limit INT DEFAULT 25,
    is_active TINYINT(1) DEFAULT 1,
    last_heartbeat VARCHAR(64) DEFAULT NULL,
    created_at VARCHAR(64) DEFAULT NULL,
    updated_at VARCHAR(64) DEFAULT NULL,
    INDEX idx_cameras_type (camera_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG RESIDENT_VEHICLES: Quản lý xe cư dân chung cư theo căn hộ
CREATE TABLE IF NOT EXISTS resident_vehicles (
    id VARCHAR(64) PRIMARY KEY,
    plate_number VARCHAR(32) NOT NULL UNIQUE,
    plate_display VARCHAR(32) NOT NULL,
    owner_name VARCHAR(128) NOT NULL,
    apartment_number VARCHAR(64) NOT NULL,
    phone_number VARCHAR(32) DEFAULT NULL,
    vehicle_type VARCHAR(32) DEFAULT 'car',
    rfid_card_id VARCHAR(64) DEFAULT NULL,
    monthly_fee INT DEFAULT 0,
    registered_at VARCHAR(64) DEFAULT NULL,
    expiry_date VARCHAR(64) DEFAULT NULL,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, LOCKED
    notes TEXT DEFAULT NULL,
    created_at VARCHAR(64) DEFAULT NULL,
    updated_at VARCHAR(64) DEFAULT NULL,
    INDEX idx_resident_vehicles_plate (plate_number),
    INDEX idx_resident_vehicles_apt (apartment_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG PARKING_SESSIONS: Phiên xe ra / vào bãi xe chung cư
CREATE TABLE IF NOT EXISTS parking_sessions (
    id VARCHAR(64) PRIMARY KEY,
    plate_number VARCHAR(32) NOT NULL,
    plate_display VARCHAR(32) NOT NULL,
    vehicle_type VARCHAR(32) DEFAULT 'car',
    ticket_type VARCHAR(32) DEFAULT 'GUEST', -- RESIDENT, GUEST, VIP
    status VARCHAR(32) NOT NULL DEFAULT 'PARKED', -- PARKED, COMPLETED, CANCELLED
    entry_time VARCHAR(64) NOT NULL,
    entry_camera_id VARCHAR(64) DEFAULT NULL,
    entry_gate_name VARCHAR(128) DEFAULT NULL,
    entry_snapshot_url VARCHAR(512) NOT NULL,
    entry_plate_crop_url VARCHAR(512) DEFAULT NULL,
    entry_confidence FLOAT DEFAULT 0.95,
    exit_time VARCHAR(64) DEFAULT NULL,
    exit_camera_id VARCHAR(64) DEFAULT NULL,
    exit_gate_name VARCHAR(128) DEFAULT NULL,
    exit_snapshot_url VARCHAR(512) DEFAULT NULL,
    exit_plate_crop_url VARCHAR(512) DEFAULT NULL,
    exit_plate_number VARCHAR(32) DEFAULT NULL,
    is_plate_matched TINYINT(1) DEFAULT NULL,
    resident_id VARCHAR(64) DEFAULT NULL,
    apartment_number VARCHAR(64) DEFAULT NULL,
    resident_name VARCHAR(128) DEFAULT NULL,
    duration_minutes INT DEFAULT 0,
    parking_fee INT DEFAULT 0,
    payment_status VARCHAR(32) DEFAULT 'UNPAID', -- UNPAID, PAID, EXEMPT
    notes TEXT DEFAULT NULL,
    created_at VARCHAR(64) DEFAULT NULL,
    updated_at VARCHAR(64) DEFAULT NULL,
    INDEX idx_parking_sessions_status (status),
    INDEX idx_parking_sessions_plate (plate_number),
    INDEX idx_parking_sessions_entry (entry_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG PARKING_CAPTURES: Lưu ảnh chụp và metadata mỗi lượt quét
CREATE TABLE IF NOT EXISTS parking_captures (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) DEFAULT NULL,
    camera_id VARCHAR(64) NOT NULL,
    capture_type VARCHAR(32) NOT NULL, -- ENTRY_SNAPSHOT, EXIT_SNAPSHOT
    plate_number VARCHAR(32) DEFAULT NULL,
    snapshot_url VARCHAR(512) NOT NULL,
    plate_crop_url VARCHAR(512) DEFAULT NULL,
    confidence FLOAT DEFAULT 0.95,
    captured_at VARCHAR(64) NOT NULL,
    INDEX idx_captures_session (session_id),
    INDEX idx_captures_camera (camera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG VIDEO_JOBS: Quản lý tiến trình xử lý video tải lên
CREATE TABLE IF NOT EXISTS video_jobs (
    id VARCHAR(64) PRIMARY KEY,
    filename VARCHAR(255) DEFAULT NULL,
    file_size_bytes BIGINT DEFAULT NULL,
    stage VARCHAR(64) DEFAULT NULL,
    stage_progress_pct FLOAT DEFAULT NULL,
    overall_progress_pct FLOAT DEFAULT NULL,
    total_frames INT DEFAULT NULL,
    processed_frames INT DEFAULT NULL,
    duration_seconds FLOAT DEFAULT NULL,
    current_fps FLOAT DEFAULT NULL,
    eta_seconds FLOAT DEFAULT NULL,
    detected_plates_count INT DEFAULT NULL,
    video_url VARCHAR(512) DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at VARCHAR(64) DEFAULT NULL,
    completed_at VARCHAR(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG PLATES: Danh sách biển số nhận diện từ luồng video
CREATE TABLE IF NOT EXISTS plates (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) DEFAULT NULL,
    job_filename VARCHAR(255) DEFAULT NULL,
    track_id INT DEFAULT NULL,
    plate_number VARCHAR(32) DEFAULT NULL,
    plate_display VARCHAR(32) DEFAULT NULL,
    province VARCHAR(64) DEFAULT NULL,
    plate_type VARCHAR(32) DEFAULT NULL,
    vehicle_type VARCHAR(32) DEFAULT NULL,
    confidence_score FLOAT DEFAULT NULL,
    quality_score FLOAT DEFAULT NULL,
    crop_image_url VARCHAR(512) DEFAULT NULL,
    pts_ms BIGINT DEFAULT NULL,
    video_time_str VARCHAR(32) DEFAULT NULL,
    timestamp VARCHAR(64) DEFAULT NULL,
    speed_kmh FLOAT DEFAULT NULL,
    video_url VARCHAR(512) DEFAULT NULL,
    INDEX idx_plates_job_id (job_id),
    INDEX idx_plates_plate (plate_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
