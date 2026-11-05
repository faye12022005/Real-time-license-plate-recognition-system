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
} from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
      "Không kết nối được Backend FastAPI (http://localhost:8000). Hãy khởi chạy backend rồi thử lại."
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
  (response) => response,
  (error) => {
    if (typeof window !== "undefined") {
      const isNetworkError =
        !error.response ||
        error.code === "ERR_NETWORK" ||
        error.code === "ECONNABORTED" ||
        error.message?.includes("Network Error");

      window.dispatchEvent(
        new CustomEvent("alpr_api_error", {
          detail: {
            message: isNetworkError
              ? "Không thể kết nối đến máy chủ Backend FastAPI (http://localhost:8000). Vui lòng kiểm tra backend đã khởi chạy chưa."
              : error.response?.data?.detail || error.message || "Lỗi giao tiếp máy chủ",
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
      throw new Error(err.message || "Lỗi kết nối mạng khi tải lên video");
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
    const res = await apiClient.post("/parking/check-in", payload);
    return res.data;
  },

  // 11. Ghi nhận xe vào bãi kèm chụp/tải ảnh
  checkInVehicleWithImage: async (formData: FormData): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-in/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
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
    const res = await apiClient.post("/parking/check-out", payload);
    return res.data;
  },

  // 13. Ghi nhận xe ra bãi kèm chụp/tải ảnh
  checkOutVehicleWithImage: async (formData: FormData): Promise<{ status: string; message: string; data: ParkingSession }> => {
    const res = await apiClient.post("/parking/check-out/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
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
      `/parking/cameras/${encodeURIComponent(cameraId)}/test`
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
};
