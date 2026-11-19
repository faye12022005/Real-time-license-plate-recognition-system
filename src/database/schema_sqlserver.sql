-- ==============================================================================
-- SMART ALPR 2.0 - MICROSOFT SQL SERVER SCHEMA (T-SQL DDL)
-- Hệ thống nhận diện biển số xe & Quản lý nhà xe chung cư thông minh
-- Cơ sở dữ liệu: Microsoft SQL Server 2017 / 2019 / 2022 / Azure SQL
-- Lưu ý: Clean Schema (Không chứa dữ liệu mẫu)
-- ==============================================================================

-- 1. Tự động tạo Database nếu chưa tồn tại với bảng mã tiếng Việt Unicode
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'ALPR_DB')
BEGIN
    CREATE DATABASE [ALPR_DB] COLLATE Vietnamese_CI_AS;
END
GO

USE [ALPR_DB];
GO

-- ==============================================================================
-- 1. BẢNG CAMERAS (Quản lý các Camera Cổng Bãi Xe: Làn vào & Làn ra)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cameras')
BEGIN
    CREATE TABLE cameras (
        id             NVARCHAR(50) PRIMARY KEY,              -- Mã camera: 'CAM-IN-01', 'CAM-OUT-01'
        name           NVARCHAR(255) NOT NULL,                -- Tên camera (VD: N'Camera Cổng Vào Làn 1 - Sảnh A')
        camera_type    NVARCHAR(20) NOT NULL CHECK (camera_type IN ('ENTRY', 'EXIT', 'TWO_WAY')),
        rtsp_url       NVARCHAR(MAX) NOT NULL,                -- Luồng RTSP IP Camera hoặc '0' cho Webcam
        location       NVARCHAR(255) DEFAULT N'Cổng chính',   -- Vị trí đặt (Cổng chính, Hầm B1, Hầm B2...)
        resolution     NVARCHAR(30) DEFAULT '1920x1080',      -- Độ phân giải
        fps_limit      INT DEFAULT 25,                        -- Tốc độ khung hình tối đa
        is_active      BIT DEFAULT 1,                         -- 1 = Đang hoạt động, 0 = Tạm dừng
        last_heartbeat DATETIME2(3) NULL,                     -- Thời điểm camera ping gần nhất
        created_at     DATETIME2(3) DEFAULT SYSDATETIME(),
        updated_at     DATETIME2(3) DEFAULT SYSDATETIME()
    );

    CREATE NONCLUSTERED INDEX idx_cameras_type ON cameras (camera_type);
    CREATE NONCLUSTERED INDEX idx_cameras_is_active ON cameras (is_active);
END
GO


-- ==============================================================================
-- 2. BẢNG RESIDENT_VEHICLES (Danh sách xe cư dân chung cư đăng ký vé tháng)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'resident_vehicles')
BEGIN
    CREATE TABLE resident_vehicles (
        id               NVARCHAR(50) PRIMARY KEY,            -- Mã đăng ký: 'RES-001'
        plate_number     NVARCHAR(20) UNIQUE NOT NULL,        -- Biển số chuẩn hóa: '51F88234'
        plate_display    NVARCHAR(30) NOT NULL,               -- Biển số hiển thị: '51F-882.34'
        owner_name       NVARCHAR(100) NOT NULL,              -- Họ tên cư dân (VD: N'Trần Minh Đức')
        apartment_number NVARCHAR(50) NOT NULL,               -- Số căn hộ (VD: N'A12.05 - Tòa Sapphire')
        phone_number     NVARCHAR(20) NULL,                   -- Số điện thoại
        vehicle_type     NVARCHAR(30) DEFAULT 'car' CHECK (vehicle_type IN ('car', 'motorcycle', 'electric_bike', 'truck')),
        rfid_card_id     NVARCHAR(50) NULL,                   -- Mã thẻ từ RFID quẹt thêm (nếu có)
        monthly_fee      INT DEFAULT 0,                       -- Phí giữ xe hàng tháng (VNĐ)
        registered_at    DATE DEFAULT CAST(GETDATE() AS DATE),-- Ngày bắt đầu đăng ký
        expiry_date      DATE DEFAULT '2029-12-31',           -- Ngày hết hạn vé tháng
        status           NVARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'LOCKED')),
        notes            NVARCHAR(MAX) NULL,
        created_at       DATETIME2(3) DEFAULT SYSDATETIME(),
        updated_at       DATETIME2(3) DEFAULT SYSDATETIME()
    );

    CREATE NONCLUSTERED INDEX idx_resident_vehicles_plate ON resident_vehicles (plate_number);
    CREATE NONCLUSTERED INDEX idx_resident_vehicles_apt ON resident_vehicles (apartment_number);
    CREATE NONCLUSTERED INDEX idx_resident_vehicles_status ON resident_vehicles (status);
END
GO


