import React from "react";
import { Cpu } from "lucide-react";

/**
 * Trạng thái Loading dùng chung cho App Router (mỗi route có file loading.tsx riêng
 * để boundary reset đúng theo navigation — loading.tsx ở root không tự hiện khi
 * người dùng chuyển trang bằng client-side navigation).
 */
export function RouteLoading({
  text = "Đang khởi tạo giao diện phân tích ALPR...",
}: {
  text?: string;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-primary-light border border-primary-border text-primary flex items-center justify-center animate-pulse">
        <Cpu className="w-6 h-6 animate-spin text-primary" />
      </div>
      <p className="text-xs font-mono font-semibold text-content-muted">{text}</p>
    </div>
  );
}
