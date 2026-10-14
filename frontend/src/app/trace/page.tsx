"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { alprApi } from "@/lib/api";
import { PlateRecord, PlateTraceSummary } from "@/types";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { VideoEvidenceModal } from "@/components/trace/VideoEvidenceModal";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Search,
  Compass,
  History,
  Calendar,
  Film,
  Play,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

function TraceContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [traceResults, setTraceResults] = useState<PlateTraceSummary[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<PlateTraceSummary | null>(null);
  const [selectedVideoRecord, setSelectedVideoRecord] = useState<PlateRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const performTrace = async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    const results = await alprApi.tracePlate(query.trim());
    setTraceResults(results);
    setSelectedSummary(results.length > 0 ? results[0] : null);
    setIsLoading(false);
  };

  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      performTrace(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performTrace(searchQuery);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight">
          Truy vết Biển số Xe (Forensic Plate Trace)
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Hệ thống rà soát toàn bộ video trong cơ sở dữ liệu để tái hiện lịch sử xuất hiện và hành trình của phương tiện
        </p>
      </div>

      {/* Search Input Bento Card */}
      <div className="bg-surface border border-border rounded-bento p-5 shadow-bento">
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nhập biển số cần truy vết (VD: 51F-882.34, 59P2*, 29A)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{isLoading ? "Đang quét..." : "Truy vết Ngay"}</span>
          </button>
        </form>
      </div>

      {/* Main Results Grid */}
      {traceResults.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Matched Vehicles List (4 Cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-content-muted">
              Phương tiện Khớp ({traceResults.length})
            </h3>

            <div className="space-y-2">
              {traceResults.map((item) => (
                <div
                  key={item.plate_number}
                  onClick={() => setSelectedSummary(item)}
                  className={`p-4 rounded-bento border cursor-pointer transition-all ${
                    selectedSummary?.plate_number === item.plate_number
                      ? "bg-primary-light/60 border-primary shadow-xs"
                      : "bg-surface border-border hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <PlateBadge display={item.plate_display} color={item.plate_type} />
                    <VehicleBadge type={item.vehicle_type} />
                  </div>

                  <div className="flex items-center justify-between text-xs text-content-muted mt-2 font-medium">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {item.province}
                    </span>
                    <span className="font-mono text-primary font-bold">
                      {item.total_detections} lần phát hiện
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detailed Vehicle Profile & Timeline (8 Cols) */}
          {selectedSummary && (
            <div className="lg:col-span-8 space-y-4">
              {/* Profile Card */}
              <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-12 rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shrink-0 shadow-2xs">
                      <Image
                        src={selectedSummary.best_crop_image_url}
                        alt={selectedSummary.plate_number}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <PlateBadge
                          display={selectedSummary.plate_display}
                          color={selectedSummary.plate_type}
                        />
                        <VehicleBadge type={selectedSummary.vehicle_type} />
                      </div>
                      <p className="text-xs text-content-muted mt-1 font-medium">
                        Đăng ký tại: <span className="font-semibold text-content-primary">{selectedSummary.province}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-center">
                    <div className="p-2.5 rounded-xl bg-surface-muted border border-border min-w-[90px]">
                      <p className="text-[10px] text-content-muted font-bold uppercase">Tổng lần thấy</p>
                      <p className="font-heading font-black text-lg text-primary mt-0.5">
                        {selectedSummary.total_detections}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-muted border border-border min-w-[90px]">
                      <p className="text-[10px] text-content-muted font-bold uppercase">Video xuất hiện</p>
                      <p className="font-heading font-black text-lg text-content-primary mt-0.5">
                        {selectedSummary.distinct_videos}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline History */}
                <div>
                  <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-content-muted mb-3 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-primary" />
                    Dòng thời gian Xuất hiện qua các Video
                  </h4>

                  <div className="space-y-3">
                    {selectedSummary.records.map((rec, idx) => (
                      <div
                        key={rec.id}
                        className="p-3.5 rounded-xl bg-surface-muted border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-content-primary flex items-center gap-1">
                                <Film className="w-3.5 h-3.5 text-content-muted" />
                                {rec.job_filename}
                              </span>
                              <span className="font-mono text-[11px] font-bold text-primary bg-primary-light px-2 py-0.5 rounded border border-primary-border">
                                {rec.video_time_str}
                              </span>
                            </div>

                            <p className="text-[11px] text-content-muted mt-0.5 font-mono">
                              Thời điểm: {new Date(rec.timestamp).toLocaleString("vi-VN")} • Tốc độ:{" "}
                              {rec.speed_kmh ? `${rec.speed_kmh} km/h` : "--"}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedVideoRecord(rec)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-2xs transition-all shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Xem lại Video</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Compass}
          title={
            searchQuery.trim()
              ? `Không tìm thấy phương tiện khớp với "${searchQuery}"`
              : "Chưa có Dữ liệu Truy vết Phương tiện"
          }
          description={
            searchQuery.trim()
              ? "Không có dữ liệu trong các video đã phân tích. Vui lòng thử tìm kiếm bằng ký tự đại diện wildcard (VD: 51F*, 59P2*)."
              : "Nhập biển số xe vào ô tìm kiếm phía trên để hệ thống quét lại hành trình và các mốc thời gian xuất hiện trong video."
          }
          secondaryActionText="Thử với Biển số Mẫu (51F-882.34)"
          onSecondaryAction={() => {
            setSearchQuery("51F88234");
            performTrace("51F88234");
          }}
        />
      )}

      {/* Video Evidence Modal */}
      <VideoEvidenceModal
        record={selectedVideoRecord}
        onClose={() => setSelectedVideoRecord(null)}
      />
    </div>
  );
}

export default function TracePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-content-muted">Đang tải trang truy vết...</div>}>
      <TraceContent />
    </Suspense>
  );
}
