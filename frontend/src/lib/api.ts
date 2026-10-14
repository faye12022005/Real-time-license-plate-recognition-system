import axios from "axios";
import { DashboardKPIs, VideoJob, PlateRecord, PlateTraceSummary } from "@/types";
import { MOCK_KPIS, MOCK_JOBS, MOCK_PLATES, getPlateTrace } from "./mockData";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Kiểm tra xem người dùng có chủ động bật xem MockData không (Mặc định: FALSE để xem Giao diện Trống)
export function isMockEnabled(): boolean {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("alpr_use_mock");
    if (saved !== null) return saved === "true";
  }
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}

export function setMockEnabled(enabled: boolean) {
  if (typeof window !== "undefined") {
    localStorage.setItem("alpr_use_mock", enabled ? "true" : "false");
    window.dispatchEvent(new Event("alpr_mock_mode_changed"));
  }
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

export const alprApi = {
  // 1. Thống kê Dashboard KPI
  getKPIs: async (): Promise<DashboardKPIs> => {
    if (isMockEnabled()) return MOCK_KPIS;
    try {
      const res = await apiClient.get<DashboardKPIs>("/analytics/kpis");
      return res.data;
    } catch {
      return EMPTY_KPIS;
    }
  },

  // 2. Danh sách tác vụ Video
  getJobs: async (): Promise<VideoJob[]> => {
    if (isMockEnabled()) return MOCK_JOBS;
    try {
      const res = await apiClient.get<VideoJob[]>("/videos/jobs");
      return res.data;
    } catch {
      return [];
    }
  },

  // 3. Tải lên video mới với theo dõi tiến trình và hủy yêu cầu
  uploadVideo: async (
    file: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<{ job_id: string }> => {
    const newJobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    if (isMockEnabled()) {
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
      }
      if (err.response?.status === 422) {
        throw new Error("Định dạng tệp không được máy chủ hỗ trợ hoặc tệp video bị lỗi giải mã");
      }
      if (err.response?.status === 507) {
        throw new Error("Ổ đĩa lưu trữ máy chủ không đủ dung lượng xử lý");
      }
      if (err.code === "ECONNABORTED") {
        throw new Error("Hết thời gian chờ phản hồi từ máy chủ (Timeout)");
      }
      throw new Error(err.message || "Lỗi kết nối mạng khi tải lên video");
    }
  },

  // 4. Lấy chi tiết tác vụ
  getJobById: async (jobId: string): Promise<VideoJob | undefined> => {
    if (isMockEnabled()) {
      return MOCK_JOBS.find((j) => j.id === jobId);
    }
    try {
      const res = await apiClient.get<VideoJob>(`/videos/jobs/${jobId}`);
      return res.data;
    } catch {
      return undefined;
    }
  },

  // 5. Lấy danh sách biển số xe đã lưu trong Database
  getPlates: async (params?: {
    q?: string;
    vehicle_type?: string;
    job_id?: string;
  }): Promise<PlateRecord[]> => {
    if (isMockEnabled()) {
      let filtered = [...MOCK_PLATES];
      if (params?.q) {
        const query = params.q.toUpperCase().replace(/[-.]/g, "");
        filtered = filtered.filter(
          (p) =>
            p.plate_number.includes(query) ||
            p.plate_display.toUpperCase().includes(params.q!.toUpperCase())
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
      return res.data;
    } catch {
      return [];
    }
  },

  // 6. Truy vết biển số xe (Plate Trace)
  tracePlate: async (plateNumber: string): Promise<PlateTraceSummary[]> => {
    if (isMockEnabled()) {
      return getPlateTrace(plateNumber);
    }
    try {
      const res = await apiClient.get<PlateTraceSummary[]>("/plates/trace", {
        params: { plate: plateNumber },
      });
      return res.data;
    } catch {
      return [];
    }
  },
};
