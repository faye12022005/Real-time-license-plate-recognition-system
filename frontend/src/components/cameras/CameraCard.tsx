"use client";

import React from "react";
import {
  ArrowLeftRight,
  Camera,
  CheckCircle2,
  Eye,
  Gauge,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Radio,
  Trash2,
  XCircle,
} from "lucide-react";
import { CameraType, ParkingCamera } from "@/types";

export interface CameraTestState {
  status: "testing" | "success" | "error";
  message?: string;
}

interface CameraCardProps {
  camera: ParkingCamera;
  test?: CameraTestState;
  busy?: boolean;
  onTest: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

const TYPE_CONFIG: Record<
  CameraType,
  { label: string; icon: React.ElementType; className: string }
> = {
  ENTRY: {
    label: "Làn vào",
    icon: LogIn,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  EXIT: {
    label: "Làn ra",
    icon: LogOut,
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  TWO_WAY: {
    label: "Hai chiều",
    icon: ArrowLeftRight,
    className: "bg-blue-50 text-primary border-blue-200",
  },
};

function maskEndpoint(url: string): string {
  if (!url) return "Chưa cấu hình";
  if (url === "0") return "Webcam máy chủ (0)";
  return url.replace(/(rtsp?:\/\/[^:/@\s]+:)[^@\s]+@/i, "$1••••••@");
}

function formatUpdated(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function CameraCard({
  camera,
  test,
  busy = false,
  onTest,
  onPreview,
  onEdit,
  onDelete,
  onToggleActive,
}: CameraCardProps) {
  const type = TYPE_CONFIG[camera.camera_type] || TYPE_CONFIG.ENTRY;
  const TypeIcon = type.icon;
  const isActive = camera.is_active === 1;
  const isTesting = test?.status === "testing";

  return (
    <article className="bg-surface border border-border rounded-bento p-5 shadow-bento hover:shadow-bento-hover hover:border-slate-300 transition-all flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
              isActive
                ? "bg-primary-light text-primary border-primary-border"
                : "bg-surface-muted text-content-muted border-border"
            }`}
          >
            <Camera className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-heading font-bold text-sm text-content-primary truncate">
                {camera.name}
              </h3>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isActive ? "bg-status-success animate-tech-pulse" : "bg-slate-400"
                }`}
                title={isActive ? "Đang hoạt động" : "Tạm dừng"}
              />
            </div>
            <p className="text-[11px] font-mono text-content-muted mt-0.5 truncate">
              {camera.id}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          disabled={busy}
          onClick={onToggleActive}
          title={isActive ? "Tạm dừng camera" : "Kích hoạt camera"}
          className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-50 ${
            isActive ? "bg-primary" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
              isActive ? "translate-x-[18px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${type.className}`}
        >
          <TypeIcon className="w-3 h-3" />
          {type.label}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
            isActive
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          <Radio className="w-3 h-3" />
          {isActive ? "Đang hoạt động" : "Tạm dừng"}
        </span>
      </div>

      {/* Details */}
      <dl className="mt-4 space-y-2 text-[11px]">
        <div className="flex items-center gap-2 text-content-secondary">
          <MapPin className="w-3.5 h-3.5 text-content-muted shrink-0" />
          <dt className="sr-only">Vị trí</dt>
          <dd className="truncate">{camera.location || "--"}</dd>
        </div>
        <div className="flex items-center gap-2 text-content-secondary">
          <Link2 className="w-3.5 h-3.5 text-content-muted shrink-0" />
          <dt className="sr-only">Luồng kết nối</dt>
          <dd className="truncate font-mono" title={maskEndpoint(camera.rtsp_url)}>
            {maskEndpoint(camera.rtsp_url)}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-content-secondary">
          <Gauge className="w-3.5 h-3.5 text-content-muted shrink-0" />
          <dt className="sr-only">Cấu hình hình ảnh</dt>
          <dd className="font-mono">
            {camera.resolution || "--"} • {camera.fps_limit || "--"} FPS
          </dd>
        </div>
        <div className="flex items-center gap-2 text-content-muted">
          <span className="w-3.5 h-3.5 shrink-0 text-center font-bold">↻</span>
          <dt className="sr-only">Cập nhật</dt>
          <dd className="truncate">Cập nhật: {formatUpdated(camera.updated_at)}</dd>
        </div>
      </dl>

      {/* Test result */}
      {test && test.status !== "testing" && (
        <div
          className={`mt-4 flex items-start gap-2 p-2.5 rounded-xl border text-[11px] leading-relaxed ${
            test.status === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-status-error"
          }`}
        >
          {test.status === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>{test.message || (test.status === "success" ? "Kết nối thành công" : "Không kết nối được camera")}</span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto pt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={busy || isTesting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-light hover:bg-primary text-primary hover:text-white text-[11px] font-bold rounded-lg border border-primary-border transition-all disabled:opacity-60"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Radio className="w-3.5 h-3.5" />
          )}
          <span>{isTesting ? "Đang kiểm tra..." : "Kiểm tra kết nối"}</span>
        </button>

        <button
          type="button"
          onClick={onPreview}
          disabled={busy}
          className="p-2 rounded-lg bg-surface-muted hover:bg-slate-200 text-content-secondary border border-border transition-colors disabled:opacity-50"
          title="Xem ảnh chụp từ camera"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="p-2 rounded-lg bg-surface-muted hover:bg-slate-200 text-content-secondary border border-border transition-colors disabled:opacity-50"
          title="Sửa camera"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="p-2 rounded-lg bg-surface-muted hover:bg-red-50 text-content-secondary hover:text-status-error border border-border hover:border-red-200 transition-colors disabled:opacity-50"
          title="Xóa camera"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}
