"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { alprApi } from "@/lib/api";
import { VideoJob } from "@/types";
import { VideoUploadZone } from "@/components/upload/VideoUploadZone";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProcessedVideoModal } from "@/components/video/ProcessedVideoModal";
import { useRealtimeEvent } from "@/lib/useRealtime";
import { Film, FileVideo, RotateCcw, Play, Sparkles, ExternalLink } from "lucide-react";

export default function UploadPage() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedJobForVideo, setSelectedJobForVideo] = useState<VideoJob | null>(null);

  const fetchJobs = () => {
    setIsRefreshing(true);
    alprApi.getJobs().then(setJobs).finally(() => setIsRefreshing(false));
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleJobUpdated = (jobId: string, updates: Partial<VideoJob>) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, ...updates } : job))
    );
  };

  // Đồng bộ thời gian thực khi có tiến trình cập nhật từ Backend AI
  useRealtimeEvent<{ job_id: string; [key: string]: any }>("video_job_updated", (update) => {
    if (!update || !update.job_id) return;
    setJobs((prev) =>
      prev.map((j) => (j.id === update.job_id ? { ...j, ...update } : j))
    );
  });

  useRealtimeEvent<VideoJob>("video_job_created", (newJob) => {
    if (!newJob || !newJob.id) return;
    setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight">
          Upload & Xử lý
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Tải lên video camera giao thông để hệ thống tự động bóc tách tất cả biển số xe và nạp vào cơ sở dữ liệu
        </p>
      </div>

      {/* Multi-file Upload Queue Zone */}
      <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-3">
        <div>
          <h3 className="font-heading font-bold text-sm text-content-primary">
            Hàng đợi Tải lên Nhiều Video Bất đồng bộ
          </h3>
          <p className="text-xs text-content-muted">
            Kéo thả một hoặc nhiều tệp video cùng lúc. Hệ thống tự động kiểm tra lỗi và xếp hàng đợi xử lý tuần tự.
          </p>
        </div>
        <VideoUploadZone
          onJobCreated={(newJob) => setJobs((prev) => [newJob, ...prev])}
          onJobUpdated={handleJobUpdated}
          onOpenVideoModal={(job) => setSelectedJobForVideo(job)}
        />
      </div>

      {/* Jobs History Table Bento Card */}
      <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div>
            <h3 className="font-heading font-bold text-sm text-content-primary">
              Lịch sử Tác vụ Phân tích Video
            </h3>
            <p className="text-[11px] text-content-muted">
              Danh sách video đã được AI quét và nhận diện biển số
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchJobs}
              className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
              title="Làm mới lịch sử"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </button>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-muted text-content-secondary border border-border">
              {jobs.length} tác vụ
            </span>
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold text-content-muted uppercase bg-surface-muted/60">
                  <th className="py-3 px-4">Tên Tệp Video</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4">Tiến Độ Kép</th>
                  <th className="py-3 px-4">Biển Số Nhận Diện</th>
                  <th className="py-3 px-4">Thời Gian</th>
                  <th className="py-3 px-4 text-right">Tốc Độ AI</th>
                  <th className="py-3 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-content-primary">
                      <button
                        onClick={() => setSelectedJobForVideo(job)}
                        className="flex items-center gap-2 text-left hover:text-primary transition-colors group"
                        title="Bấm để xem video này"
                      >
                        <FileVideo className="w-4 h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="truncate max-w-[200px] underline-offset-2 group-hover:underline">
                          {job.filename}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${job.stage === "COMPLETED"
                            ? "bg-emerald-50 text-status-success border-emerald-200"
                            : "bg-blue-50 text-primary border-blue-200"
                          }`}
                      >
                        {job.stage === "COMPLETED" ? "HOÀN TẤT" : "ĐANG XỬ LÝ"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-content-muted">
                          <span>{job.processed_frames}/{job.total_frames} frames</span>
                          <span>{job.overall_progress_pct}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${job.stage === "COMPLETED" ? "bg-status-success" : "bg-primary"
                              }`}
                            style={{ width: `${job.overall_progress_pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-primary font-mono text-sm">
                      {job.detected_plates_count} biển số
                    </td>
                    <td className="py-3 px-4 text-content-muted font-mono text-[11px]">
                      {new Date(job.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-content-secondary">
                      {job.current_fps} FPS
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedJobForVideo(job)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white hover:bg-primary-hover text-[11px] font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-95"
                          title="Mở trình phát xem video đã nhận diện AI"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Xem Video AI</span>
                        </button>
                        <Link
                          href={`/plates?job_id=${job.id}`}
                          className="inline-flex items-center p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors border border-border"
                          title="Xem toàn bộ biển số đã bóc tách"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Film}
            title="Chưa có Tác vụ Phân tích Video nào"
            description="Hàng đợi xử lý hiện đang trống. Hãy chọn hoặc kéo thả tệp video ở khung trên để khởi chạy quá trình quét nhận diện."
          />
        )}
      </div>

      {/* Modal Phát Video Đã Xử Lý AI */}
      <ProcessedVideoModal
        job={selectedJobForVideo}
        onClose={() => setSelectedJobForVideo(null)}
      />
    </div>
  );
}
