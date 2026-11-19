"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Camera as CameraIcon,
  CameraOff,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { API_BASE_URL, alprApi } from "@/lib/api";
import { CameraInput, CameraType, ParkingCamera } from "@/types";
import { CameraCard, CameraTestState } from "@/components/cameras/CameraCard";
import { CameraFormModal } from "@/components/cameras/CameraFormModal";
import { EmptyState } from "@/components/shared/EmptyState";

type CameraFilter = "ALL" | CameraType;

interface Notice {
  type: "success" | "error";
  message: string;
}

const FILTERS: Array<{ value: CameraFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "ENTRY", label: "Làn vào" },
  { value: "EXIT", label: "Làn ra" },
  { value: "TWO_WAY", label: "Hai chiều" },
];

function toPayload(camera: ParkingCamera, overrides?: Partial<CameraInput>): CameraInput {
  return {
    id: camera.id,
    name: camera.name,
    camera_type: camera.camera_type,
    rtsp_url: camera.rtsp_url,
    location: camera.location,
    resolution: camera.resolution,
    fps_limit: camera.fps_limit,
    is_active: camera.is_active,
    ...overrides,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<ParkingCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CameraFilter>("ALL");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<ParkingCamera | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ParkingCamera | null>(null);
  const [previewTarget, setPreviewTarget] = useState<ParkingCamera | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, CameraTestState>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadCameras = useCallback(async () => {
    setLoading(true);
    try {
      setCameras(await alprApi.getParkingCameras());
    } catch (error) {
      setNotice({
        type: "error",
        message: getErrorMessage(error, "Không thể tải danh sách camera từ Backend."),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const stats = useMemo(() => {
    const active = cameras.filter((camera) => camera.is_active === 1).length;
    const entry = cameras.filter((camera) => camera.camera_type === "ENTRY").length;
    const exit = cameras.filter((camera) => camera.camera_type === "EXIT").length;
    const twoWay = cameras.filter((camera) => camera.camera_type === "TWO_WAY").length;
    return { total: cameras.length, active, entry, exit, twoWay };
  }, [cameras]);

  const filteredCameras = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cameras.filter((camera) => {
      const matchesFilter = filter === "ALL" || camera.camera_type === filter;
      if (!matchesFilter) return false;
      if (!query) return true;
      return [camera.id, camera.name, camera.location, camera.rtsp_url]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [cameras, filter, search]);

  const openCreateForm = () => {
    setEditingCamera(null);
    setFormOpen(true);
  };

  const openEditForm = (camera: ParkingCamera) => {
    setEditingCamera(camera);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (busyId) return;
    setFormOpen(false);
    setEditingCamera(null);
  };

  const handleSave = async (payload: CameraInput) => {
    const isEditing = Boolean(editingCamera);
    const saved = await alprApi.createOrUpdateCamera(payload);
    setFormOpen(false);
    setEditingCamera(null);
    setNotice({
      type: "success",
      message: `${isEditing ? "Đã cập nhật" : "Đã thêm"} camera "${saved?.name || payload.name}".`,
    });
    await loadCameras();
  };

  const handleToggleActive = async (camera: ParkingCamera) => {
    setBusyId(camera.id);
    try {
      await alprApi.createOrUpdateCamera(
        toPayload(camera, { is_active: camera.is_active === 1 ? 0 : 1 })
      );
      setNotice({
        type: "success",
        message: `${camera.is_active === 1 ? "Đã tạm dừng" : "Đã kích hoạt"} camera "${camera.name}".`,
      });
      await loadCameras();
    } catch (error) {
      setNotice({
        type: "error",
        message: getErrorMessage(error, "Không thể thay đổi trạng thái camera."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (camera: ParkingCamera) => {
    setTests((prev) => ({ ...prev, [camera.id]: { status: "testing" } }));
    try {
      const result = await alprApi.testCameraConnection(camera.id);
      setTests((prev) => ({
        ...prev,
        [camera.id]: {
          status: result.connected ? "success" : "error",
          message: result.message,
        },
      }));
    } catch (error) {
      setTests((prev) => ({
        ...prev,
        [camera.id]: {
          status: "error",
          message: getErrorMessage(error, "Không thể kiểm tra kết nối camera."),
        },
      }));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setBusyId(deleteTarget.id);
    try {
      await alprApi.deleteCamera(deleteTarget.id);
      setNotice({
        type: "success",
        message: `Đã xóa camera "${deleteTarget.name}".`,
      });
      setDeleteTarget(null);
      setTests((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      await loadCameras();
    } catch (error) {
      setNotice({
        type: "error",
        message: getErrorMessage(error, "Không thể xóa camera."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = (camera: ParkingCamera) => {
    setPreviewTarget(camera);
    setPreviewNonce((value) => value + 1);
    setPreviewError(null);
    setPreviewLoading(true);
  };

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const refreshPreview = () => {
    setPreviewNonce((value) => value + 1);
    setPreviewError(null);
    setPreviewLoading(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight">
            Camera Giám sát
          </h1>
          <p className="text-xs text-content-muted mt-1">
            Kết nối và quản lý luồng RTSP / Webcam tại các làn xe vào – ra của bãi xe
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Camera</span>
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          className={`flex items-start gap-2.5 p-3.5 rounded-bento border text-xs shadow-xs animate-in fade-in slide-in-from-top-2 duration-150 ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-status-error"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto p-0.5 rounded hover:bg-black/5 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tổng Camera", value: stats.total, hint: "Đã cấu hình", color: "text-primary" },
          { label: "Đang hoạt động", value: stats.active, hint: "Sẵn sàng nhận tín hiệu", color: "text-status-success" },
          { label: "Làn vào", value: stats.entry, hint: "Camera ENTRY", color: "text-emerald-600" },
          { label: "Làn ra", value: stats.exit, hint: "Camera EXIT", color: "text-rose-600" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-surface border border-border rounded-bento p-4 shadow-bento"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
              {item.label}
            </p>
            <p className={`font-heading font-black text-2xl mt-2 font-mono ${item.color}`}>
              {item.value}
            </p>
            <p className="text-[10px] text-content-muted mt-1">{item.hint}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-bento p-4 shadow-bento flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên, mã camera, vị trí hoặc RTSP..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            const count =
              item.value === "ALL"
                ? stats.total
                : item.value === "ENTRY"
                  ? stats.entry
                  : item.value === "EXIT"
                    ? stats.exit
                    : stats.twoWay;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  active
                    ? "bg-primary text-white border-primary shadow-xs"
                    : "bg-surface-muted text-content-secondary border-border hover:bg-slate-200/70"
                }`}
              >
                {item.label} ({count})
              </button>
            );
          })}

          <button
            type="button"
            onClick={loadCameras}
            disabled={loading}
            className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted border border-transparent hover:border-border transition-colors disabled:opacity-50"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {/* Camera list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-black text-base text-content-primary tracking-tight">
            Danh sách Camera
          </h2>
          <span className="text-[11px] font-semibold text-content-muted">
            {filteredCameras.length} / {stats.total} camera
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="bg-surface border border-border rounded-bento p-5 shadow-bento animate-pulse space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-200" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-2/3 rounded bg-slate-200" />
                    <div className="h-2.5 w-1/3 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                <div className="h-2.5 w-3/4 rounded bg-slate-100" />
                <div className="h-9 rounded-lg bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filteredCameras.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredCameras.map((camera) => (
              <CameraCard
                key={camera.id}
                camera={camera}
                test={tests[camera.id]}
                busy={busyId === camera.id || deleteTarget?.id === camera.id}
                onTest={() => handleTest(camera)}
                onPreview={() => openPreview(camera)}
                onEdit={() => openEditForm(camera)}
                onDelete={() => setDeleteTarget(camera)}
                onToggleActive={() => handleToggleActive(camera)}
              />
            ))}
          </div>
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={CameraOff}
            title="Chưa có Camera nào được cấu hình"
            description="Thêm Camera IP (RTSP) hoặc Webcam của máy chủ để bắt đầu nhận diện biển số tại cổng bãi xe."
            actionText="Thêm Camera đầu tiên"
            onAction={openCreateForm}
          />
        ) : (
          <EmptyState
            icon={CameraOff}
            title="Không tìm thấy Camera phù hợp"
            description="Thử xóa từ khóa tìm kiếm hoặc chọn bộ lọc khác để xem danh sách camera."
            actionText="Xóa bộ lọc"
            onAction={() => {
              setSearch("");
              setFilter("ALL");
            }}
          />
        )}
      </div>

      {/* Create / Edit modal */}
      <CameraFormModal
        open={formOpen}
        camera={editingCamera}
        onClose={closeForm}
        onSave={handleSave}
      />

      {/* Snapshot preview modal */}
      {previewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={closePreview}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary-light border border-primary-border text-primary flex items-center justify-center shrink-0">
                  <CameraIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-bold text-sm text-content-primary truncate">
                    {previewTarget.name}
                  </h3>
                  <p className="text-[10px] font-mono text-content-muted truncate">
                    {previewTarget.id} • {previewTarget.location}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={refreshPreview}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-light hover:bg-primary text-primary hover:text-white text-[11px] font-semibold rounded-lg border border-primary-border transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? "animate-spin" : ""}`} />
                  <span>Chụp lại</span>
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
                  title="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative bg-slate-950 min-h-[280px] sm:min-h-[400px] flex items-center justify-center">
              {previewError ? (
                <div className="p-8 text-center space-y-3">
                  <CameraOff className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">
                    Không lấy được hình ảnh từ camera
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-md">{previewError}</p>
                  <button
                    type="button"
                    onClick={refreshPreview}
                    className="mt-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <>
                  {previewLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
                      <Loader2 className="w-7 h-7 animate-spin text-primary" />
                      <p className="text-[11px] font-mono">Đang kết nối và chụp ảnh từ camera...</p>
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={previewNonce}
                    src={`${API_BASE_URL}/parking/cameras/${encodeURIComponent(previewTarget.id)}/snapshot?t=${previewNonce}`}
                    alt={`Ảnh chụp từ ${previewTarget.name}`}
                    className={`w-full max-h-[70vh] object-contain transition-opacity ${
                      previewLoading ? "opacity-0" : "opacity-100"
                    }`}
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => {
                      setPreviewLoading(false);
                      setPreviewError(
                        "Backend không trả về được khung hình. Kiểm tra RTSP URL, nguồn điện camera và kết nối mạng."
                      );
                    }}
                  />
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border/80 flex items-center justify-between gap-3">
              <p className="text-[10px] text-content-muted font-mono truncate">
                {previewTarget.rtsp_url === "0"
                  ? "Nguồn: Webcam máy chủ (0)"
                  : previewTarget.rtsp_url.replace(
                      /(rtsp?:\/\/[^:/@\s]+:)[^@\s]+@/i,
                      "$1••••••@"
                    )}
              </p>
              <span className="text-[10px] text-content-muted shrink-0">
                Ảnh chụp trực tiếp • {previewTarget.resolution}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (busyId !== deleteTarget.id) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 text-status-error flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-black text-lg text-content-primary tracking-tight">
              Xóa camera này?
            </h3>
            <p className="text-xs text-content-secondary leading-relaxed mt-2">
              Camera <span className="font-bold">{deleteTarget.name}</span> (
              <span className="font-mono">{deleteTarget.id}</span>) sẽ bị xóa khỏi hệ thống. Các
              phiên gửi xe đã ghi nhận trước đó vẫn được giữ lại.
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-surface border border-border text-content-secondary hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busyId === deleteTarget.id}
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-status-error hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {busyId === deleteTarget.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{busyId === deleteTarget.id ? "Đang xóa..." : "Xóa Camera"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
