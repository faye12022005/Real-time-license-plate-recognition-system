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
  createdAt: string;
}