-- ==============================================================================
-- 3. BẢNG PARKING_SESSIONS (CORE: Lưu ảnh chụp xe vào, biển số, giờ vào / ra)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'parking_sessions')
BEGIN
    CREATE TABLE parking_sessions (
        id                   NVARCHAR(64) PRIMARY KEY,        -- Mã phiên gửi xe: 'PARK-20261022-XXXX'
        plate_number         NVARCHAR(20) NOT NULL,           -- Biển số nhận diện chuẩn hóa: '51F88234'
        plate_display        NVARCHAR(30) NOT NULL,           -- Biển số hiển thị: '51F-882.34'
        vehicle_type         NVARCHAR(30) DEFAULT 'car',      -- Loại xe: 'car', 'motorcycle'
        ticket_type          NVARCHAR(20) DEFAULT 'GUEST' CHECK (ticket_type IN ('RESIDENT', 'GUEST', 'STAFF')),
        status               NVARCHAR(20) NOT NULL DEFAULT 'PARKED' CHECK (status IN ('PARKED', 'COMPLETED', 'CANCELLED')),

        -- [LUỒNG XE ĐI VÀO BÃI XE CHUNG CƯ]
        entry_time           DATETIME2(3) NOT NULL,           -- Giờ xe vào bãi: 'YYYY-MM-DD HH:MM:SS'
        entry_camera_id      NVARCHAR(50) NULL,               -- ID Camera làn vào (FK -> cameras.id)
        entry_gate_name      NVARCHAR(100) DEFAULT N'Cổng Vào Làn 1',
        entry_snapshot_url   NVARCHAR(MAX) NOT NULL,          -- TẤM ẢNH CHỤP TOÀN CẢNH XE LÚC VÀO
        entry_plate_crop_url NVARCHAR(MAX) NULL,              -- Tấm ảnh crop cận cảnh biển số lúc vào
        entry_confidence     FLOAT DEFAULT 0.95,              -- Độ tin cậy nhận diện lúc vào (0.0 -> 1.0)

        -- [LUỒNG XE ĐI RA KHỎI BÃI XE CHUNG CƯ]
        exit_time            DATETIME2(3) NULL,               -- Giờ xe ra bãi (NULL khi đang đỗ)
        exit_camera_id       NVARCHAR(50) NULL,               -- ID Camera làn ra (FK -> cameras.id)
        exit_gate_name       NVARCHAR(100) NULL,              -- Tên cổng làn ra
        exit_snapshot_url    NVARCHAR(MAX) NULL,              -- TẤM ẢNH CHỤP TOÀN CẢNH XE LÚC RA
        exit_plate_crop_url  NVARCHAR(MAX) NULL,              -- Tấm ảnh crop cận cảnh biển số lúc ra
        exit_plate_number    NVARCHAR(20) NULL,               -- Biển số camera đọc được lúc ra
        is_plate_matched     BIT NULL,                        -- 1: Trùng khớp biển vào và ra | 0: Lệch biển

        -- [THÔNG TIN CĂN HỘ CƯ DÂN & CƯỚC PHÍ]
        resident_id          NVARCHAR(50) NULL,               -- Mã cư dân (FK -> resident_vehicles.id)
        apartment_number     NVARCHAR(50) NULL,               -- Số căn hộ (VD: N'A12.05')
        resident_name        NVARCHAR(100) NULL,              -- Họ tên cư dân
        duration_minutes     INT DEFAULT 0,                   -- Tổng thời gian gửi xe (phút)
        parking_fee          INT DEFAULT 0,                   -- Phí gửi xe (VNĐ - Cư dân = 0 VNĐ)
        payment_status       NVARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('PAID', 'FREE_RESIDENT', 'UNPAID')),
        notes                NVARCHAR(MAX) NULL,              -- Ghi chú sự cố / vận hành
        created_at           DATETIME2(3) DEFAULT SYSDATETIME(),
        updated_at           DATETIME2(3) DEFAULT SYSDATETIME(),

        CONSTRAINT fk_parking_entry_cam FOREIGN KEY (entry_camera_id) REFERENCES cameras (id) ON DELETE SET NULL,
        CONSTRAINT fk_parking_exit_cam  FOREIGN KEY (exit_camera_id)  REFERENCES cameras (id) ON DELETE SET NULL,
        CONSTRAINT fk_parking_resident  FOREIGN KEY (resident_id)     REFERENCES resident_vehicles (id) ON DELETE SET NULL
    );

    CREATE NONCLUSTERED INDEX idx_parking_sessions_status ON parking_sessions (status);
    CREATE NONCLUSTERED INDEX idx_parking_sessions_plate ON parking_sessions (plate_number);
    CREATE NONCLUSTERED INDEX idx_parking_sessions_entry ON parking_sessions (entry_time);
    CREATE NONCLUSTERED INDEX idx_parking_sessions_exit ON parking_sessions (exit_time);
    CREATE NONCLUSTERED INDEX idx_parking_sessions_ticket ON parking_sessions (ticket_type);
