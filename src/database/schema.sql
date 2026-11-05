-- ==============================================================================
-- SMART ALPR 2.0 - DATABASE SCHEMA (SQL DDL)
-- Hệ thống nhận diện biển số xe & Quản lý nhà xe chung cư thông minh
-- CSDL: SQLite 3 (Tương thích PostgreSQL / MySQL khi chuyển đổi kiểu dữ liệu)
-- Vị trí file CSDL thực tế: data/alpr.db
-- ==============================================================================

-- Bật chế độ ghi nhật ký Write-Ahead Logging (WAL) để đọc/ghi đồng thời không nghẽn
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ==============================================================================
-- 1. BẢNG QUẢN LÝ CAMERA CỔNG BÃI XE (Làn xe vào & Làn xe ra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cameras (
    id             TEXT PRIMARY KEY,                     -- Mã camera (VD: 'CAM-IN-01', 'CAM-OUT-01')
    name           TEXT NOT NULL,                        -- Tên camera (VD: 'Camera Cổng Vào Làn 1 - Sảnh A')
    camera_type    TEXT NOT NULL CHECK(camera_type IN ('ENTRY', 'EXIT', 'TWO_WAY')), -- Hướng kiểm soát
    rtsp_url       TEXT NOT NULL,                        -- Luồng RTSP (VD: 'rtsp://admin:123456@192.168.1.100:554/live') hoặc '0' (Webcam)
    location       TEXT DEFAULT 'Cổng chính',            -- Vị trí lắp đặt (Cổng chính, Hầm B1, Hầm B2...)
    resolution     TEXT DEFAULT '1920x1080',             -- Độ phân giải luồng hình ảnh
    fps_limit      INTEGER DEFAULT 25,                   -- Tốc độ khung hình xử lý tối đa
    is_active      INTEGER DEFAULT 1,                    -- 1 = Đang hoạt động, 0 = Tạm dừng
    last_heartbeat TEXT,                                 -- Thời điểm camera gửi tín hiệu ping gần nhất
    created_at     TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at     TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cameras_type ON cameras (camera_type);
CREATE INDEX IF NOT EXISTS idx_cameras_active ON cameras (is_active);


-- ==============================================================================
-- 2. BẢNG DANH SÁCH XE CƯ DÂN CHUNG CƯ ĐĂNG KÝ VÉ THÁNG
-- ==============================================================================
CREATE TABLE IF NOT EXISTS resident_vehicles (
    id               TEXT PRIMARY KEY,                   -- Mã định danh vé xe (VD: 'RES-001')
    plate_number     TEXT UNIQUE NOT NULL,               -- Biển số chuẩn hóa viết liền, in hoa (VD: '51F88234')
    plate_display    TEXT NOT NULL,                      -- Biển số hiển thị có dấu gạch/chấm (VD: '51F-882.34')
    owner_name       TEXT NOT NULL,                      -- Họ tên chủ xe / cư dân (VD: 'Nguyễn Văn An')
    apartment_number TEXT NOT NULL,                      -- Số phòng / căn hộ (VD: 'A12.05 - Tòa Sapphire')
    phone_number     TEXT,                               -- Số điện thoại liên hệ của cư dân
    vehicle_type     TEXT DEFAULT 'car' CHECK(vehicle_type IN ('car', 'motorcycle', 'electric_bike', 'truck')),
    rfid_card_id     TEXT,                               -- Mã thẻ từ RFID quẹt bổ trợ (nếu có)
    monthly_fee      INTEGER DEFAULT 0,                  -- Phí gửi xe vé tháng theo quy định chung cư (VNĐ)
    registered_at    TEXT DEFAULT (date('now', 'localtime')), -- Ngày bắt đầu đăng ký gửi xe
    expiry_date      TEXT DEFAULT '2029-12-31',          -- Hạn sử dụng vé tháng
    status           TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXPIRED', 'LOCKED')), -- Trạng thái vé
    notes            TEXT,                               -- Ghi chú (VD: 'Chủ căn hộ chính chủ')
    created_at       TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at       TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_resident_vehicles_plate ON resident_vehicles (plate_number);
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_apt ON resident_vehicles (apartment_number);
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_status ON resident_vehicles (status);


-- ==============================================================================
-- 3. BẢNG PHIÊN GỬI XE (CORE REQUIREMENT: Chụp ảnh vào, lưu giờ vào / giờ ra)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS parking_sessions (
    id                   TEXT PRIMARY KEY,               -- Mã phiên gửi xe (VD: 'PARK-20261022-XXXX')
    plate_number         TEXT NOT NULL,                  -- Biển số nhận diện chuẩn hóa (VD: '51F88234')
    plate_display        TEXT NOT NULL,                  -- Biển số hiển thị (VD: '51F-882.34')
    vehicle_type         TEXT DEFAULT 'car',             -- Loại xe ('car', 'motorcycle')
    ticket_type          TEXT DEFAULT 'GUEST' CHECK(ticket_type IN ('RESIDENT', 'GUEST', 'STAFF')),
    status               TEXT NOT NULL DEFAULT 'PARKED' CHECK(status IN ('PARKED', 'COMPLETED', 'CANCELLED')),

    -- [LUỒNG XE ĐI VÀO BÃI]
    entry_time           TEXT NOT NULL,                  -- Thời gian xe vào: 'YYYY-MM-DD HH:MM:SS'
    entry_camera_id      TEXT,                           -- ID Camera ghi nhận lúc xe vào (FK -> cameras.id)
    entry_gate_name      TEXT DEFAULT 'Cổng Vào Làn 1',  -- Tên cổng đón xe vào
    entry_snapshot_url   TEXT NOT NULL,                  -- URL / Đường dẫn file ảnh chụp toàn cảnh xe lúc vào
    entry_plate_crop_url TEXT,                           -- URL / Đường dẫn ảnh cắt cận cảnh biển số xe lúc vào
    entry_confidence     REAL DEFAULT 0.95,              -- Độ tin cậy OCR khi xe vào (0.0 -> 1.0)

    -- [LUỒNG XE ĐI RA BÃI]
    exit_time            TEXT,                           -- Thời gian xe ra: 'YYYY-MM-DD HH:MM:SS' (NULL khi đang gửi)
    exit_camera_id       TEXT,                           -- ID Camera ghi nhận lúc xe ra (FK -> cameras.id)
    exit_gate_name       TEXT,                           -- Tên cổng xe ra
    exit_snapshot_url    TEXT,                           -- URL / Đường dẫn file ảnh chụp toàn cảnh xe lúc ra
    exit_plate_crop_url  TEXT,                           -- URL / Đường dẫn ảnh cắt cận cảnh biển số xe lúc ra
    exit_plate_number    TEXT,                           -- Biển số nhận diện được lúc xe ra
    is_plate_matched     INTEGER,                        -- 1: Trùng khớp biển vào và ra | 0: Cảnh báo lệch biển số

    -- [THÔNG TIN CĂN HỘ CƯ DÂN & CƯỚC PHÍ]
    resident_id          TEXT,                           -- Mã cư dân (FK -> resident_vehicles.id nếu là cư dân)
    apartment_number     TEXT,                           -- Số căn hộ cư dân (VD: 'A12.05')
    resident_name        TEXT,                           -- Tên cư dân sở hữu xe
    duration_minutes     INTEGER DEFAULT 0,              -- Tổng thời gian gửi xe (phút)
    parking_fee          INTEGER DEFAULT 0,              -- Phí gửi xe tính bằng VNĐ (Cư dân vé tháng = 0 VNĐ)
    payment_status       TEXT DEFAULT 'UNPAID' CHECK(payment_status IN ('PAID', 'FREE_RESIDENT', 'UNPAID')),
    notes                TEXT,                           -- Ghi chú vận hành / lý do miễn phí / sự cố
    created_at           TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at           TEXT DEFAULT (datetime('now', 'localtime')),

    FOREIGN KEY (entry_camera_id) REFERENCES cameras (id) ON DELETE SET NULL,
    FOREIGN KEY (exit_camera_id)  REFERENCES cameras (id) ON DELETE SET NULL,
    FOREIGN KEY (resident_id)     REFERENCES resident_vehicles (id) ON DELETE SET NULL
);

-- Chỉ mục tối ưu hóa tốc độ tìm kiếm xe đang gửi và truy vấn báo cáo theo ngày
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON parking_sessions (status);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_plate ON parking_sessions (plate_number);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_entry ON parking_sessions (entry_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_exit ON parking_sessions (exit_time);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_ticket ON parking_sessions (ticket_type);


-- ==============================================================================
-- 4. BẢNG NHẬT KÝ ẢNH CHỤP CAMERA (Bằng chứng camera snapshot theo thời gian thực)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS parking_captures (
    id             TEXT PRIMARY KEY,                     -- Mã sự kiện chụp ảnh (VD: 'CAP-IN-XXXX')
    session_id     TEXT,                                 -- Liên kết phiên gửi xe (FK -> parking_sessions.id)
    camera_id      TEXT NOT NULL,                        -- Mã camera đã chụp ảnh (FK -> cameras.id)
    capture_type   TEXT NOT NULL CHECK(capture_type IN ('ENTRY', 'EXIT', 'MANUAL', 'TRIGGER')),
    plate_number   TEXT,                                 -- Biển số nhận diện được
    snapshot_url   TEXT NOT NULL,                        -- Đường dẫn lưu file ảnh toàn cảnh trên đĩa
    plate_crop_url TEXT,                                 -- Đường dẫn lưu file ảnh crop biển số
    confidence     REAL DEFAULT 0.95,                    -- Độ tin cậy OCR
    captured_at    TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id)  REFERENCES cameras (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parking_captures_session ON parking_captures (session_id);
CREATE INDEX IF NOT EXISTS idx_parking_captures_time ON parking_captures (captured_at);


-- ==============================================================================
-- 5. BẢNG TÁC VỤ XỬ LÝ VIDEO UPLOAD (Giữ nguyên luồng tải video hiện tại)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS video_jobs (
    id                    TEXT PRIMARY KEY,              -- Mã tác vụ (VD: 'job-1718000000000')
    filename              TEXT NOT NULL,                 -- Tên file video tải lên
    file_size_bytes       INTEGER,                       -- Kích thước file tính theo byte
    stage                 TEXT DEFAULT 'UPLOADED',       -- Giai đoạn: 'UPLOADED', 'TRANSCODING', 'PROCESSING', 'COMPLETED', 'FAILED'
    stage_progress_pct    REAL DEFAULT 0.0,              -- Tiến trình của giai đoạn hiện tại (0 -> 100%)
    overall_progress_pct  REAL DEFAULT 0.0,              -- Tiến trình kép AI tổng thể (20% chuyển mã + 80% AI)
    total_frames          INTEGER DEFAULT 0,             -- Tổng số khung hình của video
    processed_frames      INTEGER DEFAULT 0,             -- Số khung hình đã xử lý
    duration_seconds      REAL DEFAULT 0.0,              -- Thời lượng video tính theo giây
    current_fps           REAL DEFAULT 0.0,              -- Tốc độ xử lý khung hình hiện tại (FPS)
    eta_seconds           REAL DEFAULT 0.0,              -- Thời gian dự kiến còn lại (giây)
    detected_plates_count INTEGER DEFAULT 0,             -- Số lượng biển số xe đã phát hiện
    video_url             TEXT,                          -- Đường dẫn stream xem lại video (/static/videos/...)
    error_message         TEXT,                          -- Nội dung thông báo lỗi nếu thất bại
    created_at            TEXT DEFAULT (datetime('now', 'localtime')),
    completed_at          TEXT                           -- Thời điểm hoàn tất xử lý
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_stage ON video_jobs (stage);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created ON video_jobs (created_at);


-- ==============================================================================
-- 6. BẢNG CHI TIẾT BIỂN SỐ XE NHẬN DIỆN (Lưu vết theo từng khung hình video)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS plates (
    id               TEXT PRIMARY KEY,                   -- Mã bản ghi (VD: 'plate-job-123-0')
    job_id           TEXT,                               -- Tác vụ video chứa biển số này (FK -> video_jobs.id)
    job_filename     TEXT,                               -- Tên file video nguồn
    track_id         INTEGER,                            -- ID theo vết phương tiện (Vehicle Tracking ID)
    plate_number     TEXT NOT NULL,                      -- Biển số xe chuẩn hóa (VD: '51F88234')
    plate_display    TEXT,                               -- Biển số xe hiển thị (VD: '51F-882.34')
    province         TEXT,                               -- Tỉnh/Thành phố đăng ký (VD: 'TP. Hồ Chí Minh')
    plate_type       TEXT DEFAULT 'white',               -- Màu biển: 'white', 'yellow', 'blue', 'red'
    vehicle_type     TEXT DEFAULT 'car',                 -- Loại xe: 'car', 'motorcycle', 'bus', 'truck'
    confidence_score REAL,                               -- Độ tin cậy nhận dạng OCR (0.0 -> 1.0)
    quality_score    REAL,                               -- Điểm độ rõ nét hình ảnh
    crop_image_url   TEXT,                               -- Đường dẫn ảnh crop biển số (/static/captures/...)
    pts_ms           INTEGER,                            -- Mốc mili-giây xuất hiện trong video
    video_time_str   TEXT,                               -- Định dạng phút:giây trong video (VD: '01:24')
    timestamp        TEXT,                               -- Thời điểm phát hiện (ISO 8601)
    speed_kmh        REAL,                               -- Vận tốc ước tính (km/h)
    video_url        TEXT,                               -- URL phát video làm bằng chứng
    FOREIGN KEY (job_id) REFERENCES video_jobs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plates_job_id ON plates (job_id);
CREATE INDEX IF NOT EXISTS idx_plates_plate_number ON plates (plate_number);
CREATE INDEX IF NOT EXISTS idx_plates_timestamp ON plates (timestamp);
