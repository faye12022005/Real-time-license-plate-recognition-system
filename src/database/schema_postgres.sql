-- ==============================================================================
-- SMART ALPR 2.0 - POSTGRESQL SCHEMA (DDL)
-- Hệ thống nhận diện biển số xe & Quản lý nhà xe chung cư thông minh
-- Cơ sở dữ liệu: PostgreSQL 14+ / 15 / 16 / 17
-- Lưu ý: Không chứa dữ liệu mẫu (Clean Schema)
-- ==============================================================================

-- Bật các tiện ích mở rộng: pgcrypto (sinh UUID) & pg_trgm (tìm kiếm biển số siêu tốc)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Tạo hàm tự động cập nhật trường updated_at khi có UPDATE
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 1. BẢNG CAMERAS (Quản lý các Camera Cổng Bãi Xe: Làn vào & Làn ra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cameras (
    id             VARCHAR(50) PRIMARY KEY,              -- Mã camera: 'CAM-IN-01', 'CAM-OUT-01'
    name           VARCHAR(255) NOT NULL,                -- Tên camera (VD: 'Camera Cổng Vào Làn 1 - Sảnh A')
    camera_type    VARCHAR(20) NOT NULL CHECK (camera_type IN ('ENTRY', 'EXIT', 'TWO_WAY')),
    rtsp_url       TEXT NOT NULL,                        -- Luồng RTSP IP Camera hoặc '0' cho Webcam
    location       VARCHAR(255) DEFAULT 'Cổng chính',    -- Vị trí đặt (Cổng chính, Hầm B1, Hầm B2...)
    resolution     VARCHAR(30) DEFAULT '1920x1080',      -- Độ phân giải
    fps_limit      INTEGER DEFAULT 25,                   -- Tốc độ khung hình tối đa
    is_active      INTEGER DEFAULT 1,                    -- 1 = Đang hoạt động, 0 = Tạm dừng
    last_heartbeat TIMESTAMPTZ,                          -- Thời điểm camera ping gần nhất
    created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras (camera_type);
CREATE INDEX IF NOT EXISTS idx_cameras_is_active ON cameras (is_active);

DROP TRIGGER IF EXISTS trg_cameras_updated_at ON cameras;
CREATE TRIGGER trg_cameras_updated_at
BEFORE UPDATE ON cameras
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();


-- ==============================================================================
-- 2. BẢNG RESIDENT_VEHICLES (Danh sách xe cư dân chung cư đăng ký vé tháng)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS resident_vehicles (
    id               VARCHAR(50) PRIMARY KEY,            -- Mã đăng ký: 'RES-001'
    plate_number     VARCHAR(20) UNIQUE NOT NULL,        -- Biển số chuẩn hóa: '51F88234'
    plate_display    VARCHAR(30) NOT NULL,               -- Biển số hiển thị: '51F-882.34'
    owner_name       VARCHAR(100) NOT NULL,              -- Họ tên cư dân (VD: 'Trần Minh Đức')
    apartment_number VARCHAR(50) NOT NULL,               -- Số căn hộ (VD: 'A12.05 - Tòa Sapphire')
    phone_number     VARCHAR(20),                        -- Số điện thoại
    vehicle_type     VARCHAR(30) DEFAULT 'car' CHECK (vehicle_type IN ('car', 'motorcycle', 'electric_bike', 'truck')),
    rfid_card_id     VARCHAR(50),                        -- Mã thẻ từ RFID quẹt thêm (nếu có)
    monthly_fee      INTEGER DEFAULT 0,                  -- Phí giữ xe hàng tháng (VNĐ)
    registered_at    DATE DEFAULT CURRENT_DATE,          -- Ngày bắt đầu đăng ký
    expiry_date      DATE DEFAULT '2029-12-31',          -- Hạn thẻ vé tháng
    status           VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'LOCKED')),
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resident_vehicles_plate ON resident_vehicles (plate_number);
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_apt ON resident_vehicles (apartment_number);
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_status ON resident_vehicles (status);
CREATE INDEX IF NOT EXISTS idx_resident_plate_trgm ON resident_vehicles USING gin (plate_number gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_resident_vehicles_updated_at ON resident_vehicles;
CREATE TRIGGER trg_resident_vehicles_updated_at
BEFORE UPDATE ON resident_vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();


-- ==============================================================================
-- 3. BẢNG PARKING_SESSIONS (CORE: Lưu ảnh chụp xe vào, biển số, giờ vào / ra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS parking_sessions (
    id                   VARCHAR(64) PRIMARY KEY,        -- Mã phiên gửi xe: 'PARK-20261022-XXXX'
    plate_number         VARCHAR(20) NOT NULL,           -- Biển số nhận diện chuẩn hóa: '51F88234'
    plate_display        VARCHAR(30) NOT NULL,           -- Biển số hiển thị: '51F-882.34'
    vehicle_type         VARCHAR(30) DEFAULT 'car',      -- Loại xe: 'car', 'motorcycle'
    ticket_type          VARCHAR(20) DEFAULT 'GUEST' CHECK (ticket_type IN ('RESIDENT', 'GUEST', 'STAFF')),
    status               VARCHAR(20) NOT NULL DEFAULT 'PARKED' CHECK (status IN ('PARKED', 'COMPLETED', 'CANCELLED')),

    -- [LUỒNG XE ĐI VÀO BÃI XE CHUNG CƯ]
    entry_time           TIMESTAMPTZ NOT NULL,           -- Giờ xe vào bãi: Timestamp
    entry_camera_id      VARCHAR(50),                    -- ID Camera làn vào (FK -> cameras.id)
    entry_gate_name      VARCHAR(100) DEFAULT 'Cổng Vào Làn 1',
    entry_snapshot_url   TEXT NOT NULL,                  -- TẤM ẢNH CHỤP TOÀN CẢNH XE LÚC VÀO
    entry_plate_crop_url TEXT,                           -- Tấm ảnh crop cận cảnh biển số lúc vào
    entry_confidence     NUMERIC(4, 3) DEFAULT 0.950,    -- Độ tin cậy nhận diện lúc vào (0.000 -> 1.000)

    -- [LUỒNG XE ĐI RA KHỎI BÃI XE CHUNG CƯ]
    exit_time            TIMESTAMPTZ,                    -- Giờ xe ra bãi (NULL khi đang đỗ)
    exit_camera_id       VARCHAR(50),                    -- ID Camera làn ra (FK -> cameras.id)
    exit_gate_name       VARCHAR(100),                   -- Tên cổng làn ra
    exit_snapshot_url    TEXT,                           -- TẤM ẢNH CHỤP TOÀN CẢNH XE LÚC RA
    exit_plate_crop_url  TEXT,                           -- Tấm ảnh crop cận cảnh biển số lúc ra
    exit_plate_number    VARCHAR(20),                    -- Biển số camera đọc được lúc ra
    is_plate_matched     INTEGER,                        -- 1: Trùng khớp biển vào và ra | 0: Lệch biển

    -- [THÔNG TIN CĂN HỘ CƯ DÂN & CƯỚC PHÍ]
    resident_id          VARCHAR(50),                    -- Mã cư dân (FK -> resident_vehicles.id)
    apartment_number     VARCHAR(50),                    -- Số căn hộ (VD: 'A12.05')
    resident_name        VARCHAR(100),                   -- Họ tên cư dân
    duration_minutes     INTEGER DEFAULT 0,              -- Tổng thời gian gửi xe (phút)
    parking_fee          INTEGER DEFAULT 0,              -- Phí gửi xe (VNĐ - Cư dân = 0 VNĐ)
    payment_status       VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'FREE_RESIDENT', 'UNPAID')),
    notes                TEXT,                           -- Ghi chú sự cố / vận hành
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_entry_camera FOREIGN KEY (entry_camera_id) REFERENCES cameras (id) ON DELETE SET NULL,
    CONSTRAINT fk_exit_camera  FOREIGN KEY (exit_camera_id)  REFERENCES cameras (id) ON DELETE SET NULL,
    CONSTRAINT fk_resident     FOREIGN KEY (resident_id)     REFERENCES resident_vehicles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON parking_sessions (status);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_plate ON parking_sessions (plate_number);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_entry ON parking_sessions (entry_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_exit ON parking_sessions (exit_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_ticket ON parking_sessions (ticket_type);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_trgm ON parking_sessions USING gin (plate_number gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_parking_sessions_updated_at ON parking_sessions;
CREATE TRIGGER trg_parking_sessions_updated_at
BEFORE UPDATE ON parking_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();


-- ==============================================================================
-- 4. BẢNG PARKING_CAPTURES (Nhật ký ảnh chụp camera snapshot theo thời gian thực)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS parking_captures (
    id             VARCHAR(64) PRIMARY KEY,              -- Mã sự kiện chụp ảnh (VD: 'CAP-IN-XXXX')
    session_id     VARCHAR(64),                          -- Liên kết phiên gửi xe (FK -> parking_sessions.id)
    camera_id      VARCHAR(50) NOT NULL,                 -- Mã camera chụp ảnh (FK -> cameras.id)
    capture_type   VARCHAR(20) NOT NULL CHECK (capture_type IN ('ENTRY', 'EXIT', 'MANUAL', 'TRIGGER')),
    plate_number   VARCHAR(20),                          -- Biển số nhận diện được
    snapshot_url   TEXT NOT NULL,                        -- Đường dẫn lưu file ảnh toàn cảnh
    plate_crop_url TEXT,                                 -- Đường dẫn lưu file ảnh crop biển số
    confidence     NUMERIC(4, 3) DEFAULT 0.950,
    captured_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_capture_session FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_capture_camera  FOREIGN KEY (camera_id)  REFERENCES cameras (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parking_captures_session ON parking_captures (session_id);
CREATE INDEX IF NOT EXISTS idx_parking_captures_time ON parking_captures (captured_at);


-- ==============================================================================
-- 5. BẢNG VIDEO_JOBS (Tác vụ video upload - Luồng tải video)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS video_jobs (
    id                    VARCHAR(64) PRIMARY KEY,       -- Job ID: 'job-1718000000000'
    filename              VARCHAR(255) NOT NULL,         -- Tên file video
    file_size_bytes       BIGINT,                        -- Kích thước byte
    stage                 VARCHAR(30) DEFAULT 'UPLOADED',
    stage_progress_pct    NUMERIC(5, 2) DEFAULT 0.0,
    overall_progress_pct  NUMERIC(5, 2) DEFAULT 0.0,
    total_frames          INTEGER DEFAULT 0,
    processed_frames      INTEGER DEFAULT 0,
    duration_seconds      NUMERIC(8, 2) DEFAULT 0.0,
    current_fps           NUMERIC(6, 2) DEFAULT 0.0,
    eta_seconds           NUMERIC(8, 2) DEFAULT 0.0,
    detected_plates_count INTEGER DEFAULT 0,
    video_url             TEXT,
    error_message         TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_stage ON video_jobs (stage);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created ON video_jobs (created_at);


-- ==============================================================================
-- 6. BẢNG PLATES (Bản ghi chi tiết biển số xe nhận diện từ video)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS plates (
    id               VARCHAR(64) PRIMARY KEY,
    job_id           VARCHAR(64),                        -- FK -> video_jobs.id
    job_filename     VARCHAR(255),
    track_id         INTEGER,
    plate_number     VARCHAR(20) NOT NULL,
    plate_display    VARCHAR(30),
    province         VARCHAR(100),
    plate_type       VARCHAR(20) DEFAULT 'white',
    vehicle_type     VARCHAR(30) DEFAULT 'car',
    confidence_score NUMERIC(4, 3),
    quality_score    NUMERIC(4, 3),
    crop_image_url   TEXT,
    pts_ms           BIGINT,
    video_time_str   VARCHAR(20),
    timestamp        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    speed_kmh        NUMERIC(5, 1),
    video_url        TEXT,

    CONSTRAINT fk_plate_job FOREIGN KEY (job_id) REFERENCES video_jobs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plates_job_id ON plates (job_id);
CREATE INDEX IF NOT EXISTS idx_plates_plate_number ON plates (plate_number);
CREATE INDEX IF NOT EXISTS idx_plates_trgm ON plates USING gin (plate_number gin_trgm_ops);
