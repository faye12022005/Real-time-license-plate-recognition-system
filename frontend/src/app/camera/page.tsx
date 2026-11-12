"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Database,
  Gauge,
  MapPin,
  Play,
  Radio,
  RefreshCw,
  ScanLine,
  Square,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";

import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { BentoCard } from "@/components/shared/BentoCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { SafePlateImage } from "@/components/shared/SafePlateImage";
import {
  cameraStreamUrl,
  getCameraStatus,
  mediaUrl,
  startCamera,
  stopCamera,
  type CameraSession,
} from "@/lib/cameraApi";
import type { VehicleType } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  starting: "Đang khởi động",
  running: "Đang nhận diện",
  stopping: "Đang dừng",
  stopped: "Đã dừng",
  completed: "Hoàn tất",
  failed: "Lỗi",
};

const STATUS_STYLES: Record<string, string> = {
  starting: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-emerald-50 text-emerald-700 border-emerald-200",
  stopping: "bg-amber-50 text-amber-700 border-amber-200",
  stopped: "bg-slate-100 text-slate-600 border-slate-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining
    .toString()
    .padStart(2, "0")}`;
}

export default function CameraPage() {
  const [source, setSource] = useState("0");
  const [minVotes, setMinVotes] = useState(2);
  const [duration, setDuration] = useState("");
  const [stride, setStride] = useState(1);
  const [ocrMode, setOcrMode] = useState<"hybrid" | "easyocr" | "char">(
    "char",
  );
  const [saveDb, setSaveDb] = useState(false);
  const [saveVideo, setSaveVideo] = useState(false);

  const [session, setSession] = useState<CameraSession | null>(null);
  const [active, setActive] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getCameraStatus();
      setBackendOnline(true);
      setActive(status.active);
      setSession(status.session);
    } catch (err) {
      setBackendOnline(false);
      setError(
        err instanceof Error
          ? err.message
          : "Không thể kết nối FastAPI tại http://localhost:8000",
      );
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const timer = setInterval(refreshStatus, 1000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const isRunning = active || (session ? session.status === "starting" : false);
  const records = useMemo(
    () => [...(session?.records ?? [])].reverse(),
    [session?.records],
  );

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!source.trim()) {
      setError("Vui lòng nhập webcam index hoặc URL RTSP/HTTP.");
      return;
    }

    setBusy(true);
    setError(null);
    setStreamError(false);
    try {
      const created = await startCamera({
        source: source.trim(),
        min_votes: minVotes,
        duration_seconds: duration ? Number(duration) : null,
        save_db: saveDb,
        save_video: saveVideo,
        reconnect_attempts: 10,
        stream_max_fps: 12,
        ocr_mode: ocrMode,
        stride,
      });
      setSession(created);
      setActive(true);
      setStreamKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể bật camera.");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      const stopped = await stopCamera(session?.id);
      if (stopped) {
        setSession(stopped);
      }
      setActive(false);
      setStreamKey((value) => value + 1);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể dừng camera.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-black text-2xl tracking-tight text-content-primary">
              Camera trực tiếp
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-border bg-primary-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              <Radio className="h-3 w-3 animate-tech-pulse" />
              Live MJPEG
            </span>
          </div>
          <p className="mt-1 text-sm text-content-muted">
            Kết nối webcam hoặc IP camera, xem luồng nhận diện và kết quả biển số
            ngay trên trình duyệt.
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
            backendOnline
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {backendOnline ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {backendOnline === null
            ? "Đang kiểm tra backend"
            : backendOnline
              ? "FastAPI online"
              : "FastAPI offline"}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-bento border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Không thể xử lý camera</p>
            <p className="mt-0.5 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <BentoCard
            title="Luồng nhận diện"
            subtitle={
              session
                ? `${session.label} · ${session.source}`
                : "Chưa có camera nào được kết nối"
            }
            icon={<Camera className="h-4 w-4" />}
            action={
              session && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    STATUS_STYLES[session.status] ?? STATUS_STYLES.stopped
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {STATUS_LABELS[session.status] ?? session.status}
                </span>
              )
            }
            className="h-full"
          >
            {session ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={streamKey}
                  src={`${cameraStreamUrl()}?t=${streamKey}`}
                  alt="Luồng camera ALPR"
                  className="aspect-video w-full object-contain"
                  onError={() => setStreamError(true)}
                  onLoad={() => setStreamError(false)}
                />

                {(!active || streamError) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/75 text-slate-300">
                    <CameraOff className="h-9 w-9 opacity-70" />
                    <p className="text-sm font-semibold">
                      {streamError
                        ? "Không nhận được khung hình"
                        : "Camera đã dừng"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {session.status === "failed"
                        ? session.error
                        : "Bấm Bắt đầu để mở lại luồng camera."}
                    </p>
                  </div>
                )}

                {active && (
                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-black/55 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                    <span className="h-2 w-2 animate-tech-pulse rounded-full bg-red-500" />
                    REC · {Math.round(session.fps)} FPS
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={ScanLine}
                title="Chưa có luồng camera"
                description="Nhập webcam index (0) hoặc URL RTSP/HTTP ở cột bên phải, sau đó bấm Bắt đầu nhận diện."
                className="min-h-[320px]"
              />
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                icon={<Gauge className="h-4 w-4" />}
                label="FPS"
                value={session ? session.fps.toFixed(1) : "--"}
              />
              <Metric
                icon={<Activity className="h-4 w-4" />}
                label="Frame"
                value={session ? session.processed_frames.toLocaleString("vi-VN") : "--"}
              />
              <Metric
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Biển số"
                value={session ? session.record_count.toString() : "--"}
              />
              <Metric
                icon={<Video className="h-4 w-4" />}
                label="Thời gian"
                value={session ? formatDuration(session.elapsed_seconds) : "--"}
              />
            </div>
          </BentoCard>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <BentoCard
            title="Cấu hình camera"
            subtitle="Webcam, RTSP, RTMP hoặc HTTP stream"
            icon={<Radio className="h-4 w-4" />}
          >
            <form onSubmit={handleStart} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-content-muted">
                  Nguồn camera
                </span>
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="0 hoặc rtsp://user:pass@ip:554/stream"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 font-mono text-xs text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    Min votes
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={minVotes}
                    onChange={(event) =>
                      setMinVotes(Math.max(1, Number(event.target.value) || 1))
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    Giới hạn (giây)
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    placeholder="Không giới hạn"
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    OCR mode
                  </span>
                  <select
                    value={ocrMode}
                    onChange={(event) =>
                      setOcrMode(
                        event.target.value as "hybrid" | "easyocr" | "char",
                      )
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="char">Character (nhanh)</option>
                    <option value="hybrid">Hybrid (chính xác)</option>
                    <option value="easyocr">EasyOCR</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    Stride
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={stride}
                    onChange={(event) =>
                      setStride(
                        Math.min(5, Math.max(1, Number(event.target.value) || 1)),
                      )
                    }
                    className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-xs text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-surface-muted/50 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-content-secondary">
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Lưu MySQL
                  </span>
                  <input
                    type="checkbox"
                    checked={saveDb}
                    onChange={(event) => setSaveDb(event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-content-secondary">
                  <span className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-primary" />
                    Ghi video annotated
                  </span>
                  <input
                    type="checkbox"
                    checked={saveVideo}
                    onChange={(event) => setSaveVideo(event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || isRunning}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && !isRunning ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Bắt đầu
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={busy || !session}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-bold text-content-secondary transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Square className="h-4 w-4" />
                  Dừng
                </button>
              </div>
            </form>
          </BentoCard>

          <BentoCard
            title="Biển số vừa nhận diện"
            subtitle="Cập nhật tự động mỗi giây"
            icon={<ScanLine className="h-4 w-4" />}
            action={
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-content-secondary">
                {records.length}
              </span>
            }
          >
            {records.length === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center text-content-muted">
                <ScanLine className="h-8 w-8 text-slate-300" />
                <p className="text-xs font-semibold">
                  Chưa có biển số nào được xác nhận
                </p>
                <p className="max-w-[240px] text-[11px] leading-relaxed">
                  Kết quả sẽ xuất hiện khi track đạt đủ số phiếu tối thiểu.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white p-2.5 transition hover:border-primary-border hover:bg-primary-light/30"
                  >
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                      <SafePlateImage
                        src={mediaUrl(record.crop_image_url)}
                        alt={record.plate_display}
                        plateNumber={record.plate_display}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PlateBadge display={record.plate_display} />
                        <VehicleBadge type={record.vehicle_type as VehicleType} />
                      </div>
                      <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-content-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {record.province || "Không xác định"}
                      </p>
                      <p className="text-[10px] font-medium text-content-muted">
                        {record.votes} phiếu ·{" "}
                        {Math.round(record.confidence_score * 100)}% tin cậy
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BentoCard>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-1 font-heading text-lg font-black text-content-primary">
        {value}
      </p>
    </div>
  );
}
