"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { alprApi } from "@/lib/api";
import { VideoJob } from "@/types";
import { VideoUploadZone } from "@/components/upload/VideoUploadZone";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProcessedVideoModal } from "@/components/video/ProcessedVideoModal";
import { useRealtimeEvent } from "@/lib/useRealtime";
import {
  Film,
  FileVideo,
  RotateCcw,
  Play,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckSquare,
  Square,
  X,
} from "lucide-react";

export default function UploadPage() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedJobForVideo, setSelectedJobForVideo] = useState<VideoJob | null>(null);

  // Quản lý xóa 1 video
  const [jobToDelete, setJobToDelete] = useState<VideoJob | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Quản lý chọn và xóa nhiều video (Bulk Delete)
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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

  useRealtimeEvent<{ job_id: string }>("video_job_deleted", ({ job_id }) => {
    if (!job_id) return;
    setJobs((prev) => prev.filter((j) => j.id !== job_id));
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      next.delete(job_id);
      return next;
    });
  });

  // Xóa 1 video
  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await alprApi.deleteJob(jobToDelete.id);
      setJobs((prev) => prev.filter((j) => j.id !== jobToDelete.id));
      setSelectedJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobToDelete.id);
        return next;
      });
      setJobToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "Không thể xóa video. Vui lòng thử lại.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Chọn / Bỏ chọn 1 item
  const toggleSelectJob = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  // Chọn tất cả / Bỏ chọn tất cả
  const toggleSelectAll = () => {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map((j) => j.id)));
    }
  };

  // Xóa hàng loạt các video đã chọn
  const handleBulkDelete = async () => {
    if (selectedJobIds.size === 0) return;
    setIsBulkDeleting(true);
    setDeleteError(null);

    try {
      const idsArray = Array.from(selectedJobIds);
      await alprApi.deleteJobs(idsArray);
      setJobs((prev) => prev.filter((j) => !selectedJobIds.has(j.id)));
      setSelectedJobIds(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (err: any) {
      setDeleteError(err.message || "Lỗi khi xóa hàng loạt video");
    } finally {
      setIsBulkDeleting(false);
    }
  };

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
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/80">
          <div>
            <h3 className="font-heading font-bold text-sm text-content-primary">
              Lịch sử Tác vụ Phân tích Video
            </h3>
            <p className="text-[11px] text-content-muted">
              Danh sách video đã được AI quét và nhận diện biển số
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Nút Xóa các mục đã chọn */}
            {selectedJobIds.size > 0 && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-semibold transition-colors animate-in fade-in"
                title="Xóa tất cả các video đang được chọn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa {selectedJobIds.size} video đã chọn</span>
              </button>
            )}

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
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      onClick={toggleSelectAll}
                      className="text-content-muted hover:text-content-primary transition-colors"
                      title={selectedJobIds.size === jobs.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    >
                      {selectedJobIds.size === jobs.length && jobs.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
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
                {jobs.map((job) => {
                  const isSelected = selectedJobIds.has(job.id);

                  return (
                    <tr
                      key={job.id}
                      className={`transition-colors ${
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-surface-muted/50"
                      }`}
                    >
                      {/* Checkbox chọn hàng */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => toggleSelectJob(job.id)}
                          className="text-content-muted hover:text-content-primary transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Tên tệp */}
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

                      {/* Trạng thái */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            job.stage === "COMPLETED"
                              ? "bg-emerald-50 text-status-success border-emerald-200"
                              : job.stage === "FAILED"
                              ? "bg-red-50 text-status-error border-red-200"
                              : "bg-blue-50 text-primary border-blue-200"
                          }`}
                        >
                          {job.stage === "COMPLETED"
                            ? "HOÀN TẤT"
                            : job.stage === "FAILED"
                            ? "LỖI"
                            : "ĐANG XỬ LÝ"}
                        </span>
                      </td>

                      {/* Tiến độ */}
                      <td className="py-3 px-4">
                        <div className="w-28 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-content-muted">
                            <span>
                              {job.processed_frames}/{job.total_frames} frames
                            </span>
                            <span>{job.overall_progress_pct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                job.stage === "COMPLETED" ? "bg-status-success" : "bg-primary"
                              }`}
                              style={{ width: `${job.overall_progress_pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Biển số nhận diện */}
                      <td className="py-3 px-4 font-bold text-primary font-mono text-sm">
                        {job.detected_plates_count} biển số
                      </td>

                      {/* Thời gian */}
                      <td className="py-3 px-4 text-content-muted font-mono text-[11px]">
                        {new Date(job.created_at).toLocaleString("vi-VN")}
                      </td>

                      {/* Tốc độ AI */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-content-secondary">
                        {job.current_fps} FPS
                      </td>

                      {/* Thao tác (Xem Video, Xem Biển số, Xóa Video) */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Nút Xem Video AI */}
                          <button
                            onClick={() => setSelectedJobForVideo(job)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white hover:bg-primary-hover text-[11px] font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-95"
                            title="Mở trình phát xem video đã nhận diện AI"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Xem Video AI</span>
                          </button>

                          {/* Nút xem chi tiết biển số */}
                          <Link
                            href={`/trace?channel=${encodeURIComponent(job.filename)}`}
                            className="inline-flex items-center p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors border border-border"
                            title="Truy vết toàn bộ biển số của video này"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>

                          {/* Nút Xóa Video */}
                          <button
                            onClick={() => setJobToDelete(job)}
                            className="inline-flex items-center p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-red-50 hover:border-red-200 transition-colors border border-border"
                            title="Xóa video này khỏi hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Modal Xác nhận Xóa 1 Video */}
      {jobToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-100 text-status-error border border-red-200 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-content-primary">
                  Xác nhận Xóa Video?
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Thao tác này sẽ xóa vĩnh viễn và không thể khôi phục
                </p>
              </div>
            </div>

            <div className="p-3 bg-surface-muted rounded-xl border border-border text-xs space-y-1.5">
              <p className="font-semibold text-content-primary truncate">
                Tệp: {jobToDelete.filename}
              </p>
              <p className="text-content-muted text-[11px]">
                Mã tác vụ: <span className="font-mono">{jobToDelete.id}</span>
              </p>
              <p className="text-content-muted text-[11px]">
                Toàn bộ video gốc, video kết xuất AI và{" "}
                <b className="text-status-error">{jobToDelete.detected_plates_count} biển số xe</b> liên quan trong cơ sở dữ liệu sẽ bị xóa hoàn toàn.
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-status-error text-xs border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={isDeleting}
                onClick={() => {
                  setJobToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors border border-border"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-status-error hover:bg-red-700 text-white transition-all shadow-xs disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận Xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa Hàng Loạt Video */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-100 text-status-error border border-red-200 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-content-primary">
                  Xóa {selectedJobIds.size} Video Đã Chọn?
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Xóa hàng loạt các video và toàn bộ bản ghi biển số liên quan
                </p>
              </div>
            </div>

            <p className="text-xs text-content-muted">
              Bạn có chắc chắn muốn xóa đồng thời <b>{selectedJobIds.size}</b> video này không? Các tệp video và dữ liệu nhận diện trong Database sẽ bị loại bỏ vĩnh viễn.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-status-error text-xs border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={isBulkDeleting}
                onClick={() => {
                  setShowBulkDeleteConfirm(false);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors border border-border"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isBulkDeleting}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-status-error hover:bg-red-700 text-white transition-all shadow-xs disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa {selectedJobIds.size} Video</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
