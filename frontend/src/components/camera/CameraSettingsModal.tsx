"use client";

import React from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Database,
  Gauge,
  Globe,
  Play,
  Plus,
  Radio,
  Settings,
  Sliders,
  Smartphone,
  Square,
  Trash2,
  Video,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import type { CameraDevice } from "@/lib/cameraApi";

interface CameraSettingsModalProps {
  open: boolean;
  onClose: () => void;
  devices: CameraDevice[];
  selectedCameras: string[];
  toggleCamera: (sourceOrIndex: string) => void;
  source: string;
  setSource: (val: string) => void;
  onOpenAddHttpModal: () => void;
  onDeleteConfiguredCamera?: (id: string) => void;
  minVotes: number;
  setMinVotes: (val: number) => void;
  duration: string;
  setDuration: (val: string) => void;
  stride: number;
  setStride: (val: number) => void;
  ocrMode: "hybrid" | "easyocr" | "char";
  setOcrMode: (val: "hybrid" | "easyocr" | "char") => void;
  saveDb: boolean;
  setSaveDb: (val: boolean) => void;
  saveVideo: boolean;
  setSaveVideo: (val: boolean) => void;
  isRunning: boolean;
  busy: boolean;
  onStart: (e?: React.FormEvent) => Promise<void>;
  onStop: () => Promise<void>;
}

