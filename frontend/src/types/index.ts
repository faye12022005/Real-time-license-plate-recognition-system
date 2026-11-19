// =========================================================================
// SMART ALPR 2.0 - DATA CONTRACTS & TYPES
// Chức năng: Upload Video -> Nhận diện Biển số (Database) -> Truy vết Biển số
// =========================================================================

export type VehicleType = "car" | "motorcycle" | "bus" | "truck";
export type PlateColor = "white" | "yellow" | "blue" | "red";

// 7 Trạng thái vòng đời của tác vụ xử lý video
export type JobStage =
  | "UPLOADED"
  | "TRANSCODING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

// Tác vụ Xử lý Video (Processing Job)
export interface VideoJob {
  id: string;
  filename: string;
  file_size_bytes: number;
  stage: JobStage;
  stage_progress_pct: number;   // 0 - 100%
  overall_progress_pct: number; // Chuyển mã 20% + Phân tích AI 80%
  total_frames: number;
  processed_frames: number;
  duration_seconds: number;
  current_fps: number;
  eta_seconds: number;
  detected_plates_count: number;
  video_url?: string;
  processed_video_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// Bản ghi nhận diện biển số xe (Lưu trong Database)
export interface PlateRecord {
  id: string;
  job_id: string;
  job_filename: string;
  track_id: number;
  plate_number: string;        // Biển số chuẩn hóa (VD: "51F88234")
  plate_display: string;       // Biển số hiển thị (VD: "51F-882.34")
  province: string;            // Tỉnh/Thành phố (VD: "TP. Hồ Chí Minh")
  plate_type: PlateColor;      // Màu biển ("white" | "yellow" | "blue" | "red")
  vehicle_type: VehicleType;   // Loại phương tiện
  confidence_score: number;    // Độ tin cậy OCR (0.0 -> 1.0)
  quality_score: number;       // Điểm chất lượng hình ảnh
  crop_image_url: string;      // URL ảnh crop biển số
  pts_ms: number;              // Mốc thời gian xuất hiện trong video (mili-giây)
  video_time_str: string;      // Định dạng phút:giây (VD: "01:24")
  timestamp: string;           // Thời điểm phát hiện (ISO 8601)
  speed_kmh?: number;          // Vận tốc ước tính (km/h)
  video_url?: string;          // URL video nguồn phát bằng chứng
}

// Bản ghi kết quả Truy vết Biển số (Vehicle Trace Profile)
export interface PlateTraceSummary {
  plate_number: string;
  plate_display: string;
  province: string;
  vehicle_type: VehicleType;
  plate_type: PlateColor;
  total_detections: number;    // Tổng số lần phát hiện
  distinct_videos: number;     // Số video khác nhau xuất hiện
  first_seen: string;          // Lần đầu nhìn thấy
  last_seen: string;           // Lần gần nhất nhìn thấy
  best_crop_image_url: string; // Ảnh crop rõ nét nhất
  records: PlateRecord[];      // Danh sách các mốc xuất hiện chi tiết
}

// KPI Thống kê Hệ thống
export interface DashboardKPIs {
  total_videos: number;
  total_plates_detected: number;
  unique_plates_count: number;
  avg_accuracy_pct: number;
}

// Trạng thái mục trong Hàng đợi Tải lên Đa tệp
export type QueueStatus =
  | "QUEUED"
  | "VALIDATING"
  | "UPLOADING"
  | "PROCESSING"
  | "COMPLETED"
  | "ERROR"
  | "CANCELLED";

// Bản ghi mục trong Hàng đợi Tải lên Đa tệp (Multi-file Upload Queue Item)
export interface UploadQueueItem {
  id: string;
  file: File;
  filename: string;
  fileSizeBytes: number;
  status: QueueStatus;
  uploadProgress: number;     // 0 - 100%
  overallProgress?: number;   // Tiến trình kép AI tổng thể (20% + 80%)
  jobId?: string;
  errorMessage?: string;
  currentFps?: number;
  etaSeconds?: number;
  detectedPlatesCount?: number;
  totalFrames?: number;
  processedFrames?: number;
  processedVideoUrl?: string;
  createdAt: string;
}

// =========================================================================
// QUẢN LÝ NHÀ XE CHUNG CƯ & LUỒNG KẾT NỐI CAMERA (Apartment Parking & Camera)
// =========================================================================

export type CameraType = "ENTRY" | "EXIT" | "TWO_WAY";
export type ParkingTicketType = "RESIDENT" | "GUEST" | "STAFF";
export type ParkingSessionStatus = "PARKED" | "COMPLETED" | "CANCELLED";

export interface ParkingCamera {
  id: string;
  name: string;
  camera_type: CameraType;
  rtsp_url: string;
  location: string;
  resolution: string;
  fps_limit: number;
  is_active: number;
  last_heartbeat?: string;
  created_at: string;
  updated_at: string;
}

/** Payload thêm mới / cập nhật camera (POST /parking/cameras). */
export interface CameraInput {
  id?: string;
  name: string;
  camera_type: CameraType;
  rtsp_url: string;
  location: string;
  resolution: string;
  fps_limit: number;
  is_active: number;
}

/** Kết quả kiểm tra tín hiệu camera (POST /parking/cameras/{id}/test). */
export interface CameraConnectionTest {
  camera_id: string;
  name: string;
  rtsp_url: string;
  connected: boolean;
  message: string;
}

export interface ResidentVehicle {
  id: string;
  plate_number: string;
  plate_display: string;
  owner_name: string;
  apartment_number: string;
  phone_number?: string;
  vehicle_type: VehicleType;
  rfid_card_id?: string;
  monthly_fee: number;
  registered_at: string;
  expiry_date: string;
  status: "ACTIVE" | "EXPIRED" | "LOCKED";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ParkingSession {
  id: string;
  plate_number: string;
  plate_display: string;
  vehicle_type: VehicleType;
  ticket_type: ParkingTicketType;
  status: ParkingSessionStatus;

  // Lượt vào (Entry)
  entry_time: string;
  entry_camera_id?: string;
  entry_gate_name: string;
  entry_snapshot_url: string;    // Tấm ảnh toàn cảnh xe lúc vào
  entry_plate_crop_url: string;   // Ảnh crop cận cảnh biển số
  entry_confidence: number;

  // Lượt ra (Exit)
  exit_time?: string;
  exit_camera_id?: string;
  exit_gate_name?: string;
  exit_snapshot_url?: string;     // Tấm ảnh toàn cảnh xe lúc ra
  exit_plate_crop_url?: string;   // Ảnh crop cận cảnh biển số lúc ra
  exit_plate_number?: string;
  is_plate_matched?: number;      // 1 = Trùng khớp, 0 = Lệch biển số

  // Cư dân & Cước phí
  resident_id?: string;
  apartment_number?: string;
  resident_name?: string;
  duration_minutes: number;
  parking_fee: number;
  payment_status: "PAID" | "FREE_RESIDENT" | "UNPAID";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ParkingDashboardStats {
  currently_parked: number;
  resident_parked: number;
  guest_parked: number;
  entries_today: number;
  exits_today: number;
  revenue_today_vnd: number;
  total_registered_residents: number;
  total_cameras: number;
  active_cameras: number;
  overstay_alert_days?: number;
  overstay_count?: number;
  overstay_sessions?: ParkingSession[];
  recent_sessions: ParkingSession[];
}

// =========================================================================
// HUẤN LUYỆN MÔ HÌNH AI (Model Training & Evaluation)
// =========================================================================

export interface TrainingState {
  is_training: boolean;
  status: "IDLE" | "STARTING" | "TRAINING" | "COMPLETED" | "FAILED";
  current_epoch: number;
  total_epochs: number;
  start_time?: string;
  last_error?: string;
}

export interface TrainingStatusResponse {
  model_available: boolean;
  model_path: string;
  model_size_mb: number;
  training_state: TrainingState;
  last_training_summary?: Record<string, any>;
}

export interface TrainingMetrics {
  mAP50?: number;
  mAP50_95?: number;
  precision?: number;
  recall?: number;
  fps?: number;
  device?: string;
  epochs_trained?: number;
  evaluation_time?: string;
  [key: string]: any;
}

export interface PrepareDatasetResponse {
  status: string;
  message: string;
  is_valid: boolean;
  statistics?: Record<string, any>;
}

export interface TrainRequestInput {
  model?: string;
  epochs?: number;
  batch_size?: number;
  img_size?: number;
  patience?: number;
}

// =========================================================================
// CẤU HÌNH HỆ THỐNG (System Settings)
// =========================================================================

export interface ParkingTariffSettings {
  motorcycle_day: number;
  motorcycle_night: number;
  car_first_2h: number;
  car_extra_hour: number;
  bicycle_day: number;
  bicycle_night: number;
  electric_day: number;
  electric_night: number;
}

export interface ParkingCapacitySettings {
  car: number;
  motorcycle: number;
}

export interface ParkingSettings {
  tariff: ParkingTariffSettings;
  day_start: string;
  night_start: string;
  grace_period_minutes: number;
  max_capacity: ParkingCapacitySettings;
}

export interface AISettings {
  auto_open_enabled: boolean;
  auto_open_min_confidence: number;
  barrier_open_seconds: number;
  min_confidence: number;
  plate_tolerance: number;
  evidence_mode: "crop" | "full" | "both";
}

export interface SecuritySettings {
  blacklist_plates: string[];
  mismatch_alert: boolean;
  vehicle_type_mismatch_alert: boolean;
  overstay_alert_days: number;
}

export interface StorageSettings {
  auto_cleanup_enabled: boolean;
  video_retention_days: number;
  crop_retention_days: number;
}

export interface BuildingSettings {
  name: string;
  hotline: string;
  shift_name: string;
}

export interface SystemSettings {
  parking: ParkingSettings;
  ai: AISettings;
  security: SecuritySettings;
  storage: StorageSettings;
  building: BuildingSettings;
}

export interface StorageFolderUsage {
  path: string;
  size_bytes: number;
  size_mb: number;
  file_count: number;
}

export interface StorageDiskUsage {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_percent: number;
}

export interface StorageUsage {
  folders: {
    captures: StorageFolderUsage;
    parking_captures: StorageFolderUsage;
    sample_videos: StorageFolderUsage;
  };
  total_size_bytes: number;
  total_size_mb: number;
  disk: StorageDiskUsage;
  settings_file: string;
}

export interface CleanupResult {
  status: string;
  message: string;
  deleted_files: number;
  freed_bytes: number;
  freed_mb: number;
  video_retention_days: number;
  crop_retention_days: number;
  details: Array<{
    label: string;
    deleted_files: number;
    freed_bytes: number;
  }>;
}

export interface DatabaseStatus {
  connected: boolean;
  engine?: string;
  host?: string;
  port?: number;
  database?: string;
  database_path?: string;
  user?: string;
  server_version?: string;
  latency_ms?: number;
  tables?: Record<string, number>;
  total_records?: number;
  message?: string;
  error?: string;
}
