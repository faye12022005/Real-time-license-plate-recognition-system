"use client";

import React, { useState, useEffect, useRef } from "react";
import { VideoJob, PlateRecord } from "@/types";
import { alprApi } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import {
  X,
  Play,
  Film,
  Sparkles,
  Clock,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

interface ProcessedVideoModalProps {
  job: VideoJob | null;
  onClose: () => void;
}

export function ProcessedVideoModal({ job, onClose }: ProcessedVideoModalProps) {
  const [plates, setPlates] = useState<PlateRecord[]>([]);
  const [loadingPlates, setLoadingPlates] = useState(false);
  const [activeSource, setActiveSource] = useState<"processed" | "raw">("processed");
  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Đóng modal khi bấm phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Tải danh sách biển số phát hiện trong video này
  useEffect(() => {
    if (!job?.id) return;
    setLoadingPlates(true);
    alprApi
      .getPlates({ job_id: job.id })
      .then((data) => {
        setPlates(data);
        if (data.length > 0) setSelectedPlateId(data[0].id);
      })
      .catch(() => setPlates([]))
      .finally(() => setLoadingPlates(false));

    // Mặc định chọn processed nếu có, ngược lại chọn raw
    if (job.processed_video_url) {
      setActiveSource("processed");
    } else {
      setActiveSource("raw");
    }
  }, [job]);

  if (!job) return null;

  const rawVideoUrl = resolveMediaUrl(job.video_url);
  const processedVideoUrl = resolveMediaUrl(job.processed_video_url);

  // Chọn nguồn phát theo tab đang chọn, nếu tab processed mà không có URL thì fallback về raw
  const currentVideoSrc =
    activeSource === "processed" && processedVideoUrl
      ? processedVideoUrl
      : rawVideoUrl;

  // Lọc biển số theo từ khóa tìm kiếm
  const filteredPlates = plates.filter(
    (p) =>
      p.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.plate_display.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.province && p.province.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Tua video đến thời điểm xe xuất hiện
  const handleSeekToPlate = (plate: PlateRecord) => {
    setSelectedPlateId(plate.id);
    if (videoRef.current) {
      const targetSec = Math.max(0, (plate.pts_ms || 0) / 1000 - 0.5);
      videoRef.current.currentTime = targetSec;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-surface border border-border rounded-2xl max-w-6xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-base text-content-primary truncate">
                  {job.filename}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    job.stage === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {job.stage === "COMPLETED" ? "ĐÃ XỬ LÝ XONG" : "ĐANG QUÉT"}
                </span>
              </div>
              <p className="text-xs text-content-muted font-mono mt-0.5">
                Mã tác vụ: {job.id} • Phát hiện:{" "}
                <span className="font-bold text-primary">{job.detected_plates_count} biển số</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentVideoSrc && (
              <a
                href={currentVideoSrc}
                download
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors"
                title="Tải video này về máy"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Video</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nội dung chính: 2 cột (Video Player bên trái, Danh sách biển số bên phải) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto flex-1">
          {/* Cột 1: Video Player (8 cols trên màn hình lớn) */}
          <div className="lg:col-span-8 p-6 flex flex-col space-y-4 border-b lg:border-b-0 lg:border-r border-border bg-slate-950/5">
            {/* Thanh chuyển đổi chế độ xem video (Switch Tabs) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex p-1 rounded-xl bg-surface-muted border border-border text-xs font-semibold">
                <button
                  onClick={() => setActiveSource("processed")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    activeSource === "processed"
                      ? "bg-primary text-white shadow-xs"
                      : "text-content-muted hover:text-content-primary"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Video Nhận Diện AI (Có Khung & Biển)</span>
                </button>
                <button
                  onClick={() => setActiveSource("raw")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    activeSource === "raw"
                      ? "bg-surface text-content-primary shadow-xs border border-border"
                      : "text-content-muted hover:text-content-primary"
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Video Gốc</span>
                </button>
              </div>

              {activeSource === "processed" && !processedVideoUrl && (
                <span className="text-[11px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  Video AI đang kết xuất, đang phát video gốc
                </span>
              )}
            </div>

            {/* Khung phát Video HTML5 */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-inner group">
              {currentVideoSrc ? (
                <video
                  ref={videoRef}
                  key={currentVideoSrc}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                  src={currentVideoSrc}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-slate-600" />
                  <p className="text-xs font-semibold">Chưa có luồng video để phát</p>
                </div>
              )}

              {/* Tag góc hiển thị chế độ */}
              <div className="absolute top-3 left-3 pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-slate-950/80 backdrop-blur-md text-white border border-slate-700">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      activeSource === "processed" ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
                    }`}
                  />
                  {activeSource === "processed" ? "CHẾ ĐỘ: NHẬN DIỆN AI" : "CHẾ ĐỘ: VIDEO GỐC"}
                </span>
              </div>
            </div>

            {/* Hướng dẫn thao tác nhanh */}
            <div className="text-xs text-content-muted flex items-center justify-between px-1">
              <span>
                💡 <b>Mẹo:</b> Nhấp vào bất kỳ biển số xe ở danh sách bên phải để video tự động nhảy đến đúng giây xe xuất hiện.
              </span>
            </div>
          </div>

          {/* Cột 2: Danh sách biển số nhận diện theo dòng thời gian (4 cols) */}
          <div className="lg:col-span-4 p-5 flex flex-col h-full overflow-hidden bg-surface">
            {/* Header danh sách & Tìm kiếm */}
            <div className="space-y-3 pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-bold text-sm text-content-primary flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Biển Số Phát Hiện</span>
                </h4>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-content-secondary border border-border">
                  {plates.length} xe
                </span>
              </div>

              {/* Ô tìm kiếm biển số */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="text"
                  placeholder="Tìm biển số, tỉnh thành..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface-muted/50 focus:bg-surface focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Danh sách thẻ biển số cuộn được */}
            <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-2.5">
              {loadingPlates ? (
                <div className="py-12 text-center text-content-muted text-xs">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Đang nạp danh sách biển số...
                </div>
              ) : filteredPlates.length > 0 ? (
                filteredPlates.map((plate) => {
                  const isSelected = selectedPlateId === plate.id;
                  const cropUrl = resolveMediaUrl(plate.crop_image_url);

                  return (
                    <div
                      key={plate.id}
                      onClick={() => handleSeekToPlate(plate)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                          : "bg-surface hover:bg-surface-muted/60 border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Ảnh crop biển số */}
                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-slate-100 border border-border shrink-0 flex items-center justify-center">
                          {cropUrl ? (
                            <img
                              src={cropUrl}
                              alt={plate.plate_number}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <Film className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        {/* Thông tin biển số & Loại xe */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <PlateBadge
                              display={plate.plate_display || plate.plate_number}
                              color={plate.plate_type}
                            />
                            <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-primary shrink-0">
                              <Clock className="w-3 h-3 text-content-muted" />
                              {plate.video_time_str || "00:00"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-content-muted">
                            <span className="truncate">{plate.province || "Việt Nam"}</span>
                            <span className="font-mono font-semibold text-emerald-600">
                              {(plate.confidence_score * 100).toFixed(0)}% Match
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-content-muted text-xs px-4">
                  <Film className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold">Chưa tìm thấy biển số nào</p>
                  <p className="text-[11px] mt-1">
                    {searchQuery
                      ? "Không có kết quả khớp với từ khóa tìm kiếm."
                      : "Video này chưa phát hiện biển số hợp lệ nào."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

