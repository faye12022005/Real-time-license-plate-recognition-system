import axios, { type AxiosError } from "axios";
import { DashboardKPIs, VideoJob, PlateRecord, PlateTraceSummary } from "@/types";
import { MOCK_KPIS, MOCK_JOBS, MOCK_PLATES, getPlateTrace } from "./mockData";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/** Cờ Mock lưu ở COOKIE để Server Component đọc được (localStorage chỉ tồn tại ở client). */
const MOCK_COOKIE = "alpr_use_mock";
const MOCK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 năm

/**
 * Người dùng có bật "Xem trước Dữ liệu Mẫu" không?
 *
 * - CLIENT: đọc COOKIE trước (cùng nguồn với SSR) → localStorage (tương thích ngược) → env.
 * - SERVER: không có localStorage, cũng không tự đọc cookie của trình duyệt tại đây.
 *   RSC phải dùng `next/headers` (xem `getMockFlagFromCookie()` ở src/app/page.tsx)
 *   rồi truyền vào API qua `ApiCallOptions.mock`.
 */
export function isMockEnabled(): boolean {
  if (typeof document !== "undefined") {
    const matched = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${MOCK_COOKIE}=(true|false)(?:;|$)`)
    );
    if (matched) return matched[1] === "true";
    const saved = localStorage.getItem(MOCK_COOKIE);
    if (saved !== null) return saved === "true";
  }
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}

export function setMockEnabled(enabled: boolean) {
  const value = enabled ? "true" : "false";
  if (typeof document !== "undefined") {
    // Cookie: SSR đọc được ngay ở lần request kế tiếp — không còn phụ thuộc localStorage.
    document.cookie = `${MOCK_COOKIE}=${value};path=/;max-age=${MOCK_COOKIE_MAX_AGE};samesite=lax`;
    localStorage.setItem(MOCK_COOKIE, value);
    window.dispatchEvent(new Event("alpr_mock_mode_changed"));
  }
}

/**
 * Tùy chọn cho API gọi từ Server Component (RSC).
 * RSC không có localStorage nên KHÔNG THỂ tự quyết định cờ mock — bắt buộc truyền vào.
 */
export interface ApiCallOptions {
  /** Kết quả của `getMockFlagFromCookie()`; bỏ trống = tự đọc theo môi trường hiện tại. */
  mock?: boolean;
}

function shouldUseMock(opts?: ApiCallOptions): boolean {
  return opts?.mock ?? isMockEnabled();
}

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
      "Không kết nối được Backend FastAPI (http://localhost:8000). Hãy khởi chạy backend hoặc bật Chế độ Dữ liệu Mẫu ở Sidebar."
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
              ? "Không thể kết nối đến máy chủ Backend FastAPI (http://localhost:8000). Vui lòng khởi chạy backend hoặc bật Chế độ Dữ liệu mẫu ở sidebar."
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
  getKPIs: async (opts?: ApiCallOptions): Promise<DashboardKPIs> => {
    if (shouldUseMock(opts)) return MOCK_KPIS;
    try {
      const res = await apiClient.get<DashboardKPIs>("/analytics/kpis");
      return normalizeKpis(res.data);
    } catch (err) {
      return failOrEmpty(err, EMPTY_KPIS);
    }
  },

  // 2. Danh sách tác vụ Video
  getJobs: async (opts?: ApiCallOptions): Promise<VideoJob[]> => {
    if (shouldUseMock(opts)) return MOCK_JOBS;
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
    const newJobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (shouldUseMock()) {
      // Giả lập tiến trình upload trong mock mode
      if (onProgress) {
        onProgress(30);
        await new Promise((r) => setTimeout(r, 200));
        onProgress(70);
        await new Promise((r) => setTimeout(r, 200));
        onProgress(100);
      }
      return { job_id: newJobId };
    }

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
  getJobById: async (jobId: string, opts?: ApiCallOptions): Promise<VideoJob | undefined> => {
    if (shouldUseMock(opts)) {
      return MOCK_JOBS.find((j) => j.id === jobId);
    }
    try {
      const res = await apiClient.get<VideoJob>(`/videos/jobs/${jobId}`);
      return res.data;
    } catch (err) {
      return failOrEmpty<VideoJob | undefined>(err, undefined);
    }
  },

  // 5. Lấy danh sách biển số xe đã lưu trong Database
  getPlates: async (
    params?: {
      q?: string;
      vehicle_type?: string;
      job_id?: string;
    },
    opts?: ApiCallOptions
  ): Promise<PlateRecord[]> => {
    if (shouldUseMock(opts)) {
      let filtered = [...MOCK_PLATES];
      if (params?.q) {
        const q = params.q;
        const query = q.toUpperCase().replace(/[-.]/g, "");
        filtered = filtered.filter(
          (p) =>
            p.plate_number.includes(query) ||
            p.plate_display.toUpperCase().includes(q.toUpperCase())
        );
      }
      if (params?.vehicle_type && params.vehicle_type !== "all") {
        filtered = filtered.filter((p) => p.vehicle_type === params.vehicle_type);
      }
      if (params?.job_id) {
        filtered = filtered.filter((p) => p.job_id === params.job_id);
      }
      return filtered;
    }
    try {
      const res = await apiClient.get<PlateRecord[]>("/plates/records", { params });
      return sanitizeArray<PlateRecord>(res.data);
    } catch (err) {
      return failOrEmpty<PlateRecord[]>(err, []);
    }
  },

  // 6. Truy vết biển số xe (Plate Trace)
  tracePlate: async (plateNumber: string, opts?: ApiCallOptions): Promise<PlateTraceSummary[]> => {
    if (shouldUseMock(opts)) {
      return getPlateTrace(plateNumber);
    }
    try {
      const res = await apiClient.get<PlateTraceSummary[]>("/plates/trace", {
        params: { plate: plateNumber },
      });
      return sanitizeArray<PlateTraceSummary>(res.data);
    } catch (err) {
      return failOrEmpty<PlateTraceSummary[]>(err, []);
    }
  },
};
