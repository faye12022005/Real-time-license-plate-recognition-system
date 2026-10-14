"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw, Home, Sparkles } from "lucide-react";
import { setMockEnabled } from "@/lib/api";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled client error caught by error boundary:", error);
  }, [error]);

  const handleEnableMockAndRetry = () => {
    setMockEnabled(true);
    reset();
    window.location.reload();
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-bento p-8 max-w-lg w-full shadow-bento space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 flex items-center justify-center mx-auto shadow-inner">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-heading font-black text-xl text-content-primary tracking-tight">
            Đã xảy ra sự cố không mong muốn
          </h2>
          <p className="text-xs text-content-muted leading-relaxed">
            Hệ thống phát hiện lỗi trong quá trình xử lý hoặc nạp dữ liệu. Bạn có thể thử tải lại trang hoặc kích hoạt chế độ Dữ liệu mẫu.
          </p>
          {error.message && (
            <div className="mt-3 p-3 rounded-xl bg-surface-muted border border-border text-[11px] font-mono text-red-600 text-left break-words max-h-32 overflow-y-auto">
              {error.message}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Thử lại</span>
          </button>

          <button
            onClick={handleEnableMockAndRetry}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface-muted hover:bg-slate-200 text-content-primary text-xs font-semibold rounded-xl border border-border transition-all"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Chuyển sang Mock</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-surface-muted text-content-secondary text-xs font-semibold rounded-xl border border-border transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Trang chủ</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
