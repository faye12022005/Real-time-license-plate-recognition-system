import { API_BASE_URL } from "@/lib/api";

/**
 * Backend trả URL media dạng tương đối (`/static/captures/...`).
 * Trình duyệt đang chạy ở origin của Next.js nên phải trỏ về origin FastAPI,
 * nếu không ảnh crop/video sẽ bị 404.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return "";

  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api\/v1\/?$/i, "");
  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}
