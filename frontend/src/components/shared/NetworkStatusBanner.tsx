"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, X, Sparkles, RefreshCw } from "lucide-react";
import { setMockEnabled } from "@/lib/api";

interface ApiErrorDetail {
  message: string;
  status?: number;
  isNetworkError?: boolean;
}

export function NetworkStatusBanner() {
  const [errorInfo, setErrorInfo] = useState<ApiErrorDetail | null>(null);

  useEffect(() => {
    const handleApiError = (e: Event) => {
      const customEvent = e as CustomEvent<ApiErrorDetail>;
      if (customEvent.detail) {
        setErrorInfo(customEvent.detail);
      }
    };

    window.addEventListener("alpr_api_error", handleApiError);
    return () => window.removeEventListener("alpr_api_error", handleApiError);
  }, []);

  if (!errorInfo) return null;

  const handleEnableMock = () => {
    setMockEnabled(true);
    window.location.reload();
  };

  return (
    <div className="mb-6 p-4 rounded-bento bg-amber-500/10 border border-amber-500/30 text-content-primary shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
      <div className="flex items-start sm:items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-amber-700">
            Cảnh báo kết nối máy chủ API
          </h4>
          <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">
            {errorInfo.message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <button
          onClick={handleEnableMock}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Bật Dữ liệu mẫu</span>
        </button>
        <button
          onClick={() => setErrorInfo(null)}
          className="p-1.5 text-content-muted hover:text-content-primary hover:bg-slate-200/60 rounded-lg transition-colors"
          title="Đóng thông báo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