END
GO


-- ==============================================================================
-- 4. BẢNG PARKING_CAPTURES (Nhật ký ảnh chụp camera snapshot theo thời gian thực)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'parking_captures')
BEGIN
    CREATE TABLE parking_captures (
        id             NVARCHAR(64) PRIMARY KEY,              -- Mã sự kiện chụp ảnh (VD: 'CAP-IN-XXXX')
        session_id     NVARCHAR(64) NULL,                     -- Liên kết phiên gửi xe (FK -> parking_sessions.id)
        camera_id      NVARCHAR(50) NOT NULL,                 -- Mã camera chụp ảnh (FK -> cameras.id)
        capture_type   NVARCHAR(20) NOT NULL CHECK (capture_type IN ('ENTRY', 'EXIT', 'MANUAL', 'TRIGGER')),
        plate_number   NVARCHAR(20) NULL,                     -- Biển số nhận diện được
        snapshot_url   NVARCHAR(MAX) NOT NULL,                -- Đường dẫn lưu file ảnh toàn cảnh
        plate_crop_url NVARCHAR(MAX) NULL,                    -- Đường dẫn lưu file ảnh crop biển số
        confidence     FLOAT DEFAULT 0.95,
        captured_at    DATETIME2(3) DEFAULT SYSDATETIME(),

        CONSTRAINT fk_capture_session FOREIGN KEY (session_id) REFERENCES parking_sessions (id) ON DELETE CASCADE,
        CONSTRAINT fk_capture_camera  FOREIGN KEY (camera_id)  REFERENCES cameras (id) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX idx_parking_captures_session ON parking_captures (session_id);
    CREATE NONCLUSTERED INDEX idx_parking_captures_time ON parking_captures (captured_at);
END
GO


-- ==============================================================================
-- 5. BẢNG VIDEO_JOBS (Tác vụ video upload - Luồng tải video)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'video_jobs')
BEGIN
    CREATE TABLE video_jobs (
        id                    NVARCHAR(64) PRIMARY KEY,       -- Job ID: 'job-1718000000000'
        filename              NVARCHAR(255) NOT NULL,         -- Tên file video
        file_size_bytes       BIGINT NULL,                    -- Kích thước byte
        stage                 NVARCHAR(30) DEFAULT 'UPLOADED',
        stage_progress_pct    FLOAT DEFAULT 0.0,
        overall_progress_pct  FLOAT DEFAULT 0.0,
        total_frames          INT DEFAULT 0,
        processed_frames      INT DEFAULT 0,
        duration_seconds      FLOAT DEFAULT 0.0,
        current_fps           FLOAT DEFAULT 0.0,
        eta_seconds           FLOAT DEFAULT 0.0,
        detected_plates_count INT DEFAULT 0,
        video_url             NVARCHAR(MAX) NULL,
        processed_video_url   NVARCHAR(MAX) NULL,
        error_message         NVARCHAR(MAX) NULL,
        created_at            DATETIME2(3) DEFAULT SYSDATETIME(),
        completed_at          DATETIME2(3) NULL
    );

    CREATE NONCLUSTERED INDEX idx_video_jobs_stage ON video_jobs (stage);
    CREATE NONCLUSTERED INDEX idx_video_jobs_created ON video_jobs (created_at);
END
GO


-- ==============================================================================
-- 6. BẢNG PLATES (Bản ghi chi tiết biển số xe nhận diện từ video)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plates')
BEGIN
    CREATE TABLE plates (
        id               NVARCHAR(64) PRIMARY KEY,
        job_id           NVARCHAR(64) NULL,                   -- FK -> video_jobs.id
        job_filename     NVARCHAR(255) NULL,
        track_id         INT NULL,
        plate_number     NVARCHAR(20) NOT NULL,
        plate_display    NVARCHAR(30) NULL,
        province         NVARCHAR(100) NULL,
        plate_type       NVARCHAR(20) DEFAULT 'white',
        vehicle_type     NVARCHAR(30) DEFAULT 'car',
        confidence_score FLOAT NULL,
        quality_score    FLOAT NULL,
        crop_image_url   NVARCHAR(MAX) NULL,
        pts_ms           BIGINT NULL,
        video_time_str   NVARCHAR(20) NULL,
        timestamp        DATETIME2(3) DEFAULT SYSDATETIME(),
        speed_kmh        FLOAT NULL,
        video_url        NVARCHAR(MAX) NULL,

        CONSTRAINT fk_plate_job FOREIGN KEY (job_id) REFERENCES video_jobs (id) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX idx_plates_job_id ON plates (job_id);
    CREATE NONCLUSTERED INDEX idx_plates_plate_number ON plates (plate_number);
    CREATE NONCLUSTERED INDEX idx_plates_timestamp ON plates (timestamp);
END
GO
