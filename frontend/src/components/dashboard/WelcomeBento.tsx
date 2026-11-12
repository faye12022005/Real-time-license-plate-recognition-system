import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Upload, Search, ShieldCheck } from "lucide-react";

export function WelcomeBento() {
  return (
    <div className="bg-gradient-to-r from-blue-600 via-primary to-blue-700 text-white rounded-bento p-6 lg:p-7 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
      {/* Decorative Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

      <div className="relative z-10 space-y-2 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold border border-white/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Hệ thống Nhận diện & Truy vết Biển số 2.0</span>
        </div>

        <h1 className="font-heading font-black text-2xl lg:text-3xl tracking-tight text-white">
          Trung tâm Quản trị ALPR Bento Tech
        </h1>

        <p className="text-blue-100 text-xs lg:text-sm font-medium leading-relaxed">
          Tải lên video camera giao thông để tự động nhận diện tất cả biển số xe qua từng khung hình,
          lưu trữ dữ liệu vào cơ sở dữ liệu và truy vết lịch sử di chuyển phương tiện tức thì.
        </p>

        {/* Feature Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/20 text-white">
            YOLOv11 Detection
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/20 text-white">
            RapidOCR Recognition
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/20 text-white">
            Zero-Drop Batch Video
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="relative z-10 flex flex-row md:flex-col gap-2.5 shrink-0">
        <Link
          href="/upload"
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-primary font-bold px-4 py-2.5 rounded-xl text-xs shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Upload className="w-4 h-4" />
          <span>Tải lên Video mới</span>
        </Link>
        <Link
          href="/trace"
          className="flex items-center justify-center gap-2 bg-blue-800/60 hover:bg-blue-800 text-white border border-white/20 font-bold px-4 py-2.5 rounded-xl text-xs transition-all hover:scale-[1.02]"
        >
          <Search className="w-4 h-4" />
          <span>Truy vết Biển số</span>
        </Link>
      </div>
    </div>
  );
}
