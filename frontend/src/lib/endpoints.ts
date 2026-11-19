// One base URL for REST, media and WebSocket connections.
const configuredApi = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
  .trim().replace(/\/+$/, "");
export const API_BASE_URL = configuredApi.endsWith("/api/v1")
  ? configuredApi
  : `${configuredApi}/api/v1`;
export const BACKEND_ORIGIN = new URL(API_BASE_URL).origin;

export function websocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const url = new URL(configured || `${API_BASE_URL}/ws`);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/ws") ? pathname : `${pathname}/ws`;
  return url.toString();
}
