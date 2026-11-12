"use client";

import React, { useRef, useEffect } from "react";
import { PlateRecord } from "@/types";
import { X, Film, MapPin, RotateCcw } from "lucide-react";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";

interface VideoEvidenceModalProps {
  record: PlateRecord | null;
  onClose: () => void;
}

export function VideoEvidenceModal({ record, onClose }: VideoEvidenceModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Đóng modal khi bấm phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const targetSeconds = Math.max(0, (record.pts_ms || 0) / 1000);
  const videoSrc =
    record.video_url ||
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

  const handleSeekToEvent = () => {
    if (videoRef.current) {
      // Pre-roll 1 giây trước khi xe xuất hiện để dễ quan sát hành trình
      videoRef.current.currentTime = Math.max(0, targetSeconds - 1);
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-bento max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-content-primary">
                Xem lại Video Bằng chứng Phương tiện
              </h3>
              <p className="text-[11px] text-content-muted font-mono">
                {record.job_filename} • Mốc thời gian: {record.video_time_str}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player with dynamic source and Auto-Seek to Event */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center group">
          <video
            ref={videoRef}
            controls
            autoPlay
            muted
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            src={videoSrc}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                // Tự động tua đến trước mốc sự kiện 1 giây
                videoRef.current.currentTime = Math.max(0, targetSeconds - 1);
              }
            }}
          />

          {/* Time & Plate HUD Overlay */}
          <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-white flex items-center gap-2.5 pointer-events-none">
            <PlateBadge display={record.plate_display} color={record.plate_type} />
            <div className="text-[11px] font-mono leading-tight">
              <p className="text-emerald-400 font-bold">XUẤT HIỆN @ {record.video_time_str}</p>
              <p className="text-slate-300">{(record.confidence_score * 100).toFixed(0)}% MATCH</p>
            </div>
          </div>

          {/* Quick Seek to Event Button */}
          <button
            onClick={handleSeekToEvent}
            className="absolute top-3 right-3 bg-primary/90 hover:bg-primary text-white text-[11px] font-semibold font-mono px-2.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all hover:scale-105"
            title="Tua về đúng khoảnh khắc xe xuất hiện"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Tua mốc {record.video_time_str}</span>
          </button>
        </div>

        {/* Record Metadata Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-2.5 rounded-xl bg-surface-muted border border-border">
            <span className="text-[10px] text-content-muted font-bold uppercase">Phương tiện</span>
            <div className="mt-1">
              <VehicleBadge type={record.vehicle_type} />
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-muted border border-border">
            <span className="text-[10px] text-content-muted font-bold uppercase">Địa phương</span>
            <p className="font-semibold text-content-primary mt-1 flex items-center gap-1 text-[11px]">
              <MapPin className="w-3 h-3 text-content-muted" />
              {record.province}
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-muted border border-border">
            <span className="text-[10px] text-content-muted font-bold uppercase">Mốc Video PTS</span>
            <p className="font-mono font-bold text-primary mt-1 text-[11px]">
              {record.pts_ms} ms ({record.video_time_str})
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-muted border border-border">
            <span className="text-[10px] text-content-muted font-bold uppercase">Tốc độ ước tính</span>
            <p className="font-mono font-semibold text-content-primary mt-1 text-[11px]">
              {record.speed_kmh ? `${record.speed_kmh} km/h` : "--"}
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-content-primary rounded-xl text-xs font-semibold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
