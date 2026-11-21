"use client";

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SafePlateImage } from "@/components/shared/SafePlateImage";
import { VehicleBadge, PlateBadge } from "@/components/shared/Badge";
import { VideoEvidenceModal } from "@/components/trace/VideoEvidenceModal";
import { alprApi } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import { PlateRecord } from "@/types";
import {
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Film,
  Filter,
  Gauge,
  Loader2,
  MapPin,
  Maximize2,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const CARD_MIN_WIDTH = 200;
const GRID_GAP = 14;
const GRID_PADDING = 32;

interface TraceFilters {
  plate: string;
  channel: string;
  from: string;
  to: string;
  tolerance: number;
}

const EMPTY_FILTERS: TraceFilters = {
  plate: "",
  channel: "ALL",
  from: "",
  to: "",
  tolerance: 3,
};

function normalizePlate(value: string): string {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeQuery(value: string): string {
  return (value || "").toUpperCase().replace(/[^A-Z0-9*]/g, "");
}

function getProvinceFromPlate(plate: string): string {
  const clean = normalizePlate(plate);
  const prefix = clean.slice(0, 2);
  const PROVINCE_MAP: Record<string, string> = {
    "11": "Cao Bằng", "12": "Lạng Sơn", "14": "Quảng Ninh", "15": "Hải Phòng", "16": "Hải Phòng",
    "17": "Thái Bình", "18": "Nam Định", "19": "Phú Thọ", "20": "Thái Nguyên", "21": "Yên Bái",
    "22": "Tuyên Quang", "23": "Hà Giang", "24": "Lào Cai", "25": "Lai Châu", "26": "Sơn La",
    "27": "Điện Biên", "28": "Hòa Bình", "29": "Hà Nội", "30": "Hà Nội", "31": "Hà Nội",
    "32": "Hà Nội", "33": "Hà Nội", "34": "Hải Dương", "35": "Ninh Bình", "36": "Thanh Hóa",
    "37": "Nghệ An", "38": "Hà Tĩnh", "43": "Đà Nẵng", "47": "Đắk Lắk", "48": "Đắk Nông",
    "49": "Lâm Đồng", "50": "TP. Hồ Chí Minh", "51": "TP. Hồ Chí Minh", "52": "TP. Hồ Chí Minh",
    "53": "TP. Hồ Chí Minh", "54": "TP. Hồ Chí Minh", "55": "TP. Hồ Chí Minh", "56": "TP. Hồ Chí Minh",
    "57": "TP. Hồ Chí Minh", "58": "TP. Hồ Chí Minh", "59": "TP. Hồ Chí Minh", "60": "Đồng Nai",
    "61": "Bình Dương", "62": "Long An", "63": "Tiền Giang", "64": "Vĩnh Long", "65": "Cần Thơ",
    "66": "Đồng Tháp", "67": "An Giang", "68": "Kiên Giang", "69": "Cà Mau", "70": "Tây Ninh",
    "71": "Bến Tre", "72": "Bà Rịa - Vũng Tàu", "73": "Quảng Bình", "74": "Quảng Trị", "75": "Thừa Thiên Huế",
    "76": "Quảng Ngãi", "77": "Bình Định", "78": "Phú Yên", "79": "Khánh Hòa", "81": "Gia Lai",
    "82": "Kon Tum", "83": "Sóc Trăng", "84": "Trà Vinh", "85": "Ninh Thuận", "86": "Bình Thuận",
    "88": "Vĩnh Phúc", "89": "Hưng Yên", "90": "Hà Nam", "92": "Quảng Nam", "93": "Bình Phước",
    "94": "Bạc Liêu", "95": "Hậu Giang", "97": "Bắc Kạn", "98": "Bắc Giang", "99": "Bắc Ninh",
  };
  return PROVINCE_MAP[prefix] || "Việt Nam";
}

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[b.length];
}

function matchesPlate(plateNumber: string, rawQuery: string, tolerance: number): boolean {
  const plate = normalizePlate(plateNumber);
  const query = normalizeQuery(rawQuery);
  if (!query) return true;

  if (query.includes("*")) {
    const pattern = query
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`, "i").test(plate);
  }

  if (plate.includes(query)) return true;
  if (tolerance <= 0) return false;

  const minWindow = Math.max(1, query.length - tolerance);
  const maxWindow = Math.min(plate.length, query.length + tolerance);

  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
    for (let start = 0; start + windowSize <= plate.length; start += 1) {
      const candidate = plate.slice(start, start + windowSize);
      if (boundedLevenshtein(query, candidate, tolerance) <= tolerance) {
        return true;
      }
    }
  }

  return false;
}

function isWithinRange(timestamp: string, from: string, to: string): boolean {
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return true;

  if (from) {
    const start = new Date(from).getTime();
    if (!Number.isNaN(start) && value < start) return false;
  }

  if (to) {
    const end = new Date(to).getTime();
    if (!Number.isNaN(end) && value > end) return false;
  }

  return true;
}

function formatDateTime(timestamp?: string | null): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-muted px-2 py-1">
      <dt className="truncate text-[8px] font-bold uppercase tracking-[0.1em] text-content-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-[10px] text-content-primary ${
          mono ? "font-mono" : "font-medium"
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function TraceContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [records, setRecords] = useState<PlateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draftFilters, setDraftFilters] = useState<TraceFilters>({
    ...EMPTY_FILTERS,
    plate: initialQuery,
  });
  const [appliedFilters, setAppliedFilters] = useState<TraceFilters>({
    ...EMPTY_FILTERS,
    plate: initialQuery,
  });
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(18);
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const resultsGridRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videoRecord, setVideoRecord] = useState<PlateRecord | null>(null);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const data = await alprApi.getPlates();
      setRecords(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  // Tính toán số lượng thẻ vừa khít chiều cao và chiều rộng của màn hình Desktop
  useEffect(() => {
    const viewport = resultsViewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const availableWidth = viewport.clientWidth - GRID_PADDING;
      const availableHeight = viewport.clientHeight - GRID_PADDING;
      if (availableWidth < 150 || availableHeight < 150) return;

      const columns = Math.max(
        2,
        Math.floor((availableWidth + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))
      );
      const cardWidth = (availableWidth - (columns - 1) * GRID_GAP) / columns;
      const cardHeight = cardWidth * 0.625 + 92;

      const rows = Math.max(
        1,
        Math.floor((availableHeight + GRID_GAP) / (cardHeight + GRID_GAP))
      );

      const calculatedSize = Math.max(8, columns * rows);
      setPageSize(calculatedSize);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const frame = window.requestAnimationFrame(measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isLoading, records.length]);

  useEffect(() => {
    if (!initialQuery) return;
    setDraftFilters((current) => ({ ...current, plate: initialQuery }));
    setAppliedFilters((current) => ({ ...current, plate: initialQuery }));
    setPage(1);
  }, [initialQuery]);

  const channels = useMemo(
    () =>
      Array.from(
        new Set(records.map((record) => record.job_filename).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [records]
  );

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => {
        if (
          appliedFilters.channel !== "ALL" &&
          record.job_filename !== appliedFilters.channel
        ) {
          return false;
        }

        if (!isWithinRange(record.timestamp, appliedFilters.from, appliedFilters.to)) {
          return false;
        }

        return matchesPlate(
          record.plate_number || record.plate_display,
          appliedFilters.plate,
          appliedFilters.tolerance
        );
      })
      .sort((a, b) => {
        const left = new Date(a.timestamp).getTime() || 0;
        const right = new Date(b.timestamp).getTime() || 0;
        return sortOrder === "desc" ? right - left : left - right;
      });
  }, [records, appliedFilters, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart =
    filteredRecords.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, filteredRecords.length);

  const visibleRecords = useMemo(
    () => filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRecords, safePage, pageSize]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const activeRecord =
    visibleRecords.find((record) => record.id === activeId) ??
    visibleRecords[0] ??
    filteredRecords[0] ??
    null;

  const previewRecord = activeRecord;
  const pageAllSelected =
    visibleRecords.length > 0 &&
    visibleRecords.every((record) => selectedIds.has(record.id));
  const activeFilterCount = [
    appliedFilters.plate.trim(),
    appliedFilters.channel !== "ALL" ? appliedFilters.channel : "",
    appliedFilters.from,
    appliedFilters.to,
  ].filter(Boolean).length;

  const updateDraft = (patch: Partial<TraceFilters>) => {
    setDraftFilters((current) => ({ ...current, ...patch }));
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedFilters({ ...draftFilters });
    setActiveId(null);
    setPage(1);
  };

  // Tối ưu UX bộ lọc: tự động áp dụng sau debounce 0.3s cho text/select,
  // áp dụng ngay khi đã chọn đủ ngày/giờ bắt đầu & kết thúc.
  const previousDraftRef = useRef<TraceFilters>(draftFilters);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = previousDraftRef.current;
    const datesChanged =
      previous.from !== draftFilters.from || previous.to !== draftFilters.to;
    const datesComplete =
      (draftFilters.from === "" && draftFilters.to === "") ||
      (draftFilters.from !== "" && draftFilters.to !== "");

    previousDraftRef.current = draftFilters;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const apply = () => {
      setAppliedFilters({ ...draftFilters });
      setActiveId(null);
      setPage(1);
    };

    if (datesChanged && datesComplete) {
      // Đủ ngày/giờ → tìm kiếm ngay
      apply();
      return;
    }

    if (datesChanged && !datesComplete) {
      // Chưa đủ ngày/giờ → chưa áp dụng
      return;
    }

    // Text/select thay đổi → debounce 0.3s
    debounceTimerRef.current = setTimeout(apply, 300);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [draftFilters]);

  const resetFilters = () => {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setActiveId(null);
    setPage(1);
  };

  const applyPreset = (preset: "today" | "24h" | "7d" | "all") => {
    const now = new Date();
    if (preset === "all") {
      setDraftFilters((c) => ({ ...c, from: "", to: "" }));
      setAppliedFilters((c) => ({ ...c, from: "", to: "" }));
      setPage(1);
      return;
    }
    let fromDate = new Date();
    if (preset === "today") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (preset === "24h") {
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === "7d") {
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    const toStr = now.toISOString().slice(0, 19);
    const fromStr = fromDate.toISOString().slice(0, 19);
    setDraftFilters((c) => ({ ...c, from: fromStr, to: toStr }));
    setAppliedFilters((c) => ({ ...c, from: fromStr, to: toStr }));
    setPage(1);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (pageAllSelected) {
        visibleRecords.forEach((record) => next.delete(record.id));
      } else {
        visibleRecords.forEach((record) => next.add(record.id));
      }
      return next;
    });
  };

  return (
    <div className="flex h-auto flex-col gap-3 min-[960px]:h-[calc(100vh-2rem)] min-[960px]:overflow-hidden">
      {/* Header cố định ở trên, không di chuyển khi cuộn */}
      <header className="sticky top-0 z-30 shrink-0 -mx-4 lg:-mx-6 px-4 lg:px-6 bg-background/95 backdrop-blur-md pt-4 lg:pt-6 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light text-primary border border-primary-border">
              <ScanLine className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-black tracking-tight text-content-primary leading-none">
                Truy vết biển số xe
              </h1>
              <p className="text-[11px] text-content-muted mt-0.5">
                Rà soát ảnh chụp và video bằng chứng theo thời gian, kênh camera và biển số
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-slate-200/60">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden min-[960px]:flex-row">
          
          {/* CỘT TRÁI: Bộ lọc + Mục tiêu đang chọn + VIDEO BẰNG CHỨNG PHÓNG TO CHIẾM HẾT KHOẢNG TRỐNG */}
          <aside className="w-full min-w-0 shrink-0 border-b border-border bg-surface-muted/20 min-[960px]:w-[320px] min-[1200px]:w-[340px] min-[960px]:border-b-0 min-[960px]:border-r flex flex-col h-full overflow-hidden">
            {/* 1. Form bộ lọc truy vết */}
            <form onSubmit={handleSearch} className="shrink-0 space-y-2 p-2.5 border-b border-border">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-content-muted">
                    <Calendar className="h-3 w-3 text-content-muted" />
                    Thời gian
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyPreset("today")}
                      className="text-[8px] font-semibold text-content-muted hover:text-primary transition-colors"
                    >
                      Hôm nay
                    </button>
                    <span className="text-[8px] text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => applyPreset("24h")}
                      className="text-[8px] font-semibold text-content-muted hover:text-primary transition-colors"
                    >
                      24h
                    </button>
                    <span className="text-[8px] text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => applyPreset("all")}
                      className="text-[8px] font-semibold text-content-muted hover:text-primary transition-colors"
                    >
                      Tất cả
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="datetime-local"
                    step={1}
                    value={draftFilters.from}
                    onChange={(event) => updateDraft({ from: event.target.value })}
                    aria-label="Thời gian bắt đầu"
                    className="w-full rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] text-content-primary outline-none transition-colors focus:border-primary"
                  />
                  <input
                    type="datetime-local"
                    step={1}
                    value={draftFilters.to}
                    onChange={(event) => updateDraft({ to: event.target.value })}
                    aria-label="Thời gian kết thúc"
                    className="w-full rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] text-content-primary outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="trace-channel"
                  className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-content-muted"
                >
                  <SlidersHorizontal className="h-3 w-3 text-content-muted" />
                  Kênh / Nguồn video
                </label>
                <select
                  id="trace-channel"
                  value={draftFilters.channel}
                  onChange={(event) => updateDraft({ channel: event.target.value })}
                  className="w-full h-[28px] rounded-md border border-border bg-surface px-2 text-[10px] text-content-primary outline-none transition-colors focus:border-primary"
                >
                  <option value="ALL">Tất cả kênh ({channels.length})</option>
                  {channels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-12 gap-1.5">
                <div className="col-span-8">
                  <label
                    htmlFor="trace-plate"
                    className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-content-muted"
                  >
                    <Search className="h-3 w-3 text-content-muted" />
                    Biển số xe
                  </label>
                  <input
                    id="trace-plate"
                    type="text"
                    value={draftFilters.plate}
                    onChange={(event) => updateDraft({ plate: event.target.value })}
                    placeholder="VD: 29D2 hoặc 51F*"
                    className="w-full h-[28px] rounded-md border border-border bg-surface px-2 font-mono text-[10px] text-content-primary placeholder:text-content-muted outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div className="col-span-4">
                  <label
                    htmlFor="trace-tolerance"
                    className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-content-muted"
                    title="Sai số ký tự"
                  >
                    <Filter className="h-3 w-3 text-content-muted" />
                    Sai số
                  </label>
                  <input
                    id="trace-tolerance"
                    type="number"
                    min={0}
                    max={5}
                    value={draftFilters.tolerance}
                    onChange={(event) =>
                      updateDraft({
                        tolerance: Math.max(
                          0,
                          Math.min(5, Number(event.target.value) || 0)
                        ),
                      })
                    }
                    aria-label="Sai số ký tự cho phép"
                    className="w-full h-[28px] rounded-md border border-border bg-surface px-1 text-center font-mono text-[10px] text-content-primary outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="submit"
                  className="flex h-[28px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-[10px] font-bold text-white transition-colors hover:bg-primary-hover shadow-2xs"
                >
                  <Search className="h-3 w-3" />
                  Tìm kiếm
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  title="Xóa bộ lọc"
                  className="flex h-[28px] w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </form>

            {/* 2. Thông tin mục tiêu đang chọn */}
            <div className="shrink-0 p-2.5 space-y-1.5 border-b border-border">
              <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-content-muted">
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3 w-3 text-content-muted" />
                  Mục tiêu đang chọn
                </span>
                {previewRecord && (
                  <span className="font-mono text-[8px] text-content-muted">
                    ID #{previewRecord.id.slice(0, 6)}
                  </span>
                )}
              </div>

              {previewRecord ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-2 py-1.5">
                    <PlateBadge display={previewRecord.plate_display || previewRecord.plate_number} color={previewRecord.plate_type} />
                    <VehicleBadge type={previewRecord.vehicle_type} />
                  </div>

                  <dl className="grid grid-cols-2 gap-1">
                    <InfoRow
                      label="Địa phương"
                      value={previewRecord.province || getProvinceFromPlate(previewRecord.plate_number)}
                    />
                    <InfoRow
                      label="Độ tin cậy"
                      value={`${Math.round(previewRecord.confidence_score * 100)}%`}
                      mono
                    />
                    <InfoRow
                      label="Kênh video"
                      value={previewRecord.job_filename || "—"}
                    />
                    <InfoRow
                      label="Mốc ghi nhận"
                      value={previewRecord.video_time_str || formatDateTime(previewRecord.timestamp)}
                      mono
                    />
                  </dl>
                </div>
              ) : (
                <p className="text-center py-2 text-[10px] text-content-muted italic">
                  Chưa chọn ảnh chụp nào
                </p>
              )}
            </div>

            <div className="flex-1 min-h-[100px] p-2.5 flex flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between text-[9px] font-bold uppercase tracking-wider text-content-muted mb-1.5">
                <span className="flex items-center gap-1">
                  <Film className="h-3.5 w-3.5 text-primary" />
                  Video bằng chứng trực tiếp
                </span>
                <button
                  type="button"
                  onClick={() => previewRecord && setVideoRecord(previewRecord)}
                  disabled={!previewRecord}
                  className="flex items-center gap-1 text-[9px] font-semibold text-primary transition-colors hover:text-primary-hover disabled:cursor-not-allowed disabled:text-content-muted"
                >
                  <Maximize2 className="h-3 w-3" />
                  Mở rộng
                </button>
              </div>

              <div className="flex-1 min-h-0 w-full relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center shadow-inner">
                {previewRecord?.video_url ? (
                  <video
                    key={previewRecord.id}
                    src={resolveMediaUrl(previewRecord.video_url)}
                    controls
                    autoPlay={false}
                    preload="metadata"
                    poster={
                      previewRecord.crop_image_url
                        ? resolveMediaUrl(previewRecord.crop_image_url)
                        : undefined
                    }
                    className="h-full w-full object-contain"
                  />
                ) : previewRecord ? (
                  <div className="relative h-full w-full flex flex-col items-center justify-center p-3 text-center">
                    {previewRecord.crop_image_url && (
                      <div className="absolute inset-0 opacity-20 blur-xs">
                        <SafePlateImage
                          src={previewRecord.crop_image_url}
                          alt={previewRecord.plate_display}
                          plateNumber={previewRecord.plate_display}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVideoRecord(previewRecord)}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/90 text-white shadow-lg transition-transform hover:scale-105"
                      >
                        <Play className="ml-0.5 h-6 w-6" />
                      </button>
                      <span className="text-[11px] font-semibold text-slate-200">
                        Phát bằng chứng {previewRecord.plate_display}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        Mốc: {previewRecord.video_time_str || "--:--"} · Kênh: {previewRecord.job_filename}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-500 p-4 text-center">
                    <Camera className="h-8 w-8 text-slate-700" />
                    <span className="text-xs font-semibold text-slate-400">Chưa chọn ảnh chụp</span>
                    <span className="text-[10px] text-slate-600">Bấm vào bất kỳ thẻ biển số bên phải để xem video bằng chứng</span>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden bg-surface min-[960px]:w-auto min-[960px]:flex-1">
            
            {/* Top Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-sm font-bold text-content-primary">
                  Ảnh chụp nhận diện
                </h2>
                <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-bold text-content-secondary">
                  {filteredRecords.length.toLocaleString("vi-VN")}
                </span>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded-md border border-primary-border bg-primary-light px-2 py-0.5 text-[10px] font-semibold text-primary"
                    title="Bỏ chọn tất cả"
                  >
                    Đã chọn {selectedIds.size} · Bỏ chọn
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortOrder}
                  onChange={(event) => {
                    setSortOrder(event.target.value as "desc" | "asc");
                    setPage(1);
                  }}
                  className="rounded-lg border border-border bg-surface-muted px-2 py-1 text-[10px] text-content-primary outline-none focus:border-primary"
                  aria-label="Sắp xếp kết quả"
                >
                  <option value="desc">Thời gian: mới nhất</option>
                  <option value="asc">Thời gian: cũ nhất</option>
                </select>

                <button
                  type="button"
                  onClick={togglePageSelection}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2 py-1 text-[10px] font-semibold text-content-secondary transition-colors hover:border-slate-300 hover:text-content-primary"
                >
                  <span
                    className={`flex h-3 w-3 items-center justify-center rounded-sm border ${
                      pageAllSelected
                        ? "border-primary bg-primary text-white"
                        : "border-slate-300"
                    }`}
                  >
                    {pageAllSelected && <Check className="h-2.5 w-2.5" />}
                  </span>
                  Chọn trang
                </button>

                <button
                  type="button"
                  onClick={() => void loadRecords()}
                  disabled={isLoading}
                  title="Tải lại dữ liệu"
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-[10px] font-semibold text-content-secondary transition-colors hover:border-slate-300 hover:text-content-primary disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Làm mới
                </button>
              </div>
            </div>

            {/* Filter chips bar */}
            <div className="flex min-h-7 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5 bg-surface-muted/20">
              <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-content-muted">
                Đang lọc
              </span>
              {appliedFilters.plate.trim() ? (
                <span className="inline-flex items-center gap-1 rounded border border-primary-border bg-primary-light px-1.5 py-0.5 font-mono text-[9px] text-primary">
                  BIỂN SỐ: {appliedFilters.plate.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft({ plate: "" });
                      setAppliedFilters((current) => ({ ...current, plate: "" }));
                      setPage(1);
                    }}
                    aria-label="Bỏ lọc biển số"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ) : null}
              {appliedFilters.channel !== "ALL" ? (
                <span className="inline-flex max-w-[220px] items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] text-content-secondary">
                  <Camera className="h-2.5 w-2.5 shrink-0 text-content-muted" />
                  <span className="truncate">{appliedFilters.channel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft({ channel: "ALL" });
                      setAppliedFilters((current) => ({ ...current, channel: "ALL" }));
                      setPage(1);
                    }}
                    aria-label="Bỏ lọc kênh"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ) : null}
              {appliedFilters.from || appliedFilters.to ? (
                <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9px] text-content-secondary">
                  <Calendar className="h-2.5 w-2.5 text-content-muted" />
                  {appliedFilters.from ? formatDateTime(appliedFilters.from) : "…"}
                  {" → "}
                  {appliedFilters.to ? formatDateTime(appliedFilters.to) : "…"}
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft({ from: "", to: "" });
                      setAppliedFilters((current) => ({ ...current, from: "", to: "" }));
                      setPage(1);
                    }}
                    aria-label="Bỏ lọc thời gian"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ) : null}
              {activeFilterCount === 0 && (
                <span className="text-[9px] text-content-muted">
                  Tất cả thời gian · Tất cả kênh · Tất cả biển số
                </span>
              )}
            </div>

            {/* Empty State / Loading */}
            {isLoading ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-content-muted">Đang tải danh sách ảnh chụp...</span>
              </div>
            ) : visibleRecords.length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-8 text-center flex-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-muted text-content-muted">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-heading text-sm font-bold text-content-primary">
                  {records.length === 0
                    ? "Chưa có dữ liệu nhận diện"
                    : "Không tìm thấy ảnh chụp phù hợp"}
                </h3>
                <p className="mt-1.5 max-w-sm text-[11px] leading-relaxed text-content-muted">
                  {records.length === 0
                    ? "Hãy tải video lên để AI phân tích, sau đó quay lại đây để tra cứu theo biển số hoặc khoảng thời gian."
                    : "Thử mở rộng khoảng thời gian, chọn kênh khác hoặc tăng sai số cho phép để tìm gần đúng."}
                </p>
                {records.length === 0 ? (
                  <Link
                    href="/upload"
                    className="mt-4 rounded-lg bg-primary px-3.5 py-2 text-[10px] font-bold text-white transition-colors hover:bg-primary-hover"
                  >
                    Đi tới Upload video
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-3.5 py-2 text-[10px] font-semibold text-content-secondary transition-colors hover:border-slate-300 hover:text-content-primary"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  ref={resultsViewportRef}
                  className="flex-1 min-h-0 w-full overflow-y-auto p-3.5"
                >
                  <div
                    ref={resultsGridRef}
                    className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 content-start"
                  >
                    {visibleRecords.map((record) => {
                      const isActive = previewRecord?.id === record.id;
                      const isSelected = selectedIds.has(record.id);

                      return (
                        <div
                          key={record.id}
                          role="button"
                          tabIndex={0}
                          title={`${record.job_filename} · ${formatDateTime(record.timestamp)}`}
                          onClick={() => setActiveId(record.id)}
                          onDoubleClick={() => setVideoRecord(record)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveId(record.id);
                            }
                          }}
                          className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-surface text-left outline-none transition-all duration-200 flex flex-col ${
                            isActive
                              ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10 bg-primary-light/5"
                              : "border-border hover:border-slate-300 hover:shadow-md"
                          }`}
                        >
                          {/* Ảnh chụp nhận diện to rõ */}
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                            <SafePlateImage
                              src={record.crop_image_url}
                              alt={record.plate_display || record.plate_number}
                              plateNumber={record.plate_display}
                              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                            />

                            {/* Checkbox chọn */}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSelected(record.id);
                              }}
                              aria-label={
                                isSelected
                                  ? `Bỏ chọn ${record.plate_display}`
                                  : `Chọn ${record.plate_display}`
                              }
                              aria-pressed={isSelected}
                              className={`absolute left-2 top-2 flex h-4.5 w-4.5 items-center justify-center rounded-md border transition-colors shadow-xs ${
                                isSelected
                                  ? "border-primary bg-primary text-white"
                                  : "border-slate-300 bg-white/80 text-transparent hover:border-primary"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>

                            {/* Mốc thời gian video */}
                            <span className="absolute right-2 top-2 rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur-xs shadow-xs">
                              {record.video_time_str || "--:--"}
                            </span>

                            {/* Overlay nút phát video khi hover */}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setVideoRecord(record);
                              }}
                              aria-label={`Xem video ${record.plate_display}`}
                              className="absolute inset-0 flex items-center justify-center bg-transparent text-transparent transition-all group-hover:bg-slate-950/20 group-hover:text-white"
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-slate-950/75 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                                <Play className="ml-0.5 h-4 w-4" />
                              </span>
                            </button>
                          </div>

                          {/* Thông số biển số & AI bóc tách to rõ */}
                          <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate font-mono text-base font-black tracking-wide text-content-primary">
                                {record.plate_display || record.plate_number}
                              </p>
                              <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-black text-status-success">
                                {Math.round(record.confidence_score * 100)}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <VehicleBadge type={record.vehicle_type} />
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-content-secondary truncate max-w-[110px]">
                                <MapPin className="h-3 w-3 text-content-muted shrink-0" />
                                {record.province || getProvinceFromPlate(record.plate_number)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-content-muted pt-1 border-t border-border/60">
                              <span className="font-mono truncate max-w-[120px]">{formatDateTime(record.timestamp)}</span>
                              {record.speed_kmh ? (
                                <span className="flex items-center gap-0.5 font-mono font-semibold text-content-primary">
                                  <Gauge className="h-2.5 w-2.5 text-content-muted" />
                                  {record.speed_kmh}km/h
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pagination footer */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 bg-surface">
                  <p className="font-mono text-[10px] text-content-muted">
                    Hiển thị{" "}
                    <span className="font-bold text-content-primary">
                      {pageStart}–{pageEnd}
                    </span>{" "}
                    / {filteredRecords.length.toLocaleString("vi-VN")} ảnh
                    {selectedIds.size > 0 ? ` · ${selectedIds.size} đã chọn` : ""}
                  </p>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(1)}
                      disabled={safePage <= 1}
                      aria-label="Trang đầu"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={safePage <= 1}
                      aria-label="Trang trước"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>

                    <span className="min-w-[70px] text-center font-mono text-xs font-bold text-content-secondary">
                      {safePage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setPage((current) => Math.min(totalPages, current + 1))
                      }
                      disabled={safePage >= totalPages}
                      aria-label="Trang sau"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage(totalPages)}
                      disabled={safePage >= totalPages}
                      aria-label="Trang cuối"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            )}
          </section>
        </div>
      </div>

      <VideoEvidenceModal
        record={videoRecord}
        onClose={() => setVideoRecord(null)}
      />
    </div>
  );
}

export default function TracePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-content-muted">
          Đang tải trang truy vết...
        </div>
      }
    >
      <TraceContent />
    </Suspense>
  );
}
