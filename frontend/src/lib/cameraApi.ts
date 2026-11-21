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
  source_raw?: string;
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
  sessions?: CameraSession[];
  active_sources?: string[];
}

export interface CameraDevice {
  id?: string;
  index: number | string;
  source?: string;
  name?: string;
  type?: "local" | "http" | "rtsp";
  width: number;
  height: number;
  fps: number;
  available: boolean;
  previewing: boolean;
  in_use: boolean;
  is_configured?: boolean;
}

export interface CameraDiscoveryResponse {
  devices: CameraDevice[];
  configured_cameras?: CameraDevice[];
  os_names: string[];
  scanned_at: string;
  max_index: number;
  cached?: boolean;
  ai_in_use?: number | null;
}

export interface CameraPreviewSession {
  index: number;
  status: string;
  width: number;
  height: number;
  fps: number;
  viewers: number;
  error: string | null;
}

export interface StartCameraPayload {
  source?: string;
  sources?: string[];
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

export interface TestStreamResult {
  ok: boolean;
  connected: boolean;
  width: number;
  height: number;
  fps: number;
  message: string;
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
): Promise<{ session: CameraSession; sessions?: CameraSession[] }> {
  const response = await fetch(`${CAMERA_BASE}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await parseResponse<{ session: CameraSession; sessions?: CameraSession[] }>(
    response
  );
  return data;
}

export async function syncActiveCameras(
  payload: StartCameraPayload,
): Promise<{ session: CameraSession | null; sessions: CameraSession[]; active_sources: string[] }> {
  const response = await fetch(`${CAMERA_BASE}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{
    session: CameraSession | null;
    sessions: CameraSession[];
    active_sources: string[];
  }>(response);
}

export async function updateLiveCameraConfig(
  payload: Partial<StartCameraPayload>,
): Promise<{ ok: boolean; updated_sessions: number }> {
  const response = await fetch(`${CAMERA_BASE}/update-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ ok: boolean; updated_sessions: number }>(response);
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

export async function discoverCameras(
  refresh = false,
  maxIndex = 6,
): Promise<CameraDiscoveryResponse> {
  const params = new URLSearchParams({ max_index: String(maxIndex) });
  if (refresh) params.set("refresh", "true");
  const response = await fetch(`${CAMERA_BASE}/discover?${params}`, {
    cache: "no-store",
  });
  return parseResponse<CameraDiscoveryResponse>(response);
}

export async function testCameraStream(
  url: string,
  timeoutSeconds = 6,
): Promise<TestStreamResult> {
  const response = await fetch(`${CAMERA_BASE}/test-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, timeout_seconds: timeoutSeconds }),
  });
  return parseResponse<TestStreamResult>(response);
}

export async function getConfiguredCameras(): Promise<CameraDevice[]> {
  const response = await fetch(`${CAMERA_BASE}/configured`, { cache: "no-store" });
  const data = await parseResponse<{ cameras: any[] }>(response);
  return (data.cameras || []).map((c) => ({
    id: c.id,
    index: c.id,
    source: c.source || c.rtsp_url,
    name: c.name,
    type: (c.source || "").toLowerCase().startsWith("http") ? "http" : "rtsp",
    width: parseInt((c.resolution || "0x0").split("x")[0], 10) || 0,
    height: parseInt((c.resolution || "0x0").split("x")[1], 10) || 0,
    fps: c.fps_limit || 25,
    available: true,
    previewing: false,
    in_use: false,
    is_configured: true,
  }));
}

export async function addConfiguredCamera(payload: {
  name: string;
  source: string;
  camera_type?: string;
  location?: string;
}): Promise<any> {
  const response = await fetch(`${CAMERA_BASE}/configured`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<any>(response);
}

export async function deleteConfiguredCamera(id: string): Promise<boolean> {
  const response = await fetch(`${CAMERA_BASE}/configured/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await parseResponse<{ ok: boolean }>(response);
  return Boolean(data.ok);
}

export async function startCameraPreviews(
  indices: number[],
  options?: { maxFps?: number; jpegQuality?: number },
): Promise<CameraPreviewSession[]> {
  const response = await fetch(`${CAMERA_BASE}/previews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      indices,
      max_fps: options?.maxFps ?? 8,
      jpeg_quality: options?.jpegQuality ?? 75,
    }),
  });
  const data = await parseResponse<{ previews: CameraPreviewSession[] }>(response);
  return data.previews;
}

export async function stopCameraPreviews(
  indices?: number[] | null,
  options?: { keepalive?: boolean },
): Promise<number[]> {
  const response = await fetch(`${CAMERA_BASE}/previews/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ indices: indices ?? null }),
    keepalive: options?.keepalive ?? false,
  });
  const data = await parseResponse<{ stopped: number[] }>(response);
  return data.stopped;
}

export function cameraPreviewStreamUrl(index: number | string): string {
  return `${CAMERA_BASE}/previews/${index}/stream`;
}

export function cameraPreviewSnapshotUrl(index: number | string): string {
  return `${CAMERA_BASE}/previews/${index}/snapshot`;
}

export function cameraStreamUrl(sourceOrSessionId?: string): string {
  if (!sourceOrSessionId) return `${CAMERA_BASE}/stream`;
  if (sourceOrSessionId.startsWith("cam-")) {
    return `${CAMERA_BASE}/stream?session_id=${encodeURIComponent(sourceOrSessionId)}`;
  }
  return `${CAMERA_BASE}/stream?source=${encodeURIComponent(sourceOrSessionId)}`;
}

export function mediaUrl(path?: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export { API_ORIGIN };
