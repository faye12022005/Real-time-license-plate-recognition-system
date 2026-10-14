"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Cpu,
  RefreshCw,
  X,
  Trash2,
  ListOrdered,
  AlertTriangle,
  Play,
} from "lucide-react";
import { alprApi } from "@/lib/api";
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

export function VideoUploadZone({
  onJobCreated,
  onJobUpdated,
}: {
  onJobCreated?: (job: VideoJob) => void;
  onJobUpdated?: (jobId: string, updates: Partial<VideoJob>) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const simulationIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const processingIdsRef = useRef<Set<string>>(new Set());

  // Thu dọn các request và timer khi unmount để tránh rò rỉ bộ nhớ
  useEffect(() => {
    return () => {
      Object.values(simulationIntervalsRef.current).forEach(clearInterval);
      Object.values(abortControllersRef.current).forEach((ctrl) => ctrl.abort());
    };
  }, []);

  // 1. Kiểm tra tính hợp lệ của tệp client-side (Client-side Validation)
  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    // Kiểm tra tệp rỗng (0-byte)
    if (file.size === 0) {
      return {
        isValid: false,
        error: "Tệp rỗng (0-byte) hoặc bị lỗi phân vùng dữ liệu",
      };
    }

    // Kiểm tra dung lượng vượt ngưỡng 1GB
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `Dung lượng (${formatBytes(file.size)}) vượt quá giới hạn tối đa 1GB`,
      };
    }

    // Kiểm tra phần mở rộng định dạng tệp
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

  // 2. Thêm danh sách tệp vào Hàng đợi (Enqueue)
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
    // Reset input value để có thể chọn lại cùng 1 file
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 4. Quá trình xử lý tải lên từng tệp trong Queue
  const processUploadItem = useCallback(
    async (item: UploadQueueItem) => {
      // Chống gọi lặp đúp trên cùng một item
      if (processingIdsRef.current.has(item.id)) return;
      processingIdsRef.current.add(item.id);

      const controller = new AbortController();
      abortControllersRef.current[item.id] = controller;

      // Cập nhật trạng thái đang upload
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "UPLOADING", uploadProgress: 5 } : q))
      );

      try {
        // Gọi API tải lên kèm theo dõi tiến trình
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

        // Upload xong -> Chuyển sang PROCESSING
        const newJob: VideoJob = {
          id: res.job_id,
          filename: item.filename,
          file_size_bytes: item.fileSizeBytes,
          stage: "PROCESSING",
          stage_progress_pct: 15,
          overall_progress_pct: 25,
          total_frames: 3600,
          processed_frames: 900,
          duration_seconds: 120,
          current_fps: 28,
          eta_seconds: 65,
          detected_plates_count: 12,
          created_at: new Date().toISOString(),
        };

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "PROCESSING",
                  jobId: res.job_id,
                  overallProgress: 25,
                  currentFps: 28,
                  etaSeconds: 65,
                  detectedPlatesCount: 12,
                }
              : q
          )
        );

        if (onJobCreated) onJobCreated(newJob);

        // Giả lập tiến trình AI hoàn tất có dọn dẹp interval
        let currentPct = 25;
        const interval = setInterval(() => {
          currentPct += 25;
          if (currentPct >= 100) {
            clearInterval(interval);
            delete simulationIntervalsRef.current[item.id];
            processingIdsRef.current.delete(item.id);

            if (onJobUpdated && res.job_id) {
              onJobUpdated(res.job_id, {
                stage: "COMPLETED",
                overall_progress_pct: 100,
                processed_frames: 3600,
                eta_seconds: 0,
                detected_plates_count: 26,
              });
            }

            setQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      status: "COMPLETED",
                      overallProgress: 100,
                      etaSeconds: 0,
                      detectedPlatesCount: (q.detectedPlatesCount || 12) + 14,
                    }
                  : q
              )
            );
          } else {
            if (onJobUpdated && res.job_id) {
              onJobUpdated(res.job_id, {
                overall_progress_pct: currentPct,
                processed_frames: Math.floor((3600 * currentPct) / 100),
                eta_seconds: Math.max(0, Math.floor((100 - currentPct) * 0.7)),
                detected_plates_count: Math.floor(currentPct * 0.35),
              });
            }

            setQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      overallProgress: currentPct,
                      etaSeconds: Math.max(0, Math.floor((100 - currentPct) * 0.7)),
                      detectedPlatesCount: Math.floor(currentPct * 0.35),
                    }
                  : q
              )
            );
          }
        }, 1000);
        simulationIntervalsRef.current[item.id] = interval;
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
    [onJobCreated, onJobUpdated]
  );

  // 5. Queue Worker Loop: Tự động bốc tệp tiếp theo khi có vị trí trống
  useEffect(() => {
    const activeCount = queue.filter(
      (q) => q.status === "UPLOADING" || q.status === "VALIDATING"
    ).length;

    if (activeCount < MAX_CONCURRENT_UPLOADS) {
      const nextItem = queue.find((q) => q.status === "QUEUED" && !processingIdsRef.current.has(q.id));
      if (nextItem) {
        processUploadItem(nextItem);
      }
    }
  }, [queue, processUploadItem]);

  // Hủy tải lên 1 tệp
  const cancelItem = (id: string) => {
    if (simulationIntervalsRef.current[id]) {
      clearInterval(simulationIntervalsRef.current[id]);
      delete simulationIntervalsRef.current[id];
    }
    processingIdsRef.current.delete(id);

    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
    }
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "CANCELLED", errorMessage: "Đã hủy bởi người dùng" } : q))
    );
  };

  // Thử lại 1 tệp bị lỗi
  const retryItem = (id: string) => {
    if (simulationIntervalsRef.current[id]) {
      clearInterval(simulationIntervalsRef.current[id]);
      delete simulationIntervalsRef.current[id];
    }
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

  // Xóa 1 tệp khỏi hàng đợi
  const removeItem = (id: string) => {
    if (simulationIntervalsRef.current[id]) {
      clearInterval(simulationIntervalsRef.current[id]);
      delete simulationIntervalsRef.current[id];
    }
    processingIdsRef.current.delete(id);

    if (abortControllersRef.current[id]) {
      abortControllersRef.current[id].abort();
      delete abortControllersRef.current[id];
    }
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  // Thử lại tất cả các tệp lỗi
  const retryAllFailed = () => {
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "ERROR"
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

  // Xóa các tệp đã hoàn tất
  const clearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status !== "COMPLETED"));
  };

  // Thống kê nhanh hàng đợi
  const queuedCount = queue.filter((q) => q.status === "QUEUED").length;
  const uploadingCount = queue.filter((q) => q.status === "UPLOADING").length;
  const processingCount = queue.filter((q) => q.status === "PROCESSING").length;
  const completedCount = queue.filter((q) => q.status === "COMPLETED").length;
  const errorCount = queue.filter((q) => q.status === "ERROR").length;

  return (
    <div className="space-y-4">
      {/* 1. Dropzone hỗ trợ Nhiều tệp (Multiple Files Dropzone) */}
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
          Hệ thống tự động xếp hàng đợi bất đồng bộ. Hỗ trợ MP4, MKV, AVI, MOV. Dung lượng tối đa 1GB mỗi tệp.
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

      {/* 2. Khung Quản lý Hàng đợi Tải lên (Upload Queue Panel) */}
      {queue.length > 0 && (
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-3">
          {/* Header hàng đợi và thao tác hàng loạt */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/80">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-primary" />
              <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-content-primary">
                Hàng đợi Tải lên ({queue.length} tệp)
              </h5>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                {uploadingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-primary border border-blue-200">
                    Đang tải: {uploadingCount}
                  </span>
                )}
                {processingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    AI Quét: {processingCount}
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-status-success border border-emerald-200">
                    Xong: {completedCount}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-status-error border border-red-200">
                    Lỗi: {errorCount}
                  </span>
                )}
              </div>
            </div>

            {/* Nút thao tác hàng loạt */}
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <button
                  onClick={retryAllFailed}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary-light rounded-lg border border-primary-border transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Thử lại {errorCount} tệp lỗi</span>
                </button>
              )}
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
          </div>

          {/* Danh sách các tệp trong Hàng đợi */}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {queue.map((item) => {
              const isUploading = item.status === "UPLOADING";
              const isProcessing = item.status === "PROCESSING";
              const isCompleted = item.status === "COMPLETED";
              const isError = item.status === "ERROR";
              const isCancelled = item.status === "CANCELLED";
              const isQueued = item.status === "QUEUED";

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isError
                      ? "bg-red-50/40 border-red-200"
                      : isCompleted
                      ? "bg-emerald-50/30 border-emerald-200"
                      : isUploading || isProcessing
                      ? "bg-blue-50/30 border-blue-300 shadow-2xs"
                      : "bg-surface-muted border-border/80"
                  }`}
                >
                  {/* Dòng tiêu đề tệp & Trạng thái */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-2 rounded-lg border shrink-0 ${
                          isError
                            ? "bg-red-100 text-status-error border-red-200"
                            : isCompleted
                            ? "bg-emerald-100 text-status-success border-emerald-200"
                            : "bg-white text-primary border-slate-200"
                        }`}
                      >
                        <FileVideo className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-heading font-bold text-xs text-content-primary truncate max-w-[260px] sm:max-w-md">
                          {item.filename}
                        </p>
                        <p className="text-[10px] text-content-muted font-mono">
                          {formatBytes(item.fileSizeBytes)}
                          {item.currentFps ? ` • ${item.currentFps} FPS` : ""}
                          {item.detectedPlatesCount
                            ? ` • ${item.detectedPlatesCount} biển số`
                            : ""}
                        </p>
                      </div>
                    </div>

                    {/* Trạng thái Badge & Thao tác */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isQueued && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          CHỜ TẢI
                        </span>
                      )}
                      {isUploading && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-primary border border-blue-200 animate-pulse">
                          ĐANG TẢI {item.uploadProgress}%
                        </span>
                      )}
                      {isProcessing && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 animate-pulse">
                          AI QUÉT {item.overallProgress}%
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-status-success border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> HOÀN TẤT
                        </span>
                      )}
                      {isError && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-status-error border border-red-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> LỖI
                        </span>
                      )}
                      {isCancelled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          ĐÃ HỦY
                        </span>
                      )}

                      {/* Nút hành động */}
                      {isError && (
                        <button
                          onClick={() => retryItem(item.id)}
                          title="Thử lại tệp này"
                          className="p-1 rounded-md text-primary hover:bg-blue-100 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(isUploading || isQueued) && (
                        <button
                          onClick={() => cancelItem(item.id)}
                          title="Hủy tải lên"
                          className="p-1 rounded-md text-content-muted hover:text-status-error hover:bg-red-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {(isCompleted || isError || isCancelled) && (
                        <button
                          onClick={() => removeItem(item.id)}
                          title="Xóa khỏi hàng đợi"
                          className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-slate-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Thông báo lỗi chi tiết */}
                  {isError && item.errorMessage && (
                    <div className="mt-2 text-[11px] text-status-error font-medium flex items-center gap-1.5 bg-red-100/60 p-2 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.errorMessage}</span>
                    </div>
                  )}

                  {/* Thanh tiến trình (Khi đang Upload hoặc AI Processing) */}
                  {(isUploading || isProcessing) && (
                    <div className="mt-2.5 space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-content-muted">
                        <span>
                          {isUploading
                            ? "Đang gửi dữ liệu lên máy chủ..."
                            : "Tiến trình AI (Chuẩn hóa 20% + YOLO/OCR 80%)"}
                        </span>
                        <span className="font-bold text-primary">
                          {isUploading
                            ? `${item.uploadProgress}%`
                            : `${item.overallProgress}%`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isUploading
                              ? "bg-primary"
                              : "bg-gradient-to-r from-primary to-purple-600"
                          }`}
                          style={{
                            width: `${
                              isUploading ? item.uploadProgress : item.overallProgress
                            }%`,
                          }}
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
