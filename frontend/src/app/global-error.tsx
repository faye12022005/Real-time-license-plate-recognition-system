"use client";

import React from "react";

/**
 * Lỗi ở mức CAO NHẤT — xảy ra trong Root Layout (import CSS, metadata, Sidebar...)
 * hoặc khi error.tsx tự gặp sự cố. File này thay thế TOÀN BỘ layout nên:
 * - không được dùng Tailwind/globals.css (chưa được nạp) → style trực tiếp;
 * - phải tự render lại <html> và <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: "32px 28px",
              maxWidth: 480,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                borderRadius: 16,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              !
            </div>

            <h1 style={{ fontSize: 20, margin: "0 0 8px", fontWeight: 800 }}>
              Hệ thống gặp lỗi nghiêm trọng
            </h1>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: "#475569", margin: 0 }}>
              Giao diện không thể khởi tạo (lỗi ở tầng Root Layout). Hãy thử tải lại trang; nếu
              lỗi tiếp diễn, hãy khởi động lại server <code>npm run dev</code> hoặc kiểm tra
              console của trình duyệt.
            </p>

            {error.digest && (
              <p
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: "#94a3b8",
                  margin: "12px 0 0",
                }}
              >
                Mã sự cố (digest): {error.digest}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                marginTop: 24,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => reset()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Thử lại
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#0f172a",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
