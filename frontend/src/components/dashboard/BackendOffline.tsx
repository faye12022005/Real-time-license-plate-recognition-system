"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Thay thế nội dung Dashboard khi SSR không gọi được Backend.
 * Khác với Error Boundary ở đây: hiển thị đúng nguyên nhân + nút cứu cánh,
 * thay vì để giao diện trống với số 0 như thể "hệ thống không có dữ liệu".
 */
export function BackendOffline({ message }: { message?: string }) {
  const router = useRouter();

  return (
    <div className="bg-surface border border-border rounded-bento p-8 lg:p-12 shadow-bento text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
        <CloudOff className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <span className="inline-block px-2 py-0.5 rounded bg-surface-muted border border-border text-[11px] font-mono font-bold text-content-muted">
          BACKEND UNREACHABLE
        </span>
        <h2 className="font-heading font-black text-xl text-content-primary tracking-tight">
          Không thể kết nối Backend FastAPI
        </h2>
        <p className="text-xs text-content-muted leading-relaxed max-w-xl mx-auto">
          {message ??
            "Máy chủ (http://localhost:8000) không phản hồi. Bảng điều khiển tạm thời không hiển thị số liệu để tránh hiểu nhầm là hệ thống không có dữ liệu."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
        <button
          onClick={() => router.refresh()}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Thử lại</span>
        </button>
      </div>
    </div>
  );
}
