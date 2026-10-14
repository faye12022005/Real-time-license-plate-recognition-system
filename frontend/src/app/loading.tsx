import React from "react";
import { Cpu } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-primary-light border border-primary-border text-primary flex items-center justify-center animate-pulse">
        <Cpu className="w-6 h-6 animate-spin text-primary" />
      </div>
      <p className="text-xs font-mono font-semibold text-content-muted">
        Đang khởi tạo giao diện phân tích ALPR...
      </p>
    </div>
  );
}