export function CameraSettingsModal({
  open,
  onClose,
  devices,
  selectedCameras,
  toggleCamera,
  source,
  setSource,
  onOpenAddHttpModal,
  onDeleteConfiguredCamera,
  minVotes,
  setMinVotes,
  duration,
  setDuration,
  stride,
  setStride,
  ocrMode,
  setOcrMode,
  saveDb,
  setSaveDb,
  saveVideo,
  setSaveVideo,
  isRunning,
  busy,
  onStart,
  onStop,
}: CameraSettingsModalProps) {
  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onStart(e);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-muted/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-content-primary">
                Cấu hình Luồng Camera & Nhận diện AI
              </h3>
              <p className="text-[11px] text-content-muted">
                Chọn nguồn camera, thêm camera IP/HTTP và tùy chỉnh tham số AI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - scrollable */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* MỤC 1: DANH SÁCH CHỌN CAMERA & NÚT THÊM CAMERA HTTP */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-content-secondary flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-primary" />
                <span>Danh sách Camera khả dụng ({devices.length})</span>
              </label>

              {/* Nút Thêm Camera HTTP */}
              <button
                type="button"
                onClick={onOpenAddHttpModal}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary-border text-primary hover:bg-primary hover:text-white text-[11px] font-bold transition-all shadow-2xs hover:scale-[1.02]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Camera bằng link HTTP</span>
              </button>
            </div>

            {/* Danh sách camera dạng thẻ chọn */}
            {devices.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-border bg-surface-muted/50 text-center">
                <Camera className="w-8 h-8 text-slate-400 mx-auto mb-1.5 opacity-60" />
                <p className="text-xs font-semibold text-content-primary">
                  Chưa phát hiện camera nào
                </p>
                <p className="text-[10px] text-content-muted mt-0.5 mb-2.5">
                  Không tìm thấy webcam cục bộ. Bạn có thể thêm camera IP hoặc điện thoại qua đường dẫn HTTP.
                </p>
                <button
                  type="button"
                  onClick={onOpenAddHttpModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-xl shadow-sm hover:bg-primary-hover transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Camera HTTP / RTSP</span>
                </button>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-border p-1.5 bg-surface-muted/20">
                {devices.map((device) => {
                  const devSource = String(device.source || device.index);
                  const isChecked = selectedCameras.includes(devSource);
                  const isPrimary = source === devSource;
                  const isHttp = device.type === "http" || devSource.toLowerCase().startsWith("http");

                  return (
                    <div
                      key={devSource}
                      onClick={() => {
                        toggleCamera(devSource);
                        setSource(devSource);
                      }}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? "border-primary bg-primary-light/40 shadow-2xs"
                          : "border-border bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCamera(devSource);
                            if (!isChecked) setSource(devSource);
                          }}
                          className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                        />

                        <div className="p-1.5 rounded-lg bg-surface border border-border text-primary shrink-0">
                          {isHttp ? (
                            <Globe className="w-3.5 h-3.5" />
                          ) : (
                            <Camera className="w-3.5 h-3.5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-content-primary text-xs truncate">
                              {device.name || (isHttp ? "Camera HTTP" : `Webcam #${device.index}`)}
                            </span>
                            {isHttp ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">
                                HTTP / IP
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-700">
                                Local #{device.index}
                              </span>
                            )}
                            {isPrimary && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                Chính
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-content-muted font-mono truncate">
                            {devSource}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {device.width > 0 && device.height > 0 && (
                          <span className="text-[10px] font-mono text-content-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                            {device.width}×{device.height}
                          </span>
                        )}

                        {device.in_use && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            AI
                          </span>
                        )}

                        {device.is_configured && onDeleteConfiguredCamera && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Xác nhận xóa camera ${device.name || devSource}?`)) {
                                onDeleteConfiguredCamera(String(device.id || devSource));
                              }
                            }}
                            className="p-1 text-content-muted hover:text-red-600 rounded hover:bg-red-50 transition"
                            title="Xóa camera khỏi hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[10px] text-content-muted mt-1.5">
              💡 Bạn có thể tick chọn nhiều camera. Khi bấm <b>Bắt đầu</b>, tất cả camera được tick chọn sẽ đồng thời bật nhận diện.
            </p>
          </div>

          {/* MỤC 2: GRID THÔNG SỐ AI */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
            {/* OCR Mode */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                Chế độ OCR
              </label>
              <select
                value={ocrMode}
                onChange={(e) =>
                  setOcrMode(e.target.value as "hybrid" | "easyocr" | "char")
                }
                className="w-full px-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary focus:outline-none focus:border-primary focus:bg-surface transition-colors"
              >
                <option value="char">Character (Nhanh - 30+ FPS)</option>
                <option value="hybrid">Hybrid (Chính xác cao)</option>
                <option value="easyocr">EasyOCR (Chuyên sâu)</option>
              </select>
            </div>

            {/* Stride */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                Bước nhảy (Stride)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={stride}
                onChange={(e) =>
                  setStride(
                    Math.min(5, Math.max(1, Number(e.target.value) || 1))
                  )
                }
                className="w-full px-3 py-2 text-xs font-mono bg-surface-muted border border-border rounded-xl text-content-primary focus:outline-none focus:border-primary focus:bg-surface transition-colors"
              />
              <span className="text-[10px] text-content-muted mt-1 block">
                1: Quét từng frame · 2: Bỏ cách 1 frame
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Min Votes */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                Ngưỡng phiếu (Min Votes)
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={minVotes}
                onChange={(e) =>
                  setMinVotes(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-full px-3 py-2 text-xs font-mono bg-surface-muted border border-border rounded-xl text-content-primary focus:outline-none focus:border-primary focus:bg-surface transition-colors"
              />
              <span className="text-[10px] text-content-muted mt-1 block">
                Số lần khớp để xác nhận biển số (mặc định: 2)
              </span>
            </div>

            {/* Giới hạn thời gian */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
                Giới hạn chạy (Giây)
              </label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Để trống = Vô hạn"
                className="w-full px-3 py-2 text-xs font-mono bg-surface-muted border border-border rounded-xl text-content-primary focus:outline-none focus:border-primary focus:bg-surface transition-colors"
              />
              <span className="text-[10px] text-content-muted mt-1 block">
                Tự động dừng sau số giây quy định
              </span>
            </div>
          </div>

          {/* MỤC 3: TÙY CHỌN LƯU TRỮ */}
          <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-content-muted mb-1">
              Tùy chọn lưu trữ dữ liệu
            </span>
            <label className="flex items-center justify-between gap-3 text-xs text-content-secondary cursor-pointer">
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Lưu kết quả biển số vào cơ sở dữ liệu MySQL
              </span>
              <input
                type="checkbox"
                checked={saveDb}
                onChange={(e) => setSaveDb(e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-content-secondary cursor-pointer pt-1">
              <span className="flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                Ghi và xuất video có vẽ khung nhận diện (H.264)
              </span>
              <input
                type="checkbox"
                checked={saveVideo}
                onChange={(e) => setSaveVideo(e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-muted rounded-xl transition-colors"
            >
              Đóng
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={async () => {
                  await onStop();
                  onClose();
                }}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                <span>Dừng Camera</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 hover:scale-[1.02]"
              >
                <Play className="w-4 h-4" />
                <span>
                  Bật {selectedCameras.length > 0 ? `${selectedCameras.length} Camera` : "Camera"} & Nhận diện
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
