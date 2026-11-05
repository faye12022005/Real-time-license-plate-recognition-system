"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Sparkles,
  RefreshCw,
  X,
  Trash2,
  ListOrdered,
  AlertTriangle,
  Play,
  Clock,
  Gauge,
} from "lucide-react";
import { alprApi } from "@/lib/api";
import { useRealtimeEvent } from "@/lib/useRealtime";
import { VideoJob, UploadQueueItem, QueueStatus } from "@/types";

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm"];
const MAX_CONCURRENT_UPLOADS = 2; // Số tệp tải lên đồng thời tối đa

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface VideoUploadZoneProps {
  onJobCreated?: (job: VideoJob) => void;
  onJobUpdated?: (jobId: string, updates: Partial<VideoJob>) => void;
  onOpenVideoModal?: (job: VideoJob) => void;
}

export function VideoUploadZone({
  onJobCreated,
  onJobUpdated,
  onOpenVideoModal,
}: VideoUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const processingIdsRef = useRef<Set<string>>(new Set());

  // Thu dọn request khi unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach((ctrl) => ctrl.abort());
    };
  }, []);

  // =========================================================================
  // Đồng bộ Tiến trình AI Thật qua WebSocket
  // =========================================================================
  useRealtimeEvent<{ job_id: string; [key: string]: any }>(
    "video_job_updated",
    (update) => {
      if (!update || !update.job_id) return;
      const isDone = update.stage === "COMPLETED";
      const isFailed = update.stage === "FAILED";

      setQueue((prev) =>
        prev.map((q) => {
          if (q.jobId === update.job_id) {
            const newStatus: QueueStatus = isDone
              ? "COMPLETED"
              : isFailed
              ? "ERROR"
              : "PROCESSING";

            const progress = isDone
              ? 100
              : Math.round(update.stage_progress_pct ?? update.overall_progress_pct ?? q.overallProgress ?? 0);

            return {
              ...q,
              status: newStatus,
              overallProgress: progress,
              processedFrames: update.processed_frames ?? q.processedFrames,
              totalFrames: update.total_frames ?? q.totalFrames,
              currentFps: update.current_fps ?? q.currentFps,
              etaSeconds: update.eta_seconds ?? q.etaSeconds,
              detectedPlatesCount: update.detected_plates_count ?? q.detectedPlatesCount,
              processedVideoUrl: update.processed_video_url ?? q.processedVideoUrl,
              errorMessage: update.error_message || q.errorMessage,
            };
          }
          return q;
        })
      );
    }
  );

  // =========================================================================
  // Polling dự phòng mỗi 1.5s cho các job đang PROCESSING để đảm bảo 100% đồng bộ
  // =========================================================================
  useEffect(() => {
    const activeJobs = queue.filter(
      (q) => q.status === "PROCESSING" && q.jobId
    );
    if (activeJobs.length === 0) return;

    const interval = setInterval(() => {
      activeJobs.forEach(async (item) => {
        if (!item.jobId) return;
        try {
          const freshJob = await alprApi.getJobById(item.jobId);
          if (freshJob) {
            const isDone = freshJob.stage === "COMPLETED";
            const isFailed = freshJob.stage === "FAILED";

            setQueue((prev) =>
              prev.map((q) => {
                if (q.id === item.id) {
                  return {
                    ...q,
                    status: isDone ? "COMPLETED" : isFailed ? "ERROR" : "PROCESSING",
                    overallProgress: isDone
                      ? 100
                      : Math.round(freshJob.stage_progress_pct ?? freshJob.overall_progress_pct ?? 0),
                    processedFrames: freshJob.processed_frames,
                    totalFrames: freshJob.total_frames,
                    currentFps: freshJob.current_fps,
                    etaSeconds: freshJob.eta_seconds,
                    detectedPlatesCount: freshJob.detected_plates_count,
                    processedVideoUrl: freshJob.processed_video_url,
                    errorMessage: freshJob.error_message,
                  };
                }
                return q;
              })
            );

            if (onJobUpdated && item.jobId) {
              onJobUpdated(item.jobId, freshJob);
            }
          }
        } catch {
          // Bỏ qua lỗi mạng nhất thời trong lúc polling
        }
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [queue, onJobUpdated]);

  // 1. Kiểm tra tính hợp lệ của tệp
  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    if (file.size === 0) {
      return {
        isValid: false,
        error: "Tệp rỗng (0-byte) hoặc bị lỗi phân vùng dữ liệu",
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `Dung lượng (${formatBytes(file.size)}) vượt quá giới hạn 1GB`,
      };
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
    const isVideoMime = file.type.startsWith("video/") || file.type === "";

    if (!isAllowedExt && !isVideoMime) {
      return {
        isValid: false,
        error: `Định dạng tệp không được hỗ trợ (chỉ nhận ${ALLOWED_EXTENSIONS.join(", ").toUpperCase()})`,
      };
    }

    return { isValid: true };
  };

  // 2. Thêm danh sách tệp vào Hàng đợi
  const addFilesToQueue = (files: File[]) => {
    setGlobalError(null);
    const newItems: UploadQueueItem[] = [];

    files.forEach((file) => {
      const validation = validateFile(file);
      const itemId = `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      newItems.push({
        id: itemId,
        file,
        filename: file.name,
        fileSizeBytes: file.size,
        status: validation.isValid ? "QUEUED" : "ERROR",
        uploadProgress: 0,
        overallProgress: 0,
        errorMessage: validation.error,
        createdAt: new Date().toISOString(),
      });
    });

    setQueue((prev) => [...newItems, ...prev]);
  };

  // 3. Xử lý Drag & Drop và File Selection
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 4. Quá trình xử lý: Giai đoạn 1 (Tải lên) -> Reset thanh tiến trình -> Giai đoạn 2 (AI quét)
  const processUploadItem = useCallback(
    async (item: UploadQueueItem) => {
      if (processingIdsRef.current.has(item.id)) return;
      processingIdsRef.current.add(item.id);

      const controller = new AbortController();
      abortControllersRef.current[item.id] = controller;

      // Bước 1: Bắt đầu tải lên
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "UPLOADING", uploadProgress: 5 } : q
        )
      );

      try {
        const res = await alprApi.uploadVideo(
          item.file,
          (percent) => {
            setQueue((prev) =>
              prev.map((q) =>
                q.id === item.id ? { ...q, uploadProgress: percent } : q
              )
            );
          },
          controller.signal
        );

        // =====================================================================
        // QUAN TRỌNG: TẢI LÊN XONG -> RESET THANH TIẾN TRÌNH VỀ 0%
        // VÀ BẮT ĐẦU CHẠY TIẾN TRÌNH NHẬN DIỆN AI THẬT
        // =====================================================================
        const initialJob: VideoJob = {
          id: res.job_id,
          filename: item.filename,
          file_size_bytes: item.fileSizeBytes,
          stage: "PROCESSING",
          stage_progress_pct: 0,
          overall_progress_pct: 0,
          total_frames: 0,
          processed_frames: 0,
          duration_seconds: 0,
          current_fps: 0,
          eta_seconds: 0,
          detected_plates_count: 0,
          created_at: new Date().toISOString(),
        };

        if (onJobCreated) onJobCreated(initialJob);

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "PROCESSING",
                  jobId: res.job_id,
                  uploadProgress: 100, // Đã xong bước 1
                  overallProgress: 0,  // RESET TIẾN TRÌNH AI VỀ 0% ĐỂ BẮT ĐẦU QUÉT
                  totalFrames: 0,
                  processedFrames: 0,
                  currentFps: 0,
                  etaSeconds: 0,
                  detectedPlatesCount: 0,
                }
              : q
          )
        );
      } catch (err: any) {
        processingIdsRef.current.delete(item.id);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "ERROR",
                  errorMessage: err.message || "Lỗi không xác định khi tải lên",
                }
              : q
          )
        );
      } finally {
        delete abortControllersRef.current[item.id];
      }
    },
    [onJobCreated]
  );

  // 5. Queue Worker Loop: Bốc tệp tiếp theo khi có slot trống
  useEffect(() => {
    const activeCount = queue.filter(
      (q) => q.status === "UPLOADING" || q.status === "VALIDATING"
    ).length;

    if (activeCount < MAX_CONCURRENT_UPLOADS) {
      const nextItem = queue.find(
        (q) => q.status === "QUEUED" && !processingIdsRef.current.has(q.id)
      );
      if (nextItem) {
        processUploadItem(nextItem);
      }
    }
  }, [queue, processUploadItem]);

  // Hủy tải lên
  const cancelItem = (id: string) => {
    processingIdsRef.current.delete(id);
    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
    }
    setQueue((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, status: "CANCELLED", errorMessage: "Đã hủy bởi người dùng" } : q
      )
    );
  };

  // Thử lại
  const retryItem = (id: string) => {
    processingIdsRef.current.delete(id);
    setQueue((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              status: "QUEUED",
              uploadProgress: 0,
              overallProgress: 0,
              errorMessage: undefined,
            }
          : q
      )
    );
  };

  // Xóa mục
  const removeItem = (id: string) => {
    processingIdsRef.current.delete(id);
    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
    }
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  // Xóa các mục hoàn tất
  const clearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status !== "COMPLETED"));
  };

  const uploadingCount = queue.filter((q) => q.status === "UPLOADING").length;
  const processingCount = queue.filter((q) => q.status === "PROCESSING").length;
  const completedCount = queue.filter((q) => q.status === "COMPLETED").length;
  const errorCount = queue.filter((q) => q.status === "ERROR").length;

  return (
    <div className="space-y-4">
      {/* 1. Khung Kéo thả Video */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-bento p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary-light/50"
            : "border-border hover:border-primary/60 hover:bg-surface-muted/50"
        } bg-surface`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/mp4,video/mkv,video/avi,video/quicktime,video/webm"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-2xl bg-primary-light border border-primary-border text-primary flex items-center justify-center mx-auto mb-3 shadow-xs">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h4 className="font-heading font-bold text-sm text-content-primary">
          Kéo thả một hoặc nhiều video cùng lúc vào đây
        </h4>
        <p className="text-xs text-content-muted mt-1 max-w-md mx-auto">
          Quy trình 2 bước tự động: <b>Bước 1</b> Tải tệp lên máy chủ $\rightarrow$ <b>Bước 2</b> AI quét bóc tách biển số từng khung hình.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-[11px] font-mono font-semibold text-content-muted">
          <span className="px-2 py-0.5 rounded bg-surface-muted border border-border">.MP4</span>
          <span className="px-2 py-0.5 rounded bg-surface-muted border border-border">.MKV</span>
          <span className="px-2 py-0.5 rounded bg-surface-muted border border-border">.AVI</span>
          <span className="px-2 py-0.5 rounded bg-surface-muted border border-border">.MOV</span>
          <span className="px-2 py-0.5 rounded bg-blue-50 text-primary border border-blue-200">
            HÀNG ĐỢI ĐỒNG THỜI: {MAX_CONCURRENT_UPLOADS} TỆP
          </span>
        </div>
      </div>

      {/* 2. Khung Quản lý Hàng đợi & Tiến trình Đồng bộ */}
      {queue.length > 0 && (
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-3">
          {/* Header hàng đợi */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/80">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-primary" />
              <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-content-primary">
                Hàng đợi Xử lý ({queue.length} tệp)
              </h5>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                {uploadingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                    Đang tải lên: {uploadingCount}
                  </span>
                )}
                {processingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
                    AI Đang Quét: {processingCount}
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Đã Xong: {completedCount}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-status-error border border-red-200">
                    Lỗi: {errorCount}
                  </span>
                )}
              </div>
            </div>

            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-content-muted hover:text-content-primary hover:bg-surface-muted rounded-lg border border-border transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Dọn mục đã xong</span>
              </button>
            )}
          </div>

          {/* Danh sách các tệp */}
          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {queue.map((item) => {
              const isUploading = item.status === "UPLOADING";
              const isProcessing = item.status === "PROCESSING";
              const isCompleted = item.status === "COMPLETED";
              const isError = item.status === "ERROR";
              const isQueued = item.status === "QUEUED";

              // Tính toán phần trăm tiến trình hiển thị cho thanh đơn
              const currentPercent = isUploading
                ? item.uploadProgress
                : isProcessing
                ? item.overallProgress || 0
                : isCompleted
                ? 100
                : 0;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isError
                      ? "bg-red-50/40 border-red-200"
                      : isCompleted
                      ? "bg-emerald-50/20 border-emerald-300 shadow-2xs"
                      : isProcessing
                      ? "bg-purple-50/30 border-purple-300 shadow-2xs ring-1 ring-purple-200"
                      : isUploading
                      ? "bg-blue-50/30 border-blue-300 shadow-2xs"
                      : "bg-surface-muted border-border/80"
                  }`}
                >
                  {/* Hàng 1: Tên tệp, Kích thước & Trạng thái Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-2 rounded-lg border shrink-0 ${
                          isError
                            ? "bg-red-100 text-status-error border-red-200"
                            : isCompleted
                            ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                            : isProcessing
                            ? "bg-purple-100 text-purple-700 border-purple-300"
                            : "bg-white text-primary border-slate-200"
                        }`}
                      >
                        <FileVideo className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-heading font-bold text-xs text-content-primary truncate max-w-[240px] sm:max-w-md">
                          {item.filename}
                        </p>
                        <p className="text-[10px] text-content-muted font-mono flex items-center gap-2 mt-0.5">
                          <span>{formatBytes(item.fileSizeBytes)}</span>
                          {item.currentFps ? (
                            <span className="text-purple-700 font-semibold">• {item.currentFps} FPS</span>
                          ) : null}
                          {isProcessing && item.totalFrames ? (
                            <span>• {item.processedFrames || 0}/{item.totalFrames} frames</span>
                          ) : null}
                          {item.detectedPlatesCount !== undefined && item.detectedPlatesCount > 0 ? (
                            <span className="text-emerald-700 font-bold">• {item.detectedPlatesCount} biển số</span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {/* Trạng thái Badge */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isQueued && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          CHỜ TẢI
                        </span>
                      )}
                      {isUploading && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 animate-pulse">
                          1/2: ĐANG TẢI LÊN ({item.uploadProgress}%)
                        </span>
                      )}
                      {isProcessing && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-300 animate-pulse flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-600 animate-spin" />
                          2/2: AI ĐANG QUÉT ({item.overallProgress || 0}%)
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          ĐÃ QUÉT XONG ({item.detectedPlatesCount || 0} BIỂN SỐ)
                        </span>
                      )}
                      {isError && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-status-error border border-red-300 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> LỖI
                        </span>
                      )}

                      {/* Nút Xem Video AI trực tiếp khi xong */}
                      {isCompleted && item.jobId && onOpenVideoModal && (
                        <button
                          onClick={() => {
                            onOpenVideoModal({
                              id: item.jobId!,
                              filename: item.filename,
                              file_size_bytes: item.fileSizeBytes,
                              stage: "COMPLETED",
                              stage_progress_pct: 100,
                              overall_progress_pct: 100,
                              total_frames: item.totalFrames || 0,
                              processed_frames: item.processedFrames || 0,
                              duration_seconds: 0,
                              current_fps: 0,
                              eta_seconds: 0,
                              detected_plates_count: item.detectedPlatesCount || 0,
                              processed_video_url: item.processedVideoUrl,
                              video_url: `/static/videos/${item.jobId}_${item.filename}`,
                              created_at: item.createdAt,
                            });
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-primary text-white hover:bg-primary-hover transition-all shadow-xs"
                          title="Mở video đã nhận diện AI"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Xem Video AI</span>
                        </button>
                      )}

                      {/* Nút hủy/xóa */}
                      {(isUploading || isQueued) && (
                        <button
                          onClick={() => cancelItem(item.id)}
                          title="Hủy tải lên"
                          className="p-1 rounded-md text-content-muted hover:text-status-error hover:bg-red-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(isCompleted || isError) && (
                        <button
                          onClick={() => removeItem(item.id)}
                          title="Xóa khỏi danh sách"
                          className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-slate-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Thông báo lỗi nếu có */}
                  {isError && item.errorMessage && (
                    <div className="mt-2 text-[11px] text-status-error font-medium flex items-center gap-1.5 bg-red-100/60 p-2 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.errorMessage}</span>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* THANH TIẾN TRÌNH ĐƠN (Unified Single Progress Bar)     */}
                  {/* Khi upload xong: Reset về 0% và chạy tiếp tiến trình AI */}
                  {/* ======================================================= */}
                  {(isUploading || isProcessing || isCompleted) && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-content-secondary flex items-center gap-1">
                          {isUploading ? (
                            <span className="text-blue-600 font-bold">
                              [Bước 1/2] Đang tải tệp lên máy chủ...
                            </span>
                          ) : isProcessing ? (
                            <span className="text-purple-700 font-bold flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              [Bước 2/2] AI đang quét từng frame & nhận diện biển số...
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã hoàn tất nhận diện toàn bộ video
                            </span>
                          )}
                        </span>

                        <span
                          className={`font-bold ${
                            isCompleted
                              ? "text-emerald-600"
                              : isProcessing
                              ? "text-purple-700"
                              : "text-blue-600"
                          }`}
                        >
                          {currentPercent}%
                        </span>
                      </div>

                      {/* Thanh Bar */}
                      <div className="w-full bg-slate-200/90 rounded-full h-2 overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isCompleted
                              ? "bg-emerald-500"
                              : isProcessing
                              ? "bg-gradient-to-r from-violet-600 to-indigo-600"
                              : "bg-blue-600"
                          }`}
                          style={{ width: `${currentPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
