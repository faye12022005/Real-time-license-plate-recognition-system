import axios, { type AxiosError } from "axios";
import {
  DashboardKPIs,
  VideoJob,
  PlateRecord,
  PlateTraceSummary,
  ParkingCamera,
  CameraInput,
  CameraConnectionTest,
  ResidentVehicle,
  ParkingSession,
  ParkingDashboardStats,
  TrainingStatusResponse,
  TrainingMetrics,
  PrepareDatasetResponse,
  TrainRequestInput,
  SystemSettings,
  StorageUsage,
  CleanupResult,
  DatabaseStatus,
} from "@/types";

import { API_BASE_URL } from "@/lib/endpoints";
export { API_BASE_URL } from "@/lib/endpoints";

/** Không gọi được Backend: chưa chạy / CORS / timeout / HTTP 5xx. */
export class BackendUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnreachableError";
  }
}

function isConnectionFailure(err: unknown): boolean {
  const e = err as AxiosError | undefined;
  if (!e?.response) return true; // backend chưa chạy / CORS / DNS
  if (e.code === "ECONNABORTED") return true; // timeout 10s
  return e.response.status >= 500; // lỗi phía máy chủ
}

/**
 * Xử lý lỗi API tập trung (thay cho `catch {}` nuốt mọi lỗi):
 * - CLIENT: interceptor đã dispatch "alpr_api_error" → NetworkStatusBanner hiển thị
 *   → trả dữ liệu rỗng, UI giữ Empty State (không sập trang).
 * - SERVER (SSR): không có banner để báo → lỗi kết nối PHẢI ném ra để page.tsx bắt được,
 *   tránh hiển thị số 0 như thể "hệ thống không có dữ liệu".
 */
function failOrEmpty<T>(err: unknown, fallback: T): T {
  if (typeof window === "undefined" && isConnectionFailure(err)) {
    throw new BackendUnreachableError(
      `Không kết nối được Backend FastAPI (${API_BASE_URL}). Hãy khởi chạy backend rồi thử lại.`
    );
  }
  return fallback;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor: Gửi Bearer JWT nếu có
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor: Bắt và thông báo lỗi mạng, sập server hoặc CORS toàn cục
apiClient.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("alpr_api_connected"));
    }
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    if (typeof window !== "undefined") {
      const isNetworkError =
        !error.response ||
        error.code === "ERR_NETWORK" ||
        error.code === "ECONNABORTED" ||
        error.message?.includes("Network Error");

      const detail = error.response?.data?.detail;
      const message = typeof detail === "string" ? detail
        : Array.isArray(detail) ? detail.map((item: { msg?: string }) => item.msg).join("; ")
        : error.message || "Lỗi giao tiếp máy chủ";
      window.dispatchEvent(
        new CustomEvent("alpr_api_error", {
          detail: {
            message: isNetworkError
              ? `Không thể kết nối đến Backend FastAPI (${API_BASE_URL}). Vui lòng kiểm tra backend đã khởi chạy chưa.`
              : message,
            status: error.response?.status,
            isNetworkError,
          },
        })
      );
    } else {
      // SSR: không có UI để hiện banner → log để chẩn đoán khi trang server render thất bại
      console.error("[ALPR API] Request thất bại khi SSR:", error?.message || error);
    }
    return Promise.reject(error);
  }
);

// Trạng thái trống mặc định (Empty Initial States)
const EMPTY_KPIS: DashboardKPIs = {
  total_videos: 0,
  total_plates_detected: 0,
  unique_plates_count: 0,
  avg_accuracy_pct: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Chốt kiểu dữ liệu KPI trước khi truyền vào component.
 * Backend thiếu trường / trả sai kiểu → thay bằng giá trị mặc định, không để `undefined` lên UI.
 */
function normalizeKpis(raw: unknown): DashboardKPIs {
  const r = isRecord(raw) ? raw : {};
  return {
    total_videos: toFiniteNumber(r.total_videos),
    total_plates_detected: toFiniteNumber(r.total_plates_detected),
    unique_plates_count: toFiniteNumber(r.unique_plates_count),
    avg_accuracy_pct: toFiniteNumber(r.avg_accuracy_pct),
  };
}

/** Chỉ nhận mảng phần tử object — loại bỏ null/primitive làm sập lúc render. */
function sanitizeArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw.filter((item) => isRecord(item)) as T[]) : [];
}

