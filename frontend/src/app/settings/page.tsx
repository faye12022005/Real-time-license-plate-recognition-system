"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { alprApi } from "@/lib/api";
import {
  AISettings,
  BuildingSettings,
  CleanupResult,
  DatabaseStatus,
  ParkingSettings,
  ParkingTariffSettings,
  SecuritySettings,
  StorageSettings,
  StorageUsage,
  SystemSettings,
} from "@/types";
import {
  AlertTriangle,
  Bike,
  Building2,
  Car,
  CheckCircle2,
  Database,
  Download,
  Gauge,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

type SettingsTab = "parking" | "ai" | "security" | "storage" | "system";

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ElementType }> = [
  { id: "parking", label: "Bãi xe & Bảng giá", icon: Car },
  { id: "ai", label: "AI & Barie", icon: Sparkles },
  { id: "security", label: "An ninh", icon: ShieldAlert },
  { id: "storage", label: "Lưu trữ", icon: HardDrive },
  { id: "system", label: "Tòa nhà & Database", icon: Database },
];

const FALLBACK_SETTINGS: SystemSettings = {
  parking: {
    tariff: {
      motorcycle_day: 3000,
      motorcycle_night: 6000,
      car_first_2h: 20000,
      car_extra_hour: 10000,
      bicycle_day: 1000,
      bicycle_night: 2000,
      electric_day: 2000,
      electric_night: 4000,
    },
    day_start: "06:00",
    night_start: "22:00",
    grace_period_minutes: 15,
    max_capacity: { car: 500, motorcycle: 1500 },
  },
  ai: {
    auto_open_enabled: true,
    auto_open_min_confidence: 90,
    barrier_open_seconds: 5,
    min_confidence: 80,
    plate_tolerance: 1,
    evidence_mode: "both",
  },
  security: {
    blacklist_plates: [],
    mismatch_alert: true,
    vehicle_type_mismatch_alert: true,
    overstay_alert_days: 3,
  },
  storage: {
    auto_cleanup_enabled: false,
    video_retention_days: 30,
    crop_retention_days: 90,
  },
  building: {
    name: "Chung cư Sunrise City - Tháp A",
    hotline: "1900 1234",
    shift_name: "Ca trực bảo vệ",
  },
};

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-content-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";
const LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-[0.12em] text-content-muted";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(Number.isFinite(value) ? value : 0) + " đ";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function parseBlacklist(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,;]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {hint ? <p className="text-[10px] leading-relaxed text-content-muted">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-muted/60 p-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-content-primary">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-content-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="font-heading text-sm font-bold text-content-primary">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-content-muted">{description}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("parking");
  const [settings, setSettings] = useState<SystemSettings>(FALLBACK_SETTINGS);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [blacklistText, setBlacklistText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);

  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const applySettings = useCallback((next: SystemSettings) => {
    setSettings(next);
    setBlacklistText((next.security.blacklist_plates || []).join("\n"));
    setInitialSnapshot(
      JSON.stringify({
        ...next,
        security: {
          ...next.security,
          blacklist_plates: next.security.blacklist_plates || [],
        },
      })
    );
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await alprApi.getSettings();
      applySettings(data);
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Không thể tải cấu hình từ Backend.",
      });
      applySettings(FALLBACK_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, [applySettings]);

  const loadStorage = useCallback(async () => {
    setStorageLoading(true);
    try {
      setStorage(await alprApi.getStorageUsage());
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Không thể đọc dung lượng lưu trữ.",
      });
    } finally {
      setStorageLoading(false);
    }
  }, []);

  const loadDatabaseStatus = useCallback(async () => {
    setDbLoading(true);
    try {
      setDbStatus(await alprApi.getDatabaseStatus());
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Không thể kiểm tra kết nối database.",
      });
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadStorage();
    void loadDatabaseStatus();
  }, [loadSettings, loadStorage, loadDatabaseStatus]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        ...settings,
        security: {
          ...settings.security,
          blacklist_plates: parseBlacklist(blacklistText),
        },
      }),
    [settings, blacklistText]
  );

  const isDirty = Boolean(initialSnapshot) && currentSnapshot !== initialSnapshot;

  const updateParking = (patch: Partial<ParkingSettings>) => {
    setSettings((prev) => ({ ...prev, parking: { ...prev.parking, ...patch } }));
  };

  const updateTariff = (patch: Partial<ParkingTariffSettings>) => {
    setSettings((prev) => ({
      ...prev,
      parking: { ...prev.parking, tariff: { ...prev.parking.tariff, ...patch } },
    }));
  };

  const updateAI = (patch: Partial<AISettings>) => {
    setSettings((prev) => ({ ...prev, ai: { ...prev.ai, ...patch } }));
  };

  const updateSecurity = (patch: Partial<SecuritySettings>) => {
    setSettings((prev) => ({ ...prev, security: { ...prev.security, ...patch } }));
  };

  const updateStorageSettings = (patch: Partial<StorageSettings>) => {
    setSettings((prev) => ({ ...prev, storage: { ...prev.storage, ...patch } }));
  };

  const updateBuilding = (patch: Partial<BuildingSettings>) => {
    setSettings((prev) => ({ ...prev, building: { ...prev.building, ...patch } }));
  };

  const persist = async (): Promise<SystemSettings | null> => {
    setIsSaving(true);
    try {
      const payload: SystemSettings = {
        ...settings,
        security: {
          ...settings.security,
          blacklist_plates: parseBlacklist(blacklistText),
        },
      };
      const saved = await alprApi.updateSettings(payload);
      applySettings(saved);
      setNotice({ type: "success", message: "Đã lưu cấu hình hệ thống." });
      return saved;
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Lưu cấu hình thất bại.",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanup = async () => {
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const payload: SystemSettings = {
        ...settings,
        security: {
          ...settings.security,
          blacklist_plates: parseBlacklist(blacklistText),
        },
      };
      const result = await alprApi.cleanupStorage(payload);
      setCleanupResult(result);
      setNotice({ type: "success", message: result.message });
      await loadStorage();
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Dọn dẹp thất bại.",
      });
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const blob = await alprApi.downloadDatabaseBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `alpr_backup_${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: "success", message: "Đã tạo và tải file backup database." });
    } catch (error: any) {
      setNotice({
        type: "error",
        message: error?.message || "Sao lưu database thất bại.",
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const totalCapacity = settings.parking.max_capacity.car + settings.parking.max_capacity.motorcycle;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-black tracking-tight text-content-primary">
            <SlidersHorizontal className="h-6 w-6 text-primary" />
            Cấu hình hệ thống
          </h1>
          <p className="mt-1 text-xs text-content-muted">
            Bảng giá bãi xe, ngưỡng AI, an ninh, lưu trữ và thông tin tòa nhà.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="rounded-full border border-status-warning/30 bg-status-warning/10 px-2.5 py-1 text-[10px] font-bold text-status-warning">
              Có thay đổi chưa lưu
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void persist()}
            disabled={isSaving || isLoading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình
          </button>
        </div>
      </div>

      {notice ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
            notice.type === "success"
              ? "border-status-success/30 bg-status-success/10 text-status-success"
              : "border-status-error/30 bg-status-error/10 text-status-error"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {notice.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-bento border border-border bg-surface p-2 shadow-bento lg:sticky lg:top-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                  active
                    ? "border border-primary-border bg-primary-light text-primary"
                    : "text-content-secondary hover:bg-surface-muted hover:text-content-primary"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-content-muted"}`} />
                {tab.label}
              </button>
            );
          })}
        </aside>

        <main className="min-w-0 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-bento border border-border bg-surface p-12 text-xs text-content-muted shadow-bento">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải cấu hình...
            </div>
          ) : null}

          {!isLoading && activeTab === "parking" ? (
            <section className="space-y-5 rounded-bento border border-border bg-surface p-5 shadow-bento">
              <SectionHeader
                icon={Car}
                title="Bãi xe & Bảng giá cước phí"
                description="Cấu hình giá vé lượt, khung giờ ngày/đêm, thời gian miễn phí và sức chứa bãi xe."
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-content-primary">
                    <Bike className="h-4 w-4 text-primary" /> Xe máy
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Giá ban ngày">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.motorcycle_day}
                        onChange={(event) => updateTariff({ motorcycle_day: Number(event.target.value) })}
                      />
                      <p className="mt-1 text-[10px] text-content-muted">{formatVnd(settings.parking.tariff.motorcycle_day)}</p>
                    </Field>
                    <Field label="Giá ban đêm">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.motorcycle_night}
                        onChange={(event) => updateTariff({ motorcycle_night: Number(event.target.value) })}
                      />
                      <p className="mt-1 text-[10px] text-content-muted">{formatVnd(settings.parking.tariff.motorcycle_night)}</p>
                    </Field>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-content-primary">
                    <Car className="h-4 w-4 text-primary" /> Ô tô
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="2 giờ đầu">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.car_first_2h}
                        onChange={(event) => updateTariff({ car_first_2h: Number(event.target.value) })}
                      />
                      <p className="mt-1 text-[10px] text-content-muted">{formatVnd(settings.parking.tariff.car_first_2h)}</p>
                    </Field>
                    <Field label="Mỗi giờ tiếp theo">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.car_extra_hour}
                        onChange={(event) => updateTariff({ car_extra_hour: Number(event.target.value) })}
                      />
                      <p className="mt-1 text-[10px] text-content-muted">{formatVnd(settings.parking.tariff.car_extra_hour)}</p>
                    </Field>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-content-primary">
                    <Bike className="h-4 w-4 text-status-info" /> Xe đạp
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Giá ban ngày">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.bicycle_day}
                        onChange={(event) => updateTariff({ bicycle_day: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Giá ban đêm">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.bicycle_night}
                        onChange={(event) => updateTariff({ bicycle_night: Number(event.target.value) })}
                      />
                    </Field>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-content-primary">
                    <Zap className="h-4 w-4 text-status-warning" /> Xe điện
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Giá ban ngày">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.electric_day}
                        onChange={(event) => updateTariff({ electric_day: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Giá ban đêm">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={INPUT_CLASS}
                        value={settings.parking.tariff.electric_night}
                        onChange={(event) => updateTariff({ electric_night: Number(event.target.value) })}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Bắt đầu ca ngày" hint="Mốc chuyển từ giá đêm sang giá ngày.">
                  <input
                    type="time"
                    className={INPUT_CLASS}
                    value={settings.parking.day_start}
                    onChange={(event) => updateParking({ day_start: event.target.value })}
                  />
                </Field>
                <Field label="Bắt đầu ca đêm" hint="Mốc chuyển từ giá ngày sang giá đêm.">
                  <input
                    type="time"
                    className={INPUT_CLASS}
                    value={settings.parking.night_start}
                    onChange={(event) => updateParking({ night_start: event.target.value })}
                  />
                </Field>
                <Field label="Miễn phí (Grace period)" hint="Số phút miễn phí nếu xe vào và ra trong cùng khung.">
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={120}
                      className={INPUT_CLASS}
                      value={settings.parking.grace_period_minutes}
                      onChange={(event) => updateParking({ grace_period_minutes: Number(event.target.value) })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-content-muted">
                      phút
                    </span>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Sức chứa tối đa - Ô tô">
                  <input
                    type="number"
                    min={0}
                    className={INPUT_CLASS}
                    value={settings.parking.max_capacity.car}
                    onChange={(event) =>
                      updateParking({
                        max_capacity: { ...settings.parking.max_capacity, car: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field label="Sức chứa tối đa - Xe máy">
                  <input
                    type="number"
                    min={0}
                    className={INPUT_CLASS}
                    value={settings.parking.max_capacity.motorcycle}
                    onChange={(event) =>
                      updateParking({
                        max_capacity: { ...settings.parking.max_capacity, motorcycle: Number(event.target.value) },
                      })
                    }
                  />
                </Field>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-primary-border bg-primary-light/60 px-4 py-3 text-[11px] text-content-secondary">
                <Gauge className="h-4 w-4 text-primary" />
                Tổng sức chứa cấu hình: <strong className="text-content-primary">{totalCapacity.toLocaleString("vi-VN")}</strong> chỗ đỗ.
                Dashboard sẽ cảnh báo khi tỷ lệ lấp đầy vượt 85%.
              </div>
            </section>
          ) : null}

          {!isLoading && activeTab === "ai" ? (
            <section className="space-y-5 rounded-bento border border-border bg-surface p-5 shadow-bento">
              <SectionHeader
                icon={Sparkles}
                title="Cấu hình AI & Tự động mở Barie"
                description="Ngưỡng nhận diện, dung sai ký tự và cơ chế mở cổng tự động cho xe cư dân."
              />

              <Toggle
                checked={settings.ai.auto_open_enabled}
                onChange={(value) => updateAI({ auto_open_enabled: value })}
                title="Tự động mở barie"
                description="Kích hoạt mở cổng khi biển số khớp xe cư dân và độ tin cậy đạt ngưỡng."
              />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <Field
                    label={`Ngưỡng mở barie tự động: ${settings.ai.auto_open_min_confidence}%`}
                    hint="Chỉ mở cổng khi AI đạt độ tin cậy tối thiểu này."
                  >
                    <input
                      type="range"
                      min={70}
                      max={100}
                      step={1}
                      className="w-full accent-primary"
                      value={settings.ai.auto_open_min_confidence}
                      onChange={(event) => updateAI({ auto_open_min_confidence: Number(event.target.value) })}
                    />
                  </Field>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <Field
                    label={`Ngưỡng nhận diện tối thiểu: ${settings.ai.min_confidence}%`}
                    hint="Biển số dưới ngưỡng này sẽ bị bỏ qua khi đối soát."
                  >
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={1}
                      className="w-full accent-primary"
                      value={settings.ai.min_confidence}
                      onChange={(event) => updateAI({ min_confidence: Number(event.target.value) })}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Thời gian giữ mở barie" hint="Barie tự đóng sau số giây này.">
                  <select
                    className={INPUT_CLASS}
                    value={settings.ai.barrier_open_seconds}
                    onChange={(event) => updateAI({ barrier_open_seconds: Number(event.target.value) })}
                  >
                    {[3, 5, 10, 15, 20].map((value) => (
                      <option key={value} value={value}>
                        {value} giây
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Sai số ký tự cho phép" hint="Số ký tự được phép lệch khi đối soát biển số vào/ra.">
                  <select
                    className={INPUT_CLASS}
                    value={settings.ai.plate_tolerance}
                    onChange={(event) => updateAI({ plate_tolerance: Number(event.target.value) })}
                  >
                    {[0, 1, 2].map((value) => (
                      <option key={value} value={value}>
                        {value} ký tự
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Chế độ chụp ảnh bằng chứng">
                  <select
                    className={INPUT_CLASS}
                    value={settings.ai.evidence_mode}
                    onChange={(event) =>
                      updateAI({ evidence_mode: event.target.value as AISettings["evidence_mode"] })
                    }
                  >
                    <option value="crop">Chỉ crop biển số</option>
                    <option value="full">Chỉ toàn cảnh xe</option>
                    <option value="both">Cả crop biển số + toàn cảnh</option>
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-border bg-surface-muted/50 p-4 text-[11px] leading-relaxed text-content-muted">
                <strong className="text-content-primary">Cơ chế hiện tại:</strong> khi xe vào/ra, hệ thống chụp ảnh theo chế độ đã chọn,
                nhận diện biển số, so khớp với danh sách xe cư dân. Nếu biển số khớp và độ tin cậy ≥{" "}
                <strong className="text-content-primary">{settings.ai.auto_open_min_confidence}%</strong> thì gửi lệnh mở barie
                trong <strong className="text-content-primary">{settings.ai.barrier_open_seconds} giây</strong>.
              </div>
            </section>
          ) : null}

          {!isLoading && activeTab === "security" ? (
            <section className="space-y-5 rounded-bento border border-border bg-surface p-5 shadow-bento">
              <SectionHeader
                icon={ShieldAlert}
                title="Cảnh báo an ninh & Danh sách đen"
                description="Theo dõi biển số bị cấm, cảnh báo lệch biển số và xe gửi quá hạn."
              />

              <Field
                label="Biển số danh sách đen"
                hint="Mỗi dòng một biển số. Hệ thống sẽ cảnh báo đỏ khi phát hiện xe này vào cổng."
              >
                <textarea
                  rows={5}
                  className={`${INPUT_CLASS} font-mono`}
                  placeholder={"51F-999.99\n29A-123.45"}
                  value={blacklistText}
                  onChange={(event) => setBlacklistText(event.target.value)}
                />
              </Field>

              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
                <div>
                  <p className="text-xs font-bold text-content-primary">Số biển số trong danh sách đen</p>
                  <p className="mt-0.5 text-[10px] text-content-muted">Tự động chuẩn hóa và loại bỏ trùng lặp khi lưu.</p>
                </div>
                <span className="rounded-full bg-status-error/10 px-3 py-1 font-mono text-sm font-black text-status-error">
                  {parseBlacklist(blacklistText).length}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Toggle
                  checked={settings.security.mismatch_alert}
                  onChange={(value) => updateSecurity({ mismatch_alert: value })}
                  title="Cảnh báo lệch biển số"
                  description="Báo động khi biển số lúc ra khác với biển số lúc vào."
                />
                <Toggle
                  checked={settings.security.vehicle_type_mismatch_alert}
                  onChange={(value) => updateSecurity({ vehicle_type_mismatch_alert: value })}
                  title="Cảnh báo lệch loại xe"
                  description="Báo động khi loại phương tiện lúc vào và lúc ra không khớp."
                />
              </div>

              <Field label="Cảnh báo xe gửi quá hạn" hint="Xe đỗ liên tục quá số ngày này sẽ được đưa vào danh sách cảnh báo.">
                <div className="relative max-w-xs">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className={INPUT_CLASS}
                    value={settings.security.overstay_alert_days}
                    onChange={(event) => updateSecurity({ overstay_alert_days: Number(event.target.value) })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-content-muted">
                    ngày
                  </span>
                </div>
              </Field>
            </section>
          ) : null}

          {!isLoading && activeTab === "storage" ? (
            <section className="space-y-5 rounded-bento border border-border bg-surface p-5 shadow-bento">
              <SectionHeader
                icon={HardDrive}
                title="Quản lý ổ cứng & Dọn dẹp dữ liệu"
                description="Theo dõi dung lượng media và tự động xóa video/ảnh cũ theo thời hạn."
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  { key: "sample_videos", label: "Video upload / đã xử lý", icon: HardDrive },
                  { key: "captures", label: "Ảnh crop biển số", icon: Car },
                  { key: "parking_captures", label: "Ảnh bãi xe", icon: Building2 },
                ].map((item) => {
                  const folder = storage?.folders?.[item.key as keyof StorageUsage["folders"]];
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className="rounded-xl border border-border bg-surface-muted/40 p-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-content-muted">
                        <Icon className="h-3.5 w-3.5" /> {item.label}
                      </div>
                      <p className="mt-2 font-mono text-lg font-black text-content-primary">
                        {storageLoading ? "..." : `${folder?.size_mb ?? 0} MB`}
                      </p>
                      <p className="text-[10px] text-content-muted">{folder?.file_count ?? 0} tệp</p>
                    </div>
                  );
                })}
              </div>

              {storage?.disk ? (
                <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-content-primary">Dung lượng ổ đĩa</span>
                    <span className="font-mono text-content-muted">
                      {storage.disk.used_gb} GB / {storage.disk.total_gb} GB
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        storage.disk.used_percent >= 90
                          ? "bg-status-error"
                          : storage.disk.used_percent >= 75
                          ? "bg-status-warning"
                          : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, storage.disk.used_percent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-content-muted">
                    <span>Đã dùng {storage.disk.used_percent}%</span>
                    <span>Còn trống {storage.disk.free_gb} GB</span>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Xóa video gốc / video đã xử lý sau" hint="Áp dụng khi bấm dọn dẹp hoặc bật tự động.">
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className={INPUT_CLASS}
                      value={settings.storage.video_retention_days}
                      onChange={(event) => updateStorageSettings({ video_retention_days: Number(event.target.value) })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-content-muted">
                      ngày
                    </span>
                  </div>
                </Field>
                <Field label="Xóa ảnh crop biển số sau" hint="Bao gồm ảnh captures và parking_captures.">
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      className={INPUT_CLASS}
                      value={settings.storage.crop_retention_days}
                      onChange={(event) => updateStorageSettings({ crop_retention_days: Number(event.target.value) })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-content-muted">
                      ngày
                    </span>
                  </div>
                </Field>
              </div>

              <Toggle
                checked={settings.storage.auto_cleanup_enabled}
                onChange={(value) => updateStorageSettings({ auto_cleanup_enabled: value })}
                title="Tự động dọn dẹp"
                description="Tự động áp dụng thời hạn lưu trữ khi backend chạy tiến trình dọn dẹp định kỳ."
              />

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                <button
                  type="button"
                  onClick={() => void handleCleanup()}
                  disabled={cleanupLoading}
                  className="flex items-center gap-2 rounded-lg bg-status-error px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cleanupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Dọn dẹp thủ công
                </button>
                <button
                  type="button"
                  onClick={() => void loadStorage()}
                  disabled={storageLoading}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-content-secondary transition-colors hover:text-content-primary disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${storageLoading ? "animate-spin" : ""}`} />
                  Làm mới dung lượng
                </button>
                {cleanupResult ? (
                  <span className="text-[11px] font-semibold text-status-success">
                    Đã xóa {cleanupResult.deleted_files} tệp, giải phóng {formatBytes(cleanupResult.freed_bytes)}.
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {!isLoading && activeTab === "system" ? (
            <section className="space-y-5 rounded-bento border border-border bg-surface p-5 shadow-bento">
              <SectionHeader
                icon={Building2}
                title="Thông tin tòa nhà & Database"
                description="Thông tin đơn vị vận hành, trạng thái kết nối và sao lưu cơ sở dữ liệu."
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Tên chung cư / Tòa nhà">
                  <input
                    className={INPUT_CLASS}
                    value={settings.building.name}
                    onChange={(event) => updateBuilding({ name: event.target.value })}
                  />
                </Field>
                <Field label="Hotline bảo vệ">
                  <input
                    className={INPUT_CLASS}
                    value={settings.building.hotline}
                    onChange={(event) => updateBuilding({ hotline: event.target.value })}
                  />
                </Field>
                <Field label="Tên ca trực">
                  <input
                    className={INPUT_CLASS}
                    value={settings.building.shift_name}
                    onChange={(event) => updateBuilding({ shift_name: event.target.value })}
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-border bg-surface-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-content-primary">Trạng thái Database</span>
                    {dbStatus ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          dbStatus.connected
                            ? "bg-status-success/10 text-status-success"
                            : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {dbStatus.connected ? "Đã kết nối" : "Mất kết nối"}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadDatabaseStatus()}
                    disabled={dbLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-bold text-content-secondary transition-colors hover:text-content-primary disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${dbLoading ? "animate-spin" : ""}`} />
                    Kiểm tra kết nối
                  </button>
                </div>

                {dbStatus ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[9px] font-bold uppercase text-content-muted">Engine</p>
                      <p className="mt-1 truncate font-mono text-[11px] font-bold text-content-primary">
                        {dbStatus.engine || "Unknown"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[9px] font-bold uppercase text-content-muted">Database</p>
                      <p className="mt-1 truncate font-mono text-[11px] font-bold text-content-primary">
                        {dbStatus.database || dbStatus.database_path || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[9px] font-bold uppercase text-content-muted">Bản ghi</p>
                      <p className="mt-1 font-mono text-[11px] font-bold text-content-primary">
                        {(dbStatus.total_records ?? 0).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2">
                      <p className="text-[9px] font-bold uppercase text-content-muted">Độ trễ</p>
                      <p className="mt-1 font-mono text-[11px] font-bold text-content-primary">
                        {dbStatus.latency_ms != null ? `${dbStatus.latency_ms} ms` : "—"}
                      </p>
                    </div>
                  </div>
                ) : null}

                {dbStatus?.message ? (
                  <p className={`mt-3 text-[10px] leading-relaxed ${dbStatus.connected ? "text-content-muted" : "text-status-error"}`}>
                    {dbStatus.message}
                  </p>
                ) : null}

                {dbStatus?.tables ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(dbStatus.tables).map(([table, count]) => (
                      <span
                        key={table}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[9px] text-content-secondary"
                      >
                        {table}: <strong className="text-content-primary">{count}</strong>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-muted/40 p-4">
                <button
                  type="button"
                  onClick={() => void handleBackup()}
                  disabled={backupLoading}
                  className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Sao lưu Database (.sql)
                </button>
                <p className="text-[10px] leading-relaxed text-content-muted">
                  Tải bản sao SQL từ database MySQL đang kết nối.
                </p>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
