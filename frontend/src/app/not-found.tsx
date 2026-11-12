import React from "react";
import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-bento p-8 max-w-md w-full shadow-bento space-y-5 text-center animate-in fade-in zoom-in-95 duration-150">
        <div className="w-16 h-16 rounded-2xl bg-primary-light text-primary border border-primary-border flex items-center justify-center mx-auto shadow-sm">
          <Compass className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-content-muted border border-border">
            404 NOT FOUND
          </span>
          <h2 className="font-heading font-black text-xl text-content-primary tracking-tight mt-2">
            Không tìm thấy trang yêu cầu
          </h2>
          <p className="text-xs text-content-muted leading-relaxed">
            Đường dẫn bạn truy cập có thể đã bị di chuyển, xóa hoặc không tồn tại trong hệ thống Smart ALPR.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
          >
            <Home className="w-4 h-4" />
            <span>Quay về Bảng điều khiển Bento</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