export const alprApi = {
  getHealth: async (): Promise<{ status: string }> => {
    const res = await apiClient.get("/health");
    return res.data;
  },
  // 1. Thống kê Dashboard KPI
  getKPIs: async (): Promise<DashboardKPIs> => {
    try {
      const res = await apiClient.get<DashboardKPIs>("/analytics/kpis");
      return normalizeKpis(res.data);
    } catch (err) {
      return failOrEmpty(err, EMPTY_KPIS);
    }
  },

  // 2. Danh sách tác vụ Video
  getJobs: async (): Promise<VideoJob[]> => {
    try {
      const res = await apiClient.get<VideoJob[]>("/videos/jobs");
      return sanitizeArray<VideoJob>(res.data);
    } catch (err) {
      return failOrEmpty<VideoJob[]>(err, []);
    }
  },

  // 3. Tải lên video mới với theo dõi tiến trình và hủy yêu cầu
  uploadVideo: async (
    file: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<{ job_id: string }> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiClient.post<{ job_id: string }>("/videos/upload", formData, {
        params: { save_db: true },
        timeout: 0, // Large uploads are cancelled explicitly with AbortSignal.
        headers: { "Content-Type": "multipart/form-data" },
        signal,
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(pct);
          }
        },
      });
      return res.data;
    } catch (err: any) {
      if (axios.isCancel(err) || err.name === "AbortError" || err.name === "CanceledError") {
        throw new Error("Tác vụ tải lên đã bị hủy");
      }
      if (err.response?.status === 413) {
        throw new Error("Dung lượng tệp vượt quá giới hạn 1GB của máy chủ (413 Payload Too Large)");
      } else if (err.response?.status === 422) {
        throw new Error("Định dạng tệp không được máy chủ hỗ trợ hoặc tệp video bị lỗi giải mã");
      } else if (err.response?.status === 507) {
        throw new Error("Ổ đĩa lưu trữ máy chủ không đủ dung lượng xử lý");
      } else if (err.code === "ECONNABORTED") {
        throw new Error("Hết thời gian chờ phản hồi từ máy chủ (Timeout)");
      }
      throw new Error(err.response?.data?.detail || err.message || "Lỗi kết nối mạng khi tải lên video");
    }
  },

  // 4. Lấy chi tiết tác vụ
  getJobById: async (jobId: string): Promise<VideoJob | undefined> => {
    try {
      const res = await apiClient.get<VideoJob>(`/videos/jobs/${jobId}`);
      return res.data;
    } catch (err) {
      return failOrEmpty<VideoJob | undefined>(err, undefined);
    }
  },

  // 4.1 Xóa một tác vụ video và toàn bộ dữ liệu biển số / tệp liên quan
  deleteJob: async (jobId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await apiClient.delete<{ status: string; deleted: boolean }>(`/videos/jobs/${jobId}`);
      return { success: res.data?.deleted ?? true };
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || err.message || "Lỗi khi xóa tác vụ video");
    }
  },

  // 4.2 Xóa hàng loạt tác vụ video
  deleteJobs: async (jobIds: string[]): Promise<{ deleted_count: number; requested_count: number }> => {
    try {
      const res = await apiClient.post<{ deleted_count: number; requested_count: number }>(
        "/videos/jobs/delete",
        { job_ids: jobIds }
      );
      return res.data;
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || err.message || "Lỗi khi xóa hàng loạt video");
    }
  },

  // 5. Lấy danh sách biển số xe đã lưu trong Database
  getPlates: async (params?: {
    q?: string;
    vehicle_type?: string;
    job_id?: string;
  }): Promise<PlateRecord[]> => {
    try {
      const res = await apiClient.get<PlateRecord[]>("/plates/records", { params });
      return sanitizeArray<PlateRecord>(res.data);
    } catch (err) {
      return failOrEmpty<PlateRecord[]>(err, []);
    }
  },

  // 5.1 Xóa một bản ghi biển số xe theo ID
  deletePlate: async (plateId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await apiClient.delete<{ status: string; deleted: boolean }>(`/plates/records/${plateId}`);
      return { success: res.data?.deleted ?? true };
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || err.message || "Lỗi khi xóa biển số xe");
    }
  },

  // 5.2 Xóa hàng loạt bản ghi biển số xe theo danh sách ID
  deletePlates: async (plateIds: string[]): Promise<{ deleted_count: number; requested_count: number }> => {
    try {
      const res = await apiClient.post<{ deleted_count: number; requested_count: number }>(
        "/plates/records/delete",
        { plate_ids: plateIds }
      );
      return res.data;
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || err.message || "Lỗi khi xóa hàng loạt biển số xe");
    }
  },

  // 5.3 Bắn thử nghiệm sự kiện nhận diện biển số thời gian thực (Live simulation & animation test)
  simulatePlate: async (): Promise<{ status: string; plate: PlateRecord }> => {
    try {
      const res = await apiClient.post<{ status: string; plate: PlateRecord }>("/plates/simulate");
      return res.data;
    } catch (err: any) {
      throw new Error(err.response?.data?.detail || err.message || "Lỗi khi kích hoạt nhận diện thử nghiệm");
    }
  },

  // 6. Truy vết biển số xe (Plate Trace)
  tracePlate: async (plateNumber: string): Promise<PlateTraceSummary[]> => {
    try {
      const res = await apiClient.get<PlateTraceSummary[]>("/plates/trace", {
        params: { plate: plateNumber },
      });
      return sanitizeArray<PlateTraceSummary>(res.data);
    } catch (err) {
      return failOrEmpty<PlateTraceSummary[]>(err, []);
    }
  },

  // 7. Thống kê bãi xe chung cư
  getParkingStats: async (): Promise<ParkingDashboardStats | undefined> => {
    try {
      const res = await apiClient.get<ParkingDashboardStats>("/parking/stats");
      return res.data;
    } catch (err) {
      return failOrEmpty<ParkingDashboardStats | undefined>(err, undefined);
    }
  },

  // 8. Lấy danh sách lượt xe vào/ra bãi chung cư
  getParkingSessions: async (params?: {
    status?: string;
    plate?: string;
    ticket_type?: string;
    apartment?: string;
    limit?: number;
  }): Promise<ParkingSession[]> => {
    try {
      const res = await apiClient.get<ParkingSession[]>("/parking/sessions", { params });
      return sanitizeArray<ParkingSession>(res.data);
    } catch (err) {
      return failOrEmpty<ParkingSession[]>(err, []);
    }
  },

  // 9. Lấy chi tiết phiên gửi xe (ảnh vào vs ảnh ra)
  getParkingSessionById: async (sessionId: string): Promise<ParkingSession | undefined> => {
    try {
      const res = await apiClient.get<ParkingSession>(`/parking/sessions/${sessionId}`);
      return res.data;
    } catch (err) {
      return failOrEmpty<ParkingSession | undefined>(err, undefined);
    }
  },

  // 10. Ghi nhận xe vào bãi (Check-in trigger hoặc nhập biển)
  checkInVehicle: async (payload: {
    camera_id?: string;
    plate_number?: string;
    vehicle_type?: string;
    notes?: string;
  }): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-in", payload, { timeout: 120000 });
    return res.data;
  },

  // 11. Ghi nhận xe vào bãi kèm chụp/tải ảnh
  checkInVehicleWithImage: async (formData: FormData): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-in/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return res.data;
  },

  // 12. Ghi nhận xe ra bãi (Check-out trigger hoặc đối soát biển)
  checkOutVehicle: async (payload: {
    camera_id?: string;
    plate_number?: string;
    session_id?: string;
    notes?: string;
  }): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-out", payload, { timeout: 120000 });
    return res.data;
  },

  // 13. Ghi nhận xe ra bãi kèm chụp/tải ảnh
  checkOutVehicleWithImage: async (formData: FormData): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-out/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return res.data;
  },

  // 14. Danh sách Camera làn xe
  getParkingCameras: async (): Promise<ParkingCamera[]> => {
    try {
      const res = await apiClient.get<ParkingCamera[]>("/parking/cameras");
      return sanitizeArray<ParkingCamera>(res.data);
    } catch (err) {
      return failOrEmpty<ParkingCamera[]>(err, []);
    }
  },

  // 15. Thêm mới / cập nhật Camera (RTSP hoặc Webcam)
  createOrUpdateCamera: async (payload: CameraInput): Promise<ParkingCamera> => {
    const res = await apiClient.post<ParkingCamera>("/parking/cameras", payload);
    return res.data;
  },

  // 16. Xóa cấu hình Camera
  deleteCamera: async (cameraId: string): Promise<{ status: string; message: string }> => {
    const res = await apiClient.delete<{ status: string; message: string }>(
      `/parking/cameras/${encodeURIComponent(cameraId)}`
    );
    return res.data;
  },

  // 17. Kiểm tra tín hiệu kết nối thực tế tới Camera
  testCameraConnection: async (cameraId: string): Promise<CameraConnectionTest> => {
    const res = await apiClient.post<CameraConnectionTest>(
      `/parking/cameras/${encodeURIComponent(cameraId)}/test`, null, { timeout: 60000 }
    );
    return res.data;
  },

  // 18. Danh sách xe cư dân đăng ký
  getResidents: async (params?: { q?: string; apartment?: string; status?: string }): Promise<ResidentVehicle[]> => {
    try {
      const res = await apiClient.get<ResidentVehicle[]>("/parking/residents", { params });
      return sanitizeArray<ResidentVehicle>(res.data);
    } catch (err) {
      return failOrEmpty<ResidentVehicle[]>(err, []);
    }
  },

  // 19. Đăng ký mới hoặc cập nhật xe cư dân
  registerResident: async (payload: Partial<ResidentVehicle>): Promise<ResidentVehicle> => {
    const res = await apiClient.post<ResidentVehicle>("/parking/residents", payload);
    return res.data;
  },

  // 20. Xóa xe cư dân khỏi hệ thống
  deleteResident: async (residentId: string): Promise<{ status: string; message: string }> => {
    const res = await apiClient.delete<{ status: string; message: string }>(
      `/parking/residents/${encodeURIComponent(residentId)}`
    );
    return res.data;
  },

  // 21. Lấy trạng thái mô hình AI và tiến trình huấn luyện
  getTrainingStatus: async (): Promise<TrainingStatusResponse> => {
    const res = await apiClient.get<TrainingStatusResponse>("/training/status");
    return res.data;
  },

  // 22. Khởi chạy huấn luyện mô hình YOLO phát hiện biển số xe
  startTraining: async (payload: TrainRequestInput): Promise<{ status: string; message: string; config: any }> => {
    const res = await apiClient.post("/training/start", payload);
    return res.data;
  },

  // 23. Chuẩn bị dataset Kaggle sang YOLO format
  prepareDataset: async (valRatio: number = 0.2): Promise<PrepareDatasetResponse> => {
    const res = await apiClient.post<PrepareDatasetResponse>("/training/prepare-dataset", null, {
      params: { val_ratio: valRatio },
    });
    return res.data;
  },

  // 24. Lấy chỉ số đánh giá mô hình (mAP50, Precision, Recall, FPS)
  getTrainingMetrics: async (): Promise<TrainingMetrics | undefined> => {
    try {
      const res = await apiClient.get<TrainingMetrics>("/training/metrics");
      return res.data;
    } catch (err) {
      return undefined;
    }
  },

  // 25. Lấy cấu hình hệ thống (bãi xe, AI, an ninh, lưu trữ, tòa nhà)
  getSettings: async (): Promise<SystemSettings> => {
    const res = await apiClient.get<SystemSettings>("/settings");
    return res.data;
  },

  // 26. Lưu cấu hình hệ thống
  updateSettings: async (settings: SystemSettings): Promise<SystemSettings> => {
    const res = await apiClient.put<SystemSettings>("/settings", settings);
    return res.data;
  },

  // 27. Lấy dung lượng các thư mục media và ổ đĩa
  getStorageUsage: async (): Promise<StorageUsage> => {
    const res = await apiClient.get<StorageUsage>("/settings/storage");
    return res.data;
  },

  // 28. Dọn dẹp file cũ theo thời hạn lưu trữ
  cleanupStorage: async (settings?: SystemSettings): Promise<CleanupResult> => {
    const res = await apiClient.post<CleanupResult>("/settings/cleanup", settings ?? null);
    return res.data;
  },

  // 29. Kiểm tra trạng thái database
  getDatabaseStatus: async (): Promise<DatabaseStatus> => {
    const res = await apiClient.get<DatabaseStatus>("/settings/database/status");
    return res.data;
  },

  // 30. Tải file backup .sql của database
  downloadDatabaseBackup: async (): Promise<Blob> => {
    try {
      const res = await apiClient.get("/settings/database/backup", {
        responseType: "blob",
        timeout: 120000,
      });
      return res.data as Blob;
    } catch (err) {
      // Lỗi từ backend khi responseType=blob trả về Blob JSON, cần đọc để lấy detail.
      const error = err as AxiosError;
      let message = error.message || "Sao lưu database thất bại.";
      const data = error.response?.data as unknown;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.detail) message = String(parsed.detail);
        } catch {
          // Giữ nguyên thông báo gốc nếu không đọc được blob.
        }
      }
      throw new Error(message);
    }
  },
};
