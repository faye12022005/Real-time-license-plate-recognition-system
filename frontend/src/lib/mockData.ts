import { DashboardKPIs, VideoJob, PlateRecord, PlateTraceSummary } from "@/types";

export const MOCK_KPIS: DashboardKPIs = {
  total_videos: 18,
  total_plates_detected: 342,
  unique_plates_count: 219,
  avg_accuracy_pct: 98.4,
};

export const MOCK_JOBS: VideoJob[] = [
  {
    id: "job-001",
    filename: "nga_tu_hang_xanh_peak_hour.mp4",
    file_size_bytes: 145000000,
    stage: "COMPLETED",
    stage_progress_pct: 100,
    overall_progress_pct: 100,
    total_frames: 4500,
    processed_frames: 4500,
    duration_seconds: 150,
    current_fps: 28,
    eta_seconds: 0,
    detected_plates_count: 86,
    video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    created_at: "2026-10-13T10:15:00Z",
    completed_at: "2026-10-13T10:17:40Z",
  },
  {
    id: "job-002",
    filename: "cau_sai_gon_lane_inbound.mp4",
    file_size_bytes: 98000000,
    stage: "COMPLETED",
    stage_progress_pct: 100,
    overall_progress_pct: 100,
    total_frames: 3200,
    processed_frames: 3200,
    duration_seconds: 106,
    current_fps: 29,
    eta_seconds: 0,
    detected_plates_count: 64,
    video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    created_at: "2026-10-13T14:20:00Z",
    completed_at: "2026-10-13T14:22:15Z",
  },
  {
    id: "job-003",
    filename: "cao_toc_long_thanh_km12.mp4",
    file_size_bytes: 230000000,
    stage: "PROCESSING",
    stage_progress_pct: 65,
    overall_progress_pct: 72,
    total_frames: 7200,
    processed_frames: 4680,
    duration_seconds: 240,
    current_fps: 26,
    eta_seconds: 96,
    detected_plates_count: 53,
    video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    created_at: "2026-10-14T00:10:00Z",
  },
];

export const MOCK_PLATES: PlateRecord[] = [
  {
    id: "rec-001",
    job_id: "job-001",
    job_filename: "nga_tu_hang_xanh_peak_hour.mp4",
    track_id: 101,
    plate_number: "51F88234",
    plate_display: "51F-882.34",
    province: "TP. Hồ Chí Minh",
    plate_type: "white",
    vehicle_type: "car",
    confidence_score: 0.98,
    quality_score: 0.95,
    crop_image_url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=360&q=80",
    pts_ms: 14200,
    video_time_str: "00:14",
    timestamp: "2026-10-13T10:15:14Z",
    speed_kmh: 42.0,
  },
  {
    id: "rec-002",
    job_id: "job-001",
    job_filename: "nga_tu_hang_xanh_peak_hour.mp4",
    track_id: 104,
    plate_number: "59P299811",
    plate_display: "59P2-998.11",
    province: "TP. Hồ Chí Minh",
    plate_type: "white",
    vehicle_type: "motorcycle",
    confidence_score: 0.95,
    quality_score: 0.91,
    crop_image_url: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=360&q=80",
    pts_ms: 28500,
    video_time_str: "00:28",
    timestamp: "2026-10-13T10:15:28Z",
    speed_kmh: 38.5,
  },
  {
    id: "rec-003",
    job_id: "job-001",
    job_filename: "nga_tu_hang_xanh_peak_hour.mp4",
    track_id: 109,
    plate_number: "29A12345",
    plate_display: "29A-123.45",
    province: "TP. Hà Nội",
    plate_type: "white",
    vehicle_type: "car",
    confidence_score: 0.99,
    quality_score: 0.97,
    crop_image_url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=360&q=80",
    pts_ms: 54100,
    video_time_str: "00:54",
    timestamp: "2026-10-13T10:15:54Z",
    speed_kmh: 45.2,
  },
  {
    id: "rec-004",
    job_id: "job-002",
    job_filename: "cau_sai_gon_lane_inbound.mp4",
    track_id: 205,
    plate_number: "51F88234",
    plate_display: "51F-882.34",
    province: "TP. Hồ Chí Minh",
    plate_type: "white",
    vehicle_type: "car",
    confidence_score: 0.97,
    quality_score: 0.93,
    crop_image_url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=360&q=80",
    pts_ms: 32000,
    video_time_str: "00:32",
    timestamp: "2026-10-13T14:20:32Z",
    speed_kmh: 58.0,
  },
  {
    id: "rec-005",
    job_id: "job-002",
    job_filename: "cau_sai_gon_lane_inbound.mp4",
    track_id: 211,
    plate_number: "43C67890",
    plate_display: "43C-678.90",
    province: "TP. Đà Nẵng",
    plate_type: "yellow",
    vehicle_type: "truck",
    confidence_score: 0.94,
    quality_score: 0.88,
    crop_image_url: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=360&q=80",
    pts_ms: 67400,
    video_time_str: "01:07",
    timestamp: "2026-10-13T14:21:07Z",
    speed_kmh: 51.5,
  },
  {
    id: "rec-006",
    job_id: "job-003",
    job_filename: "cao_toc_long_thanh_km12.mp4",
    track_id: 302,
    plate_number: "30H88888",
    plate_display: "30H-888.88",
    province: "TP. Hà Nội",
    plate_type: "white",
    vehicle_type: "car",
    confidence_score: 0.99,
    quality_score: 0.98,
    crop_image_url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=360&q=80",
    pts_ms: 45000,
    video_time_str: "00:45",
    timestamp: "2026-10-14T00:10:45Z",
    speed_kmh: 88.5,
  },
  {
    id: "rec-007",
    job_id: "job-003",
    job_filename: "cao_toc_long_thanh_km12.mp4",
    track_id: 308,
    plate_number: "51B55512",
    plate_display: "51B-555.12",
    province: "TP. Hồ Chí Minh",
    plate_type: "yellow",
    vehicle_type: "bus",
    confidence_score: 0.96,
    quality_score: 0.92,
    crop_image_url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=360&q=80",
    pts_ms: 82000,
    video_time_str: "01:22",
    timestamp: "2026-10-14T00:11:22Z",
    speed_kmh: 75.0,
  },
];

// Helper truy vết biển số xe
export function getPlateTrace(queryPlate: string): PlateTraceSummary[] {
  if (!queryPlate.trim()) return [];
  const normalizedQuery = queryPlate.toUpperCase().replace(/[-.]/g, "");

  // Nhóm theo biển số chuẩn hóa
  const grouped: Record<string, PlateRecord[]> = {};
  MOCK_PLATES.forEach((plate) => {
    if (
      plate.plate_number.includes(normalizedQuery) ||
      plate.plate_display.toUpperCase().includes(queryPlate.toUpperCase())
    ) {
      if (!grouped[plate.plate_number]) {
        grouped[plate.plate_number] = [];
      }
      grouped[plate.plate_number].push(plate);
    }
  });

  return Object.values(grouped).map((records) => {
    const sorted = [...records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const distinctVideos = new Set(records.map((r) => r.job_id)).size;

    return {
      plate_number: first.plate_number,
      plate_display: first.plate_display,
      province: first.province,
      vehicle_type: first.vehicle_type,
      plate_type: first.plate_type,
      total_detections: records.length,
      distinct_videos: distinctVideos,
      first_seen: first.timestamp,
      last_seen: last.timestamp,
      best_crop_image_url: first.crop_image_url,
      records: sorted,
    };
  });
}
