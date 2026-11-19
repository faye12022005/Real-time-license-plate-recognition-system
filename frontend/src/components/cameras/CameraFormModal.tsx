"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Camera,
  Gauge,
  Link2,
  Loader2,
  MapPin,
  Monitor,
  Radio,
  Save,
  X,
} from "lucide-react";
import { CameraInput, CameraType, ParkingCamera } from "@/types";

interface CameraFormModalProps {
  open: boolean;
  camera: ParkingCamera | null;
  onClose: () => void;
  onSave: (payload: CameraInput) => Promise<void>;
}

const EMPTY_FORM: CameraInput = {
  name: "",
  camera_type: "ENTRY",
  rtsp_url: "",
  location: "Cổng chính",
  resolution: "1920x1080",
  fps_limit: 25,
  is_active: 1,
};

const RESOLUTIONS = ["640x480", "1280x720", "1920x1080", "2560x1440", "3840x2160"];

const CAMERA_TYPES: Array<{ value: CameraType; label: string; hint: string }> = [
  { value: "ENTRY", label: "Làn vào", hint: "Camera kiểm soát xe vào bãi" },
  { value: "EXIT", label: "Làn ra", hint: "Camera kiểm soát xe ra bãi" },
  { value: "TWO_WAY", label: "Hai chiều", hint: "Camera dùng chung cho cả vào và ra" },
];

const INPUT_CLASS =
  "w-full px-3 py-2.5 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface transition-colors";

const LABEL_CLASS =
  "block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5";

