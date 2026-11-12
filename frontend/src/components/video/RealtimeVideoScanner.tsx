"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Play,
  Pause,
  UploadCloud,
  FileVideo,
  Cpu,
  Scan,
  Compass,
  CheckCircle2,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { PlateRecord, VideoJob } from "@/types";
import { alprApi, apiUrl, mediaUrl } from "@/lib/api";

function formatTime(secs: number): string {
  if (isNaN(secs) || !isFinite(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function jobStatusLabel(job: VideoJob | null): string {
  if (!job) return "CHƯA CÓ VIDEO";
  if (job.stage === "COMPLETED") return "HOÀN TẤT";
  if (job.stage === "FAILED") return "LỖI XỬ LÝ";
  if (job.stage === "CANCELLED") return "ĐÃ HỦY";
  if (job.stage === "QUEUED") return "ĐANG CHỜ XỬ LÝ";
  return `AI ĐANG QUÉT ${Math.round(job.overall_progress_pct)}%`;
}

export function RealtimeVideoScanner({
  job: jobProp,
}: {
  job?: VideoJob | null;
} = {}) {
  const controlled = jobProp !== undefined;
  const [internalJob, setInternalJob] = useState<VideoJob | null>(null);
  const job = controlled ? jobProp ?? null : internalJob;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [records, setRecords] = useState<PlateRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const loadLatestJob = async () => {
      const jobs = await alprApi.getJobs();
      if (cancelled) return;
      setInternalJob(jobs.length > 0 ? jobs[0] : null);
    };
    void loadLatestJob();
    return () => {
      cancelled = true;
    };
  }, [controlled]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setRecords([]);
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    const fetchRecords = async () => {
      setIsLoadingRecords(true);
      try {
        const data = await alprApi.getPlates({ job_id: job.id });
        if (!cancelled) setRecords(data);
      } finally {
        if (!cancelled) setIsLoadingRecords(false);
      }
    };

    void fetchRecords();
    const intervalMs = job.stage === "COMPLETED" ? 5000 : 2000;
    const interval = setInterval(() => {
      void fetchRecords();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [job?.id, job?.stage]);

  const videoSrc = job
    ? apiUrl(job.video_url || `/videos/${job.id}/file`)
    : "";
  const displayDuration = duration || job?.duration_seconds || 0;

  const activeRecords = records
    .filter((record) => Math.abs(currentTime * 1000 - record.pts_ms) <= 2000)
    .slice(0, 3);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const jumpToTime = (targetSeconds: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(targetSeconds, displayDuration || targetSeconds));
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    if (!isPlaying) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const isProcessing = job?.stage === "QUEUED" || job?.stage === "PROCESSING";
  const isCompleted = job?.stage === "COMPLETED";
  const isFailed = job?.stage === "FAILED";

  return (
    <div className="bg-surface border border-border rounded-bento p-5 lg:p-6 shadow-bento space-y-5">
      {/* 1. Header Toolbar Bento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
            <Scan className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="font-heading font-black text-base text-content-primary tracking-tight flex items-center gap-2">
              Bộ Phân tích Video Đã Tải lên
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isCompleted
                    ? "bg-emerald-50 text-status-success border-emerald-200"
                    : isFailed
                    ? "bg-red-50 text-status-error border-red-200"
                    : isProcessing
                    ? "bg-blue-50 text-primary border-blue-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                {jobStatusLabel(job)}
              </span>
            </h2>
            <p className="text-xs text-content-muted">
              Video tải lên được xử lý bởi pipeline AI và hiển thị biển số thật theo từng mốc thời gian
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/upload"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Tải Video khác</span>
          </Link>
        </div>
      </div>

      {/* 2. Main Grid: Video Player + Realtime Plate Feed Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Video Player (8 Cột) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md flex items-center justify-center select-none">
            {job && videoSrc ? (
              <>
                <video
                  key={job.id}
                  ref={videoRef}
                  src={videoSrc}
                  muted={isMuted}
                  playsInline
                  crossOrigin="anonymous"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      const d = videoRef.current.duration;
                      setDuration(Number.isFinite(d) && d > 0 ? d : 0);
                    }
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={togglePlay}
                />

                {/* HUD Status Header Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-white max-w-[65%]">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isProcessing
                          ? "bg-amber-400 animate-ping"
                          : isCompleted
                          ? "bg-emerald-400"
                          : isFailed
                          ? "bg-red-400"
                          : "bg-slate-400"
                      }`}
                    />
                    <span className="text-[11px] font-mono font-bold tracking-tight truncate">
                      {jobStatusLabel(job)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-white font-mono text-[10px]">
                    <span className="text-blue-400 font-bold">
                      {job.current_fps > 0 ? `${job.current_fps.toFixed(1)} FPS` : "AI PIPELINE"}
                    </span>
                    <span className="text-slate-400">
                      • {job.processed_frames}/{job.total_frames || "?"} frames
                    </span>
                  </div>
                </div>

                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-x-4 bottom-4 bg-slate-950/90 backdrop-blur-md rounded-xl border border-slate-700 p-3 text-white pointer-events-none">
                    <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                      <span className="flex items-center gap-2 text-amber-300 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ĐANG PHÂN TÍCH VIDEO...
                      </span>
                      <span>{Math.round(job.overall_progress_pct)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, job.overall_progress_pct)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Failed Overlay */}
                {isFailed && (
                  <div className="absolute inset-x-4 bottom-4 bg-red-950/90 backdrop-blur-md rounded-xl border border-red-700 p-3 text-white pointer-events-none">
                    <p className="flex items-center gap-2 text-xs font-bold text-red-200">
                      <AlertCircle className="w-4 h-4" />
                      {job.error_message || "Không thể xử lý video này"}
                    </p>
                  </div>
                )}

                {/* Active Real Detection Overlay */}
                {!isProcessing && activeRecords.length > 0 && (
                  <div className="absolute bottom-4 left-4 space-y-2 pointer-events-none">
                    {activeRecords.map((plate) => (
                      <div
                        key={plate.id}
                        className="flex items-center gap-2.5 bg-slate-950/90 backdrop-blur-md border border-slate-700 rounded-xl p-2 pr-3"
                      >
                        <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-slate-600 bg-slate-800 shrink-0">
                          {plate.crop_image_url ? (
                            <Image
                              src={mediaUrl(plate.crop_image_url)}
                              alt={plate.plate_number}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <FileVideo className="w-4 h-4 text-slate-400 m-auto mt-3" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <PlateBadge display={plate.plate_display} color={plate.plate_type} />
                          <p className="text-[10px] text-slate-300 font-mono">
                            {plate.video_time_str} • {(plate.confidence_score * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 text-primary flex items-center justify-center shadow-inner">
                  <Scan className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <h3 className="font-heading font-black text-sm text-white tracking-tight">
                  Chưa có Video nào được nạp vào bộ xử lý
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hãy tải lên một tệp video từ trang Tải lên. Hệ thống sẽ lưu video, xử lý bằng pipeline AI
                  và hiển thị chính video đó cùng các biển số nhận diện được.
                </p>
                <Link
                  href="/upload"
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Tải Video lên ngay</span>
                </Link>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="bg-surface-muted border border-border p-3.5 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono font-bold text-primary w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <div className="relative flex-1">
                <input
                  type="range"
                  min={0}
                  max={displayDuration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!job}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
                {displayDuration > 0 && (
                  <div className="absolute inset-x-0 -bottom-2 h-2 pointer-events-none">
                    {records.map((record) => (
                      <span
                        key={record.id}
                        className="absolute w-1 h-1 rounded-full bg-primary"
                        style={{
                          left: `${Math.min(
                            100,
                            Math.max(0, (record.pts_ms / 1000 / displayDuration) * 100)
                          )}%`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-mono text-content-muted w-12">
                {formatTime(displayDuration)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  disabled={!job}
                  className="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg hover:bg-slate-200 text-content-secondary transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <div className="flex items-center gap-1 border-l border-border pl-2">
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changeSpeed(rate)}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded-md transition-all ${
                        playbackRate === rate
                          ? "bg-primary text-white"
                          : "bg-surface hover:bg-slate-200 text-content-secondary border border-border"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-content-muted min-w-0">
                <FileVideo className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-semibold text-content-primary truncate max-w-[240px]">
                  {job?.filename || "Chưa chọn video"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Plate Detection Feed (4 Cột) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3 bg-surface-muted/50 border border-border/80 rounded-2xl p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/80">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-content-primary">
                  Biển số Đã Nhận diện ({records.length})
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isCompleted
                    ? "bg-emerald-50 text-status-success border-emerald-200"
                    : "bg-primary-light text-primary border-primary-border"
                }`}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> ĐÃ XỬ LÝ
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> {jobStatusLabel(job)}
                  </>
                )}
              </span>
            </div>

            <p className="text-[11px] text-content-muted">
              Bấm vào biển số bên dưới để tua video đến đúng thời điểm xuất hiện:
            </p>

            <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1">
              {records.length > 0 ? (
                records.map((plate) => {
                  const isActive = Math.abs(currentTime * 1000 - plate.pts_ms) <= 2000;
                  return (
                    <div
                      key={plate.id}
                      onClick={() => jumpToTime(plate.pts_ms / 1000)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2.5 shadow-2xs group ${
                        isActive
                          ? "bg-primary-light/70 border-primary/60"
                          : "bg-surface border-border/80 hover:border-primary/50 hover:bg-blue-50/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-12 h-8 rounded-lg overflow-hidden border border-slate-300 bg-slate-200 shrink-0">
                          {plate.crop_image_url ? (
                            <Image
                              src={mediaUrl(plate.crop_image_url)}
                              alt={plate.plate_number}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform"
                              unoptimized
                            />
                          ) : (
                            <FileVideo className="w-4 h-4 text-slate-500 m-auto mt-2" />
                          )}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <PlateBadge display={plate.plate_display} color={plate.plate_type} />
                            <VehicleBadge type={plate.vehicle_type} />
                          </div>
                          <p className="text-[10px] text-content-muted font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-primary shrink-0" />
                            <span className="truncate">
                              {plate.video_time_str} • {plate.province}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono font-bold text-status-success bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {(plate.confidence_score * 100).toFixed(0)}%
                        </span>
                        <div className="mt-1">
                          <Link
                            href={`/trace?q=${encodeURIComponent(plate.plate_number)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5 justify-end"
                          >
                            <Compass className="w-3 h-3" />
                            Truy vết
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-content-muted space-y-2 border border-dashed border-border rounded-xl">
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-6 h-6 text-primary mx-auto animate-spin" />
                      <p className="font-semibold text-content-primary">AI đang phân tích video</p>
                      <p className="text-[11px]">
                        Kết quả biển số sẽ xuất hiện khi pipeline xử lý xong.
                      </p>
                    </>
                  ) : isLoadingRecords ? (
                    <>
                      <Loader2 className="w-6 h-6 text-primary mx-auto animate-spin" />
                      <p className="font-semibold text-content-primary">Đang tải kết quả</p>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 text-primary mx-auto opacity-60" />
                      <p className="font-semibold text-content-primary">
                        {job ? "Không tìm thấy biển số trong video" : "Chưa có video để phân tích"}
                      </p>
                      <p className="text-[11px]">
                        {job
                          ? "Hãy thử video khác có biển số rõ hơn."
                          : "Tải video lên để bắt đầu quét."}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-border/80 text-[11px] text-content-muted flex items-center justify-between font-mono">
            <span className="truncate max-w-[160px]">
              {job ? job.id : "Chưa có tác vụ"}
            </span>
            <Link href="/plates" className="font-bold text-primary hover:underline shrink-0">
              Mở Kho Biển số →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
