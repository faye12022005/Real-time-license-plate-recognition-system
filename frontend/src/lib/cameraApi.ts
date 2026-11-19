const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:8000";
const CAMERA_BASE = `${API_ORIGIN}/api/cameras`;

export interface CameraPlateRecord {
  id: string;
  job_id: string;
  job_filename: string;
  track_id: number;
  plate_number: string;
  plate_display: string;
  province: string;
  plate_type: string;
  vehicle_type: string;
  confidence_score: number;
  quality_score: number;
  crop_image_url: string;
  pts_ms: number;
  video_time_str: string;
  timestamp: string;
  video_url?: string;
  votes: number;
  source: string;
}

export interface CameraSession {
  id: string;
  source: string;
  label: string;
  status: "starting" | "running" | "stopping" | "stopped" | "completed" | "failed";
  error: string | null;
  started_at: string;
  finished_at: string | null;
  elapsed_seconds: number;
  processed_frames: number;
  fps: number;
  record_count: number;
  output_dir: string;
  records: CameraPlateRecord[];
}

export interface CameraStatusResponse {
  active: boolean;
  session: CameraSession | null;
}

export interface StartCameraPayload {
  source: string;
  camera_name?: string;
  min_votes?: number;
  max_frames?: number | null;
  duration_seconds?: number | null;
  reconnect_attempts?: number;
  save_db?: boolean;
  save_video?: boolean;
  stream_max_fps?: number;
  ocr_mode?: "hybrid" | "easyocr" | "char";
  stride?: number;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String(body.detail)
        : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export async function startCamera(
  payload: StartCameraPayload,
): Promise<CameraSession> {
  const response = await fetch(`${CAMERA_BASE}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ session: CameraSession }>(response);
  return data.session;
}

export async function stopCamera(sessionId?: string): Promise<CameraSession | null> {
  const query = sessionId
    ? `?session_id=${encodeURIComponent(sessionId)}`
    : "";
  const response = await fetch(`${CAMERA_BASE}/stop${query}`, {
    method: "POST",
  });
  const data = await parseResponse<{ session: CameraSession | null }>(response);
  return data.session;
}

export async function getCameraStatus(): Promise<CameraStatusResponse> {
  const response = await fetch(`${CAMERA_BASE}/status`, { cache: "no-store" });
  return parseResponse<CameraStatusResponse>(response);
}

export function cameraStreamUrl(sessionId?: string): string {
  return `${CAMERA_BASE}/stream${sessionId ? `?session_id=${sessionId}` : ""}`;
}

export function mediaUrl(path?: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export { API_ORIGIN };
