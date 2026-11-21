"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  Database,
  Gauge,
  Globe,
  MapPin,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ScanLine,
  Settings,
  Smartphone,
  Square,
  Trash2,
  Video,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { SafePlateImage } from "@/components/shared/SafePlateImage";
import { CameraSettingsModal } from "@/components/camera/CameraSettingsModal";
import { AddHttpCameraModal } from "@/components/camera/AddHttpCameraModal";
import {
  cameraPreviewStreamUrl,
  cameraStreamUrl,
  deleteConfiguredCamera,
  discoverCameras,
  getCameraStatus,
  mediaUrl,
  startCamera,
  startCameraPreviews,
  stopCamera,
  stopCameraPreviews,
  type CameraDevice,
  type CameraPlateRecord,
  type CameraSession,
} from "@/lib/cameraApi";
import type { VehicleType } from "@/types";

const MAX_SELECTED_CAMERAS = 4;

const STATUS_LABELS: Record<string, string> = {
  starting: "Đang khởi động",
  running: "Đang nhận diện",
  stopping: "Đang dừng",
  stopped: "Đã dừng",
  completed: "Hoàn tất",
  failed: "Lỗi",
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
  // Cấu hình tham số AI & Nguồn
  const [source, setSource] = useState("0");
  const [minVotes, setMinVotes] = useState(2);
  const [duration, setDuration] = useState("");
  const [stride, setStride] = useState(2);
  const [ocrMode, setOcrMode] = useState<"hybrid" | "easyocr" | "char">("char");
  const [saveDb, setSaveDb] = useState(false);
  const [saveVideo, setSaveVideo] = useState(false);

  // Trạng thái phiên chạy (Hỗ trợ đơn & đa camera)
  const [session, setSession] = useState<CameraSession | null>(null);
  const [sessions, setSessions] = useState<CameraSession[]>([]);
  const [recordsList, setRecordsList] = useState<CameraPlateRecord[]>([]);
  const [active, setActive] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<Record<string, boolean>>({});
  const [streamKey, setStreamKey] = useState(0);

  // Danh sách camera khả dụng & camera được tick chọn
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [osCameraNames, setOsCameraNames] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedCameras, setSelectedCameras] = useState<string[]>(["0"]);

  // Quản lý Modals & Popups
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddHttpModalOpen, setIsAddHttpModalOpen] = useState(false);
  const [isCameraDropdownOpen, setIsCameraDropdownOpen] = useState(false);
  const cameraDropdownRef = useRef<HTMLDivElement>(null);

  // Xem trước camera (khi chưa bấm Bắt đầu)
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<Record<string, string | null>>({});
  const [previewNonce, setPreviewNonce] = useState(0);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        cameraDropdownRef.current &&
        !cameraDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCameraDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Quét danh sách camera (local webcams + configured HTTP cameras)
  const scanCameras = useCallback(
    async (refresh = false) => {
      setScanning(true);
      setScanError(null);
      try {
        const payload = await discoverCameras(refresh, 6);
        const localList: CameraDevice[] = (payload.devices || []).map((d) => ({
          ...d,
          source: String(d.index),
          name: `Webcam #${d.index}`,
          type: "local",
        }));

        const configuredList: CameraDevice[] = (payload.configured_cameras || []).map((c) => ({
          ...c,
          is_configured: true,
          type: (c.source || "").toLowerCase().startsWith("http") ? "http" : "rtsp",
        }));

        const combined = [...localList, ...configuredList];
        setDevices(combined);
        setOsCameraNames(payload.os_names || []);

        // Nếu chưa chọn camera nào và có camera khả dụng, tự chọn cái đầu tiên
        setSelectedCameras((prev) => {
          if (prev.length === 0 && combined.length > 0) {
            const firstSource = String(combined[0].source || combined[0].index);
            setSource(firstSource);
            return [firstSource];
          }
          return prev;
        });
      } catch (err) {
        setScanError(
          err instanceof Error
            ? err.message
            : "Không thể dò tìm thiết bị camera trên máy chủ."
        );
      } finally {
        setScanning(false);
      }
    },
    []
  );

  // Kiểm tra trạng thái phiên camera từ Backend
  const refreshStatus = useCallback(async () => {
    try {
      const status = await getCameraStatus();
      setBackendOnline(true);
      setActive(status.active);
      setSession(status.session);
      if (status.sessions && status.sessions.length > 0) {
        setSessions(status.sessions);
      } else if (status.session) {
        setSessions([status.session]);
      } else {
        setSessions([]);
      }
    } catch {
      setBackendOnline(false);
    }
  }, []);

  // Tải danh sách biển số đã nhận diện từ các camera
  const refreshRecords = useCallback(async () => {
    try {
      const response = await fetch(`${cameraStreamUrl()}`.replace("/stream", "/records"), {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.records)) {
          setRecordsList(data.records);
        }
      }
    } catch {
      // Ignored
    }
  }, []);

  // Khởi tạo
  useEffect(() => {
    void scanCameras(false);
    void refreshStatus();
    void refreshRecords();
  }, [scanCameras, refreshStatus, refreshRecords]);

  // Polling chu kỳ 1.5s khi camera đang chạy
  const isRunning = active || (session ? session.status === "starting" || session.status === "running" : false);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      void refreshStatus();
      void refreshRecords();
    }, 1500);
    return () => clearInterval(interval);
  }, [isRunning, refreshStatus, refreshRecords]);

  // Toggle tick chọn camera
  const toggleCamera = (sourceOrIndex: string) => {
    const key = String(sourceOrIndex).trim();
    setSelectedCameras((prev) => {
      let next: string[];
      if (prev.includes(key)) {
        next = prev.filter((k) => k !== key);
      } else {
        if (prev.length >= MAX_SELECTED_CAMERAS) {
          setError(`Chỉ có thể chọn tối đa ${MAX_SELECTED_CAMERAS} camera cùng lúc.`);
          return prev;
        }
        next = [...prev, key];
      }
      if (next.length > 0) {
        setSource(next[next.length - 1]);
      }
      return next;
    });
  };

  // Callback khi thêm camera HTTP thành công
  const handleCameraAdded = (newDevice: CameraDevice) => {
    setDevices((prev) => {
      const exists = prev.some(
        (d) => String(d.source) === String(newDevice.source) || d.id === newDevice.id
      );
      if (exists) return prev;
      return [...prev, newDevice];
    });
    const newSource = String(newDevice.source || newDevice.index);
    setSelectedCameras((prev) => {
      if (prev.includes(newSource)) return prev;
      if (prev.length >= MAX_SELECTED_CAMERAS) return prev;
      return [...prev, newSource];
    });
    setSource(newSource);
  };

  // Xóa camera đã cấu hình
  const handleDeleteConfiguredCamera = async (id: string) => {
    try {
      await deleteConfiguredCamera(id);
      setDevices((prev) => prev.filter((d) => d.id !== id && String(d.index) !== id));
      setSelectedCameras((prev) => prev.filter((k) => k !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi xóa camera.");
    }
  };

  // Bắt đầu nhận diện AI cho các camera được tích chọn
  const handleStart = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();

    // Lấy danh sách các camera đang được tích chọn
    const targetSources = selectedCameras.length > 0 ? selectedCameras : [source.trim()];
    const cleanSources = targetSources.filter(Boolean);

    if (cleanSources.length === 0) {
      setError("Vui lòng tích chọn ít nhất 1 Camera để bắt đầu nhận diện.");
      return;
    }

    setBusy(true);
    setError(null);
    setStreamError({});

    // Dừng các preview nếu có
    try {
      const numericIndices = cleanSources
        .filter((s) => /^\d+$/.test(s))
        .map(Number);
      if (numericIndices.length > 0) {
        await stopCameraPreviews(numericIndices);
      }
    } catch {
      // Ignored
    }

    try {
      const res = await startCamera({
        sources: cleanSources,
        source: cleanSources[0],
        min_votes: minVotes,
        duration_seconds: duration ? Number(duration) : null,
        save_db: saveDb,
        save_video: saveVideo,
        reconnect_attempts: 10,
        stream_max_fps: 12,
        ocr_mode: ocrMode,
        stride,
      });

      setSession(res.session);
      setSessions(res.sessions && res.sessions.length > 0 ? res.sessions : [res.session]);
      setActive(true);
      setStreamKey((value) => value + 1);

      // Cập nhật trạng thái in_use
      setDevices((previous) =>
        previous.map((device) => {
          const devKey = String(device.source || device.index);
          return {
            ...device,
            in_use: cleanSources.includes(devKey),
            previewing: false,
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể bật camera.");
    } finally {
      setBusy(false);
    }
  };

  // Dừng tất cả camera
  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      const stopped = await stopCamera();
      if (stopped) {
        setSession(stopped);
      }
      setActive(false);
      setSessions([]);
      setStreamKey((value) => value + 1);
      setDevices((previous) =>
        previous.map((device) => ({ ...device, in_use: false }))
      );
      await refreshStatus();
      void scanCameras(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể dừng camera.");
    } finally {
      setBusy(false);
    }
  };

  // Danh sách biển số hiển thị (từ recordsList hoặc session)
  const displayRecords = useMemo(() => {
    if (recordsList.length > 0) return recordsList;
    return [...(session?.records ?? [])].reverse();
  }, [recordsList, session?.records]);

  // Danh sách các session đang chạy để render
  const runningSessions = useMemo(() => {
    if (sessions.length > 0) return sessions;
    if (session) return [session];
    return [];
  }, [sessions, session]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden pb-2">
      {/* 1. Header Cố Định Trên Cùng (Không Di Chuyển Khi Cuộn) */}
      <header className="sticky top-0 z-30 shrink-0 -mx-4 lg:-mx-6 px-4 lg:px-6 bg-background/95 backdrop-blur-md pt-3 pb-3 border-b border-border/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Tiêu đề & Trạng thái Backend */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-black text-xl lg:text-2xl tracking-tight text-content-primary">
                Camera trực tiếp
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-border bg-primary-light px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <Radio className="h-3 w-3 animate-tech-pulse text-red-500" />
                Live MJPEG
              </span>
            </div>

            <div
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                backendOnline
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {backendOnline ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              <span>{backendOnline ? "FastAPI online" : "FastAPI offline"}</span>
            </div>
          </div>

          {/* Nhóm Nút Tác Vụ Trên Header */}
          <div className="flex items-center gap-2 shrink-0">
            {/* DROPDOWN: Chọn Camera (Webcam + HTTP/IP) */}
            <div className="relative" ref={cameraDropdownRef}>
              <button
                type="button"
                onClick={() => setIsCameraDropdownOpen(!isCameraDropdownOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedCameras.length > 0 || isCameraDropdownOpen
                    ? "border-primary bg-primary-light text-primary shadow-xs"
                    : "border-border bg-surface hover:bg-surface-muted text-content-primary"
                }`}
                title="Chọn các camera cần bật nhận diện hoặc xem trước"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {selectedCameras.length > 0
                    ? `Camera (${selectedCameras.length})`
                    : "Chọn Camera"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isCameraDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Popup Dropdown danh sách camera */}
              {isCameraDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-88 bg-surface border border-border rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                    <div>
                      <p className="font-heading font-bold text-xs text-content-primary">
                        Danh sách Camera
                      </p>
                      <p className="text-[10px] text-content-muted">
                        Tick chọn camera để bật đồng thời ({selectedCameras.length}/{MAX_SELECTED_CAMERAS})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void scanCameras(true)}
                      disabled={scanning}
                      className="p-1 rounded-lg hover:bg-surface-muted text-content-secondary hover:text-primary transition-colors disabled:opacity-50"
                      title="Quét lại camera"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${scanning ? "animate-spin text-primary" : ""}`}
                      />
                    </button>
                  </div>

                  {scanning && devices.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-content-muted">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Đang quét camera trên máy...</span>
                    </div>
                  ) : devices.length === 0 ? (
                    <div className="py-3 px-2 text-center text-[11px] text-content-muted">
                      Chưa có camera nào. Hãy thêm camera qua link HTTP bên dưới!
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {devices.map((device) => {
                        const devKey = String(device.source || device.index);
                        const checked = selectedCameras.includes(devKey);
                        const isHttp =
                          device.type === "http" || devKey.toLowerCase().startsWith("http");

                        return (
                          <label
                            key={devKey}
                            className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs transition cursor-pointer ${
                              checked
                                ? "border-primary/60 bg-primary-light"
                                : "border-border hover:bg-surface-muted"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCamera(devKey)}
                                className="w-3.5 h-3.5 rounded accent-primary cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {isHttp ? (
                                    <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                                  ) : (
                                    <Camera className="w-3 h-3 text-slate-500 shrink-0" />
                                  )}
                                  <span className="truncate font-semibold text-content-primary text-xs">
                                    {device.name || (isHttp ? "Camera HTTP" : `Camera ${device.index}`)}
                                  </span>
                                </div>
                                <p className="text-[10px] text-content-muted font-mono truncate">
                                  {devKey}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {device.width > 0 && device.height > 0 && (
                                <span className="text-[9px] text-content-muted font-mono">
                                  {device.width}×{device.height}
                                </span>
                              )}
                              {device.in_use && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                                  AI
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Nút thêm Camera HTTP ngay trong dropdown */}
                  <div className="pt-2 mt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCameraDropdownOpen(false);
                        setIsAddHttpModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-primary-light hover:bg-primary text-primary hover:text-white border border-primary-border text-xs font-bold transition-all shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Camera bằng link HTTP / IP</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* BUTTON: Mở Cấu hình Camera */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-muted text-content-primary text-xs font-semibold transition-all shadow-2xs hover:scale-[1.02]"
              title="Mở bảng cấu hình tham số camera và AI"
            >
              <Settings className="w-3.5 h-3.5 text-content-secondary" />
              <span>Cấu hình</span>
            </button>

            {/* BUTTON: Bắt đầu / Dừng nhận diện nhanh */}
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Dừng</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStart()}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>
                  Bật {selectedCameras.length > 0 ? `(${selectedCameras.length})` : ""}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Thông báo lỗi nổi nếu có */}
      {error && (
        <div className="shrink-0 mt-2 flex items-center justify-between gap-3 p-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-bold text-red-600 hover:underline px-2"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 2. GIAO DIỆN CHÍNH: 2 Cột (Màn hình Camera + Màn hình Biển số xe vừa mới quét được) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4 pt-3 pb-2 overflow-hidden">
        {/* CỘT TRÁI (8/12 hoặc 9/12): MÀN HÌNH CAMERA VỚI CHÚ THÍCH THÔNG SỐ TRỰC TIẾP TRÊN MÀN HÌNH */}
        <div className="xl:col-span-8 2xl:col-span-9 h-full flex flex-col min-h-0 rounded-2xl border border-border bg-slate-950 overflow-hidden relative shadow-lg">
          {isRunning && runningSessions.length > 0 ? (
            /* ============================================================== */
            /* TRƯỜNG HỢP 1: CÁC CAMERA ĐANG BẬT NHẬN DIỆN AI                   */
            /* ============================================================== */
            runningSessions.length === 1 ? (
              /* Đơn Camera Chạy AI: Hiển thị 1 màn hình lớn */
              <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={streamKey}
                  src={`${cameraStreamUrl(runningSessions[0].source_raw || runningSessions[0].source)}?t=${streamKey}`}
                  alt="Luồng camera AI"
                  className="w-full h-full object-contain select-none"
                  onError={() =>
                    setStreamError((prev) => ({
                      ...prev,
                      [runningSessions[0].id]: true,
                    }))
                  }
                  onLoad={() =>
                    setStreamError((prev) => ({
                      ...prev,
                      [runningSessions[0].id]: false,
                    }))
                  }
                />

                {/* Chú thích REC & FPS góc trên trái */}
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-1.5 text-xs font-mono font-bold text-white border border-slate-700/80 backdrop-blur-md shadow-md">
                  <span className="h-2.5 w-2.5 animate-tech-pulse rounded-full bg-red-500" />
                  <span className="text-red-400 font-bold uppercase tracking-wider">REC</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-emerald-400">
                    {Math.round(runningSessions[0].fps)} FPS
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-300 font-sans text-[11px] font-normal">
                    {STATUS_LABELS[runningSessions[0].status] ?? runningSessions[0].status}
                  </span>
                </div>

                {/* Chú thích Tên Camera góc trên phải */}
                <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-1.5 text-xs font-mono text-white border border-slate-700/80 backdrop-blur-md shadow-md">
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold text-slate-200 truncate max-w-[200px]">
                    {runningSessions[0].label || "Camera"}
                  </span>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    #{runningSessions[0].source}
                  </span>
                </div>

                {/* Thanh HUD Thông Số Ở Cạnh Dưới Màn Hình */}
                <div className="absolute bottom-3 inset-x-3 flex flex-wrap items-center justify-between gap-2.5 bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800/90 text-white shadow-xl pointer-events-auto">
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="flex items-center gap-1.5" title="Tốc độ khung hình xử lý AI">
                      <Gauge className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-slate-400 text-[10px] font-bold">FPS:</span>
                      <span className="font-bold text-white">
                        {runningSessions[0].fps.toFixed(1)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" title="Tổng số khung hình đã quét">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-slate-400 text-[10px] font-bold">FRAME:</span>
                      <span className="font-bold text-white">
                        {runningSessions[0].processed_frames.toLocaleString("vi-VN")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" title="Số lượng biển số xe nhận diện thành công">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-slate-400 text-[10px] font-bold">BIỂN SỐ:</span>
                      <span className="font-bold text-emerald-400 font-mono text-sm">
                        {runningSessions[0].record_count}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" title="Thời gian chạy liên tục">
                      <Video className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-slate-400 text-[10px] font-bold">THỜI GIAN:</span>
                      <span className="font-bold text-white">
                        {formatDuration(runningSessions[0].elapsed_seconds)}
                      </span>
                    </div>
                  </div>

                  {/* Nhãn phụ */}
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-300">
                    {saveDb && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-semibold">
                        <Database className="w-3 h-3" /> MySQL
                      </span>
                    )}
                    {saveVideo && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300 font-semibold">
                        <Video className="w-3 h-3" /> Ghi MP4
                      </span>
                    )}
                    <span className="text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      OCR: {ocrMode.toUpperCase()} · Stride {stride}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Đa Camera Chạy AI Đồng Thời: Hiển Thị Dạng Lưới Grid */
              <div
                className="grid w-full h-full gap-2 p-2 bg-slate-950 auto-rows-fr overflow-hidden"
                style={{
                  gridTemplateColumns:
                    runningSessions.length <= 2
                      ? "repeat(2, minmax(0, 1fr))"
                      : "repeat(2, minmax(0, 1fr))",
                  gridTemplateRows:
                    runningSessions.length <= 2
                      ? "minmax(0, 1fr)"
                      : "repeat(2, minmax(0, 1fr))",
                }}
              >
                {runningSessions.map((camSession) => (
                  <div
                    key={camSession.id}
                    className="relative min-h-0 h-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-center group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${cameraStreamUrl(camSession.source_raw || camSession.source)}?t=${streamKey}`}
                      alt={camSession.label}
                      className="h-full w-full object-contain select-none"
                      onError={() =>
                        setStreamError((prev) => ({
                          ...prev,
                          [camSession.id]: true,
                        }))
                      }
                    />

                    {/* Badge Góc Trên Trái: REC & Tên Camera */}
                    <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/75 px-2.5 py-1 text-[11px] font-bold text-white border border-slate-700/80 backdrop-blur-md">
                      <span className="h-2 w-2 animate-tech-pulse rounded-full bg-red-500" />
                      <span className="truncate max-w-[140px]">
                        {camSession.label || `Camera ${camSession.source}`}
                      </span>
                      <span className="text-emerald-400 font-mono text-[10px]">
                        {Math.round(camSession.fps)} FPS
                      </span>
                    </div>

                    {/* Badge Góc Trên Phải: Nguồn */}
                    <div className="pointer-events-none absolute right-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-800 backdrop-blur-md">
                      #{camSession.source}
                    </div>

                    {/* Thanh HUD Nhỏ Ở Cạnh Dưới Mỗi Camera */}
                    <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-lg bg-black/80 px-2.5 py-1 text-[10px] text-white backdrop-blur-md border border-slate-800 font-mono">
                      <span>Frame: {camSession.processed_frames}</span>
                      <span className="text-emerald-400 font-bold">
                        Biển số: {camSession.record_count}
                      </span>
                      <span>{formatDuration(camSession.elapsed_seconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : selectedCameras.length > 0 ? (
            /* ============================================================== */
            /* TRƯỜNG HỢP 2: ĐÃ TÍCH CHỌN CAMERA NHƯNG CHƯA BẤM BẮT ĐẦU       */
            /* ============================================================== */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-400 select-none">
              <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 text-slate-400 mb-3">
                <Camera className="w-12 h-12 stroke-[1.5]" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-200">
                Đã chọn {selectedCameras.length} Camera sẵn sàng
              </h3>
              <p className="text-xs text-slate-400 max-w-md mt-1 mb-5 leading-relaxed">
                Các camera đang được chọn:{" "}
                <b className="text-primary font-mono">{selectedCameras.join(", ")}</b>.<br />
                Bấm nút <b>Bật nhận diện</b> bên dưới để đồng thời mở luồng video và quét biển số AI.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleStart()}
                  disabled={busy}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-md transition-all hover:scale-[1.02]"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Bật {selectedCameras.length} Camera & Nhận diện</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold rounded-xl transition-all"
                >
                  <Settings className="w-4 h-4" />
                  <span>Cấu hình tham số</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddHttpModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold rounded-xl transition-all"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span>Thêm Camera HTTP</span>
                </button>
              </div>
            </div>
          ) : (
            /* ============================================================== */
            /* TRƯỜNG HỢP 3: CHƯA CÓ CAMERA NÀO ĐƯỢC CHỌN                     */
            /* ============================================================== */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-400 select-none">
              <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 text-slate-500 mb-3">
                <CameraOff className="w-12 h-12 stroke-[1.5]" />
              </div>
              <h3 className="font-heading font-bold text-base text-slate-200">
                Chưa có luồng camera nào được chọn
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5 leading-relaxed">
                Mở menu <b>Chọn Camera</b> trên thanh tiêu đề để tick chọn webcam hoặc thêm camera bằng đường dẫn HTTP.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddHttpModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all hover:scale-[1.02]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Camera bằng link HTTP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold rounded-xl transition-all"
                >
                  <Settings className="w-4 h-4" />
                  <span>Mở Cấu hình</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CỘT PHẢI (4/12 hoặc 3/12): MÀN HÌNH BIỂN SỐ XE VỪA MỚI QUÉT ĐƯỢC */}
        <div className="xl:col-span-4 2xl:col-span-3 h-full flex flex-col min-h-0 rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
          {/* Header Màn hình Biển số */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted/30 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary-light text-primary border border-primary-border">
                <ScanLine className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-xs lg:text-sm text-content-primary">
                  Biển số vừa quét được
                </h3>
                <p className="text-[10px] text-content-muted">
                  Cập nhật tự động từ các camera đang bật
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-surface-muted text-content-primary border border-border">
              <span
                className={`w-2 h-2 rounded-full ${
                  displayRecords.length > 0
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-slate-400"
                }`}
              />
              <span>{displayRecords.length} xe</span>
            </span>
          </div>

          {/* Danh sách Biển số cuộn bên trong */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
            {displayRecords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-content-muted select-none">
                <div className="p-3 rounded-2xl bg-surface-muted border border-border text-slate-400 mb-2">
                  <ScanLine className="w-8 h-8 opacity-60" />
                </div>
                <p className="text-xs font-semibold text-content-primary">
                  Chưa có biển số nào được quét
                </p>
                <p className="text-[11px] text-content-muted max-w-[200px] mt-1 leading-relaxed">
                  Khi phương tiện đi qua luồng camera, biển số được xác nhận sẽ xuất hiện tại đây.
                </p>
              </div>
            ) : (
              displayRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-all hover:border-primary-border hover:bg-primary-light/20 hover:shadow-2xs"
                >
                  {/* Ảnh crop biển số */}
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xs">
                    <SafePlateImage
                      src={mediaUrl(record.crop_image_url)}
                      alt={record.plate_display}
                      plateNumber={record.plate_display}
                      className="object-cover"
                    />
                  </div>

                  {/* Thông tin biển số */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <PlateBadge display={record.plate_display} />
                      <VehicleBadge type={record.vehicle_type as VehicleType} />
                      {record.source && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 truncate max-w-[110px]">
                          Cam: {record.source}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-content-muted">
                      <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="truncate">{record.province || "Không xác định"}</span>
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-content-muted font-mono mt-0.5">
                      <span>{record.votes} phiếu</span>
                      <span className="text-status-success font-semibold">
                        {(record.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Component Cấu hình Camera dạng Modal Popup */}
      <CameraSettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        devices={devices}
        selectedCameras={selectedCameras}
        toggleCamera={toggleCamera}
        source={source}
        setSource={setSource}
        onOpenAddHttpModal={() => {
          setIsSettingsOpen(false);
          setIsAddHttpModalOpen(true);
        }}
        onDeleteConfiguredCamera={handleDeleteConfiguredCamera}
        minVotes={minVotes}
        setMinVotes={setMinVotes}
        duration={duration}
        setDuration={setDuration}
        stride={stride}
        setStride={setStride}
        ocrMode={ocrMode}
        setOcrMode={setOcrMode}
        saveDb={saveDb}
        setSaveDb={setSaveDb}
        saveVideo={saveVideo}
        setSaveVideo={setSaveVideo}
        isRunning={isRunning}
        busy={busy}
        onStart={handleStart}
        onStop={handleStop}
      />

      {/* 4. Component Modal Thêm Camera Bằng Link HTTP / RTSP */}
      <AddHttpCameraModal
        open={isAddHttpModalOpen}
        onClose={() => setIsAddHttpModalOpen(false)}
        onCameraAdded={handleCameraAdded}
      />
    </div>
  );
}
