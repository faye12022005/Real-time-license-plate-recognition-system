"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Globe,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Smartphone,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { addConfiguredCamera, testCameraStream, type CameraDevice, type TestStreamResult } from "@/lib/cameraApi";

interface AddHttpCameraModalProps {
  open: boolean;
  onClose: () => void;
  onCameraAdded: (camera: CameraDevice) => void;
}

export function AddHttpCameraModal({
  open,
  onClose,
  onCameraAdded,
}: AddHttpCameraModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cameraType, setCameraType] = useState<"ENTRY" | "EXIT" | "TWO_WAY">("ENTRY");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestStreamResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!open) return null;

  const handleTestConnection = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setTestResult({
        ok: false,
        connected: false,
        width: 0,
        height: 0,
        fps: 0,
        message: "Vui lòng nhập đường dẫn HTTP hoặc RTSP của camera.",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const res = await testCameraStream(cleanUrl, 6);
      setTestResult(res);
      if (res.connected && !name.trim()) {
        // Auto suggest name
        if (cleanUrl.toLowerCase().includes("8080") || cleanUrl.toLowerCase().includes("4747")) {
          setName("Camera Điện Thoại");
        } else {
          setName("Camera IP");
        }
      }
    } catch (err) {
      setTestResult({
        ok: false,
        connected: false,
        width: 0,
        height: 0,
        fps: 0,
        message: err instanceof Error ? err.message : "Không thể kết nối tới luồng camera.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    const cleanName = name.trim() || "Camera HTTP";

    if (!cleanUrl) {
      setSaveError("Vui lòng nhập đường dẫn camera.");
      return;
    }

    // Must be tested and connected
    if (!testResult?.connected) {
      setSaveError("Vui lòng bấm 'Kiểm tra kết nối' thành công trước khi lưu camera.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await addConfiguredCamera({
        name: cleanName,
        source: cleanUrl,
        camera_type: cameraType,
      });

      const newDevice: CameraDevice = {
        id: res.camera?.id || `CAM-${Date.now()}`,
        index: res.camera?.id || cleanUrl,
        source: cleanUrl,
        name: cleanName,
        type: cleanUrl.toLowerCase().startsWith("http") ? "http" : "rtsp",
        width: testResult.width || 1920,
        height: testResult.height || 1080,
        fps: testResult.fps || 25,
        available: true,
        previewing: false,
        in_use: false,
        is_configured: true,
      };

      onCameraAdded(newDevice);
      // Reset form
      setName("");
      setUrl("");
      setTestResult(null);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Lỗi khi lưu camera.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-content-primary">
                Thêm Camera bằng link HTTP / RTSP
              </h3>
              <p className="text-[11px] text-content-muted">
                Kiểm tra kết nối và thêm camera mạng hoặc camera điện thoại vào hệ thống
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Tên camera */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary mb-1.5">
              Tên gợi nhớ cho Camera
            </label>
            <div className="relative">
              <Camera className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Camera Điện Thoại, Camera Cổng Vào Làn 1..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface transition-colors"
              />
            </div>
          </div>

          {/* Đường dẫn link HTTP / RTSP */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-content-secondary">
                Đường dẫn luồng video (HTTP / RTSP)
              </label>
              <span className="text-[10px] text-primary font-semibold">Bắt buộc</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Wifi className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (testResult) setTestResult(null); // Reset test on URL change
                  }}
                  placeholder="http://192.168.1.15:8080/video"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface transition-colors"
                />
              </div>

              {/* Nút Kiểm tra kết nối */}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !url.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-100 text-xs font-bold transition disabled:opacity-50 shrink-0 shadow-2xs"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{testing ? "Đang test..." : "Kiểm tra kết nối"}</span>
              </button>
            </div>

            {/* Gợi ý định dạng URL */}
            <div className="mt-2.5 p-2.5 rounded-xl bg-surface-muted/60 border border-border text-[11px] space-y-1.5">
              <div className="flex items-center gap-1 text-content-secondary font-semibold">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                <span>Cách dùng điện thoại làm Camera:</span>
              </div>
              <p className="text-[10px] text-content-muted leading-relaxed">
                1. Cài app <b>IP Webcam</b> (Android) hoặc <b>DroidCam</b>. Bấm <i>Start server</i>.<br />
                2. Nhập URL dạng: <code className="text-primary font-mono font-bold">http://&lt;IP_điện_thoại&gt;:8080/video</code> (điện thoại và máy tính cần cùng mạng Wi-Fi).
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-content-muted">Điền mẫu:</span>
                <button
                  type="button"
                  onClick={() => {
                    setUrl("http://192.168.1.15:8080/video");
                    setName("Camera Điện Thoại (IP Webcam)");
                    setTestResult(null);
                  }}
                  className="px-2 py-0.5 rounded bg-surface hover:bg-slate-200 border border-border text-[10px] font-mono text-content-primary transition"
                >
                  :8080/video
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUrl("http://192.168.1.20:4747/video");
                    setName("Camera DroidCam");
                    setTestResult(null);
                  }}
                  className="px-2 py-0.5 rounded bg-surface hover:bg-slate-200 border border-border text-[10px] font-mono text-content-primary transition"
                >
                  :4747/video
                </button>
              </div>
            </div>
          </div>

          {/* Khu vực hiển thị kết quả kiểm tra kết nối */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs animate-in fade-in flex items-start gap-2.5 ${
                testResult.connected
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-red-50 border-red-300 text-red-800"
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  {testResult.connected
                    ? "Kết nối thành công tới Camera!"
                    : "Kiểm tra kết nối thất bại"}
                </p>
                <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                  {testResult.message}
                </p>
                {testResult.connected && (
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono font-bold text-emerald-700">
                    <span className="px-1.5 py-0.5 bg-emerald-100 rounded">
                      {testResult.width}×{testResult.height}
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-100 rounded">
                      {testResult.fps} FPS
                    </span>
                    <span className="text-emerald-600">✓ Sẵn sàng nhận diện</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lỗi khi lưu nếu có */}
          {saveError && (
            <div className="p-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-content-secondary hover:text-content-primary hover:bg-surface-muted rounded-xl transition-colors"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={saving || !testResult?.connected}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-sm transition-all ${
                testResult?.connected
                  ? "bg-primary hover:bg-primary-hover text-white cursor-pointer hover:scale-[1.02]"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed"
              }`}
              title={
                testResult?.connected
                  ? "Lưu camera vào hệ thống"
                  : "Vui lòng bấm Kiểm tra kết nối thành công trước khi lưu"
              }
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Xác nhận Thêm Camera</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