export function CameraFormModal({ open, camera, onClose, onSave }: CameraFormModalProps) {
  const [form, setForm] = useState<CameraInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(camera);

  useEffect(() => {
    if (!open) return;

    if (camera) {
      setForm({
        id: camera.id,
        name: camera.name,
        camera_type: camera.camera_type,
        rtsp_url: camera.rtsp_url,
        location: camera.location,
        resolution: camera.resolution,
        fps_limit: camera.fps_limit,
        is_active: camera.is_active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
    setSaving(false);
  }, [open, camera]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const update = <K extends keyof CameraInput>(key: K, value: CameraInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const rtspUrl = form.rtsp_url.trim();
    const location = form.location.trim();
    const cameraId = form.id?.trim();

    if (!name) {
      setError("Vui lòng nhập tên camera.");
      return;
    }
    if (!rtspUrl) {
      setError("Vui lòng nhập luồng RTSP hoặc số hiệu webcam (0).");
      return;
    }
    if (!location) {
      setError("Vui lòng nhập vị trí lắp đặt camera.");
      return;
    }
    if (!Number.isFinite(form.fps_limit) || form.fps_limit < 1 || form.fps_limit > 60) {
      setError("FPS phải nằm trong khoảng 1 - 60.");
      return;
    }

    const payload: CameraInput = {
      ...(cameraId ? { id: cameraId } : {}),
      name,
      camera_type: form.camera_type,
      rtsp_url: rtspUrl,
      location,
      resolution: form.resolution,
      fps_limit: Math.round(form.fps_limit),
      is_active: form.is_active,
    };

    try {
      setSaving(true);
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu cấu hình camera.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5 bg-surface border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-light border border-primary-border text-primary flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base text-content-primary tracking-tight">
                {isEditing ? "Cập nhật Camera" : "Thêm Camera mới"}
              </h2>
              <p className="text-[11px] text-content-muted mt-0.5">
                {isEditing
                  ? `Chỉnh sửa cấu hình kết nối của ${camera?.id}`
                  : "Kết nối luồng RTSP IP Camera hoặc Webcam của máy chủ"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors disabled:opacity-50"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-status-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Camera ID */}
            <div>
              <label className={LABEL_CLASS} htmlFor="camera-id">
                Mã Camera {isEditing ? "" : "(tùy chọn)"}
              </label>
              <input
                id="camera-id"
                type="text"
                value={form.id ?? ""}
                onChange={(event) => update("id", event.target.value)}
                disabled={saving || isEditing}
                placeholder="VD: CAM-IN-01 (bỏ trống để tự sinh)"
                className={`${INPUT_CLASS} font-mono disabled:opacity-60`}
              />
            </div>

            {/* Camera name */}
            <div>
              <label className={LABEL_CLASS} htmlFor="camera-name">
                Tên Camera <span className="text-status-error">*</span>
              </label>
              <input
                id="camera-name"
                type="text"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                disabled={saving}
                placeholder="VD: Camera Cổng Vào Làn 1"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Camera Type */}
          <div>
            <span className={LABEL_CLASS}>Hướng kiểm soát</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {CAMERA_TYPES.map((type) => {
                const selected = form.camera_type === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    disabled={saving}
                    onClick={() => update("camera_type", type.value)}
                    className={`text-left p-3 rounded-xl border transition-all disabled:opacity-60 ${
                      selected
                        ? "bg-primary-light border-primary/50 shadow-xs"
                        : "bg-surface-muted border-border hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-1.5 text-xs font-bold ${
                        selected ? "text-primary" : "text-content-primary"
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      {type.label}
                    </span>
                    <span className="block text-[10px] text-content-muted mt-1 leading-snug">
                      {type.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RTSP URL */}
          <div>
            <label className={LABEL_CLASS} htmlFor="camera-rtsp">
              Luồng kết nối RTSP / Webcam <span className="text-status-error">*</span>
            </label>
            <div className="relative">
              <Link2 className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="camera-rtsp"
                type="text"
                value={form.rtsp_url}
                onChange={(event) => update("rtsp_url", event.target.value)}
                disabled={saving}
                placeholder="rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101"
                className={`${INPUT_CLASS} pl-9 font-mono`}
              />
            </div>
            <p className="text-[10px] text-content-muted mt-1.5 leading-relaxed">
              Nhập <span className="font-mono font-bold">0</span> để dùng webcam của máy chủ Backend.
              Với IP Camera, dùng đúng URL RTSP kèm user/password nếu có.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location */}
            <div>
              <label className={LABEL_CLASS} htmlFor="camera-location">
                Vị trí lắp đặt <span className="text-status-error">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="camera-location"
                  type="text"
                  value={form.location}
                  onChange={(event) => update("location", event.target.value)}
                  disabled={saving}
                  placeholder="VD: Hầm B1 - Làn vào"
                  className={`${INPUT_CLASS} pl-9`}
                />
              </div>
            </div>

            {/* Resolution */}
            <div>
              <label className={LABEL_CLASS} htmlFor="camera-resolution">
                Độ phân giải
              </label>
              <div className="relative">
                <Monitor className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="camera-resolution"
                  value={form.resolution}
                  onChange={(event) => update("resolution", event.target.value)}
                  disabled={saving}
                  className={`${INPUT_CLASS} pl-9`}
                >
                  {RESOLUTIONS.map((resolution) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            {/* FPS */}
            <div>
              <label className={LABEL_CLASS} htmlFor="camera-fps">
                Giới hạn FPS xử lý
              </label>
              <div className="relative">
                <Gauge className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="camera-fps"
                  type="number"
                  min={1}
                  max={60}
                  value={form.fps_limit}
                  onChange={(event) => update("fps_limit", Number(event.target.value))}
                  disabled={saving}
                  className={`${INPUT_CLASS} pl-9 font-mono`}
                />
              </div>
            </div>

            {/* Active switch */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-muted border border-border">
              <div>
                <p className="text-xs font-bold text-content-primary">Kích hoạt camera</p>
                <p className="text-[10px] text-content-muted mt-0.5">
                  {form.is_active ? "Đang hoạt động" : "Tạm dừng nhận tín hiệu"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(form.is_active)}
                disabled={saving}
                onClick={() => update("is_active", form.is_active ? 0 : 1)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                  form.is_active ? "bg-primary" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    form.is_active ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-border/80">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold rounded-xl bg-surface border border-border text-content-secondary hover:bg-surface-muted transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{saving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Thêm Camera"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
