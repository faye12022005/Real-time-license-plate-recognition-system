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
  Database,
  Film,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const MIN_CARD_WIDTH = 108;
const GRID_GAP = 10;
const GRID_PADDING = 32;
const CARD_FOOTER_HEIGHT = 36;

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
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeQuery(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9*]/g, "");
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

  // Query có thể chỉ là một phần biển số: so khớp mọi cửa sổ có độ dài gần bằng query.
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

function hasFilters(filters: TraceFilters): boolean {
  return Boolean(
    filters.plate.trim() ||
      filters.from ||
      filters.to ||
      filters.channel !== "ALL"
  );
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
  const [pageSize, setPageSize] = useState(8);
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

  useEffect(() => {
    const viewport = resultsViewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const grid = resultsGridRef.current;
      const availableWidth = viewport.clientWidth - GRID_PADDING;
      const availableHeight = viewport.clientHeight - GRID_PADDING;
      if (availableWidth < 100 || availableHeight < 100) return;

      const fallbackColumns = Math.max(
        2,
        Math.floor((availableWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))
      );
      const trackSizes =
        grid &&
        window
          .getComputedStyle(grid)
          .gridTemplateColumns.match(/[0-9.]+px/g);
      const columns = Math.max(2, trackSizes?.length || fallbackColumns);

      const firstCard = grid?.firstElementChild as HTMLElement | null;
      const measuredCardHeight = firstCard?.getBoundingClientRect().height;
      const fallbackCardHeight =
        (availableWidth - (fallbackColumns - 1) * GRID_GAP) / fallbackColumns *
          0.75 +
        CARD_FOOTER_HEIGHT;
      const cardHeight =
        measuredCardHeight && measuredCardHeight > 40
          ? measuredCardHeight
          : fallbackCardHeight;

      const rows = Math.max(
        1,
        Math.floor((availableHeight + GRID_GAP) / (cardHeight + GRID_GAP))
      );

      setPageSize(columns * rows);
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

  const timeBounds = useMemo(() => {
    if (filteredRecords.length === 0) {
      return { first: null as string | null, last: null as string | null };
    }

    let first = filteredRecords[0].timestamp;
    let last = filteredRecords[0].timestamp;

    for (const record of filteredRecords) {
      if (record.timestamp < first) first = record.timestamp;
      if (record.timestamp > last) last = record.timestamp;
    }

    return { first, last };
  }, [filteredRecords]);

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

  const resetFilters = () => {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setActiveId(null);
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
    <div className="flex h-auto flex-col gap-3 min-[960px]:h-[calc(100vh-3rem)] min-[960px]:overflow-hidden min-[1024px]:h-[calc(100vh-4rem)]">
      {/* Page heading */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            <ScanLine className="h-3.5 w-3.5" />
            Forensic Console
          </div>
          <h1 className="mt-1 font-heading text-2xl font-black tracking-tight text-content-primary">
            Truy vết biển số xe
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-content-muted">
            Rà soát ảnh chụp và video bằng chứng theo thời gian, kênh camera và biển số.
            Hỗ trợ tìm tương đối để không bỏ sót biển số bị che khuất.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-surface px-3 py-2 text-[11px] text-content-muted shadow-2xs sm:self-auto">
          <Database className="h-3.5 w-3.5 text-primary" />
          <span>
            <strong className="font-mono text-content-primary">
              {records.length.toLocaleString("vi-VN")}
            </strong>{" "}
            bản ghi trong kho
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-slate-200/60">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden min-[960px]:flex-row">
          {/* Left: filters + snapshot information + video */}
          <aside className="min-h-0 w-full min-w-0 shrink-0 overflow-y-auto border-b border-border bg-surface-muted/40 min-[960px]:w-[300px] min-[960px]:border-b-0 min-[960px]:border-r">
            <form onSubmit={handleSearch} className="space-y-2.5 px-3.5 py-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted">
                  <Calendar className="h-3 w-3 text-content-muted" />
                  Thời gian
                </label>
                <div className="space-y-1.5">
                  <input
                    type="datetime-local"
                    step={1}
                    value={draftFilters.from}
                    onChange={(event) => updateDraft({ from: event.target.value })}
                    aria-label="Thời gian bắt đầu"
                    className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-content-primary outline-none transition-colors focus:border-primary"
                  />
                  <input
                    type="datetime-local"
                    step={1}
                    value={draftFilters.to}
                    onChange={(event) => updateDraft({ to: event.target.value })}
                    aria-label="Thời gian kết thúc"
                    className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-content-primary outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="trace-channel"
                  className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted"
                >
                  <SlidersHorizontal className="h-3 w-3 text-content-muted" />
                  Kênh / Nguồn video
                </label>
                <select
                  id="trace-channel"
                  value={draftFilters.channel}
                  onChange={(event) => updateDraft({ channel: event.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-content-primary outline-none transition-colors focus:border-primary"
                >
                  <option value="ALL">Tất cả kênh</option>
                  {channels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="trace-plate"
                  className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted"
                >
                  <Search className="h-3 w-3 text-content-muted" />
                  Biển số xe
                </label>
                <input
                  id="trace-plate"
                  type="text"
                  value={draftFilters.plate}
                  onChange={(event) => updateDraft({ plate: event.target.value })}
                  placeholder="VD: 51F-882.34 hoặc 59P2*"
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-content-primary placeholder:text-content-muted outline-none transition-colors focus:border-primary"
                />
              </div>

              <div className="flex items-end gap-2 pt-0.5">
                <div className="shrink-0">
                  <label
                    htmlFor="trace-tolerance"
                    className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-content-muted"
                    title="Sai số ký tự cho phép. 0 = khớp chính xác"
                  >
                    <Filter className="h-3 w-3 text-content-muted" />
                    Sai số
                    <span className="font-medium normal-case tracking-normal text-content-muted">
                      (0 = khớp)
                    </span>
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
                    aria-label="Sai số ký tự cho phép. 0 là khớp chính xác"
                    className="h-[30px] w-14 rounded-lg border border-border bg-surface px-2 text-center font-mono text-[11px] text-content-primary outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  className="flex h-[30px] flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-[11px] font-bold text-white transition-colors hover:bg-primary-hover"
                >
                  <Search className="h-3.5 w-3.5" />
                  Tìm kiếm
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  title="Xóa bộ lọc"
                  className="flex h-[30px] w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>

            <div className="border-t border-border px-3.5 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted">
                  <Clock3 className="h-3 w-3 text-content-muted" />
                  Thông tin sao chụp
                </h3>
                {previewRecord && (
                  <span className="font-mono text-[9px] text-content-muted">
                    {previewRecord.id.slice(0, 8)}
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-1.5">
                <InfoRow
                  label="Kênh"
                  value={
                    previewRecord?.job_filename ||
                    (appliedFilters.channel === "ALL"
                      ? "Tất cả kênh"
                      : appliedFilters.channel)
                  }
                />
                <InfoRow
                  label="Độ tin cậy"
                  value={
                    previewRecord
                      ? `${Math.round(previewRecord.confidence_score * 100)}%`
                      : "—"
                  }
                  mono
                />
                <InfoRow
                  label="Thời gian bắt đầu"
                  value={
                    formatDateTime(timeBounds.first) !== "—"
                      ? formatDateTime(timeBounds.first)
                      : appliedFilters.from
                        ? formatDateTime(appliedFilters.from)
                        : "—"
                  }
                  mono
                />
                <InfoRow
                  label="Thời gian kết thúc"
                  value={
                    formatDateTime(timeBounds.last) !== "—"
                      ? formatDateTime(timeBounds.last)
                      : appliedFilters.to
                        ? formatDateTime(appliedFilters.to)
                        : "—"
                  }
                  mono
                />
                <InfoRow
                  label="Snapped plate"
                  value={previewRecord?.plate_display || "—"}
                  mono
                />
                <InfoRow
                  label="Matched plate"
                  value={
                    appliedFilters.plate.trim()
                      ? appliedFilters.plate.toUpperCase()
                      : "Tất cả biển số"
                  }
                  mono
                />
              </dl>
            </div>

            <div className="border-t border-border px-3.5 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted">
                  <Film className="h-3 w-3 text-content-muted" />
                  Video bằng chứng
                </h3>
                <button
                  type="button"
                  onClick={() => previewRecord && setVideoRecord(previewRecord)}
                  disabled={!previewRecord}
                  className="flex items-center gap-1 text-[10px] font-semibold text-primary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-content-muted"
                >
                  <Play className="h-3 w-3" />
                  Mở rộng
                </button>
              </div>

              <div
                className={`relative h-[120px] overflow-hidden rounded-lg border border-border ${
                  previewRecord?.video_url ? "bg-slate-950" : "bg-surface-muted"
                }`}
              >
                {previewRecord?.video_url ? (
                  <video
                    key={previewRecord.id}
                    src={resolveMediaUrl(previewRecord.video_url)}
                    controls
                    preload="metadata"
                    poster={
                      previewRecord.crop_image_url
                        ? resolveMediaUrl(previewRecord.crop_image_url)
                        : undefined
                    }
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => previewRecord && setVideoRecord(previewRecord)}
                    disabled={!previewRecord}
                    className="group flex h-full w-full flex-col items-center justify-center gap-2 text-content-muted transition-colors hover:text-content-secondary disabled:cursor-default"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted transition-colors group-hover:border-primary group-hover:text-primary">
                      <Play className="ml-0.5 h-4 w-4" />
                    </span>
                    <span className="px-4 text-center text-[10px] leading-relaxed">
                      {previewRecord
                        ? "Chọn ảnh để xem video bằng chứng"
                        : "Chưa có bản ghi để phát lại"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* Right: result toolbar, grid and pagination */}
          <section className="flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden bg-surface min-[960px]:w-auto min-[960px]:flex-1">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
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
                  className="rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-[10px] text-content-primary outline-none focus:border-primary"
                  aria-label="Sắp xếp kết quả"
                >
                  <option value="desc">Thời gian: mới nhất</option>
                  <option value="asc">Thời gian: cũ nhất</option>
                </select>

                <button
                  type="button"
                  onClick={togglePageSelection}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-[10px] font-semibold text-content-secondary transition-colors hover:border-slate-300 hover:text-content-primary"
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
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-[10px] font-semibold text-content-secondary transition-colors hover:border-slate-300 hover:text-content-primary disabled:opacity-50"
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

            <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
              <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-content-muted">
                Đang lọc
              </span>
              {appliedFilters.plate.trim() ? (
                <span className="inline-flex items-center gap-1 rounded border border-primary-border bg-primary-light px-1.5 py-0.5 font-mono text-[9px] text-primary">
                  PLATE: {appliedFilters.plate.toUpperCase()}
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
                <span className="inline-flex max-w-[220px] items-center gap-1 rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[9px] text-content-secondary">
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
                <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] text-content-secondary">
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

            <div
              ref={resultsViewportRef}
              className="min-h-0 min-w-0 flex-1 overflow-hidden"
            >
              {isLoading ? (
                <div ref={resultsGridRef} className="grid h-full grid-cols-[repeat(auto-fill,minmax(108px,1fr))] content-start gap-2.5 p-4">
                  {Array.from({ length: pageSize }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-lg border border-border bg-surface-muted"
                    >
                      <div className="aspect-[4/3] animate-pulse bg-slate-200" />
                      <div className="space-y-1.5 p-2">
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-200" />
                        <div className="h-2 w-1/2 animate-pulse rounded bg-slate-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleRecords.length === 0 ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-8 text-center">
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
                <div ref={resultsGridRef} className="grid h-full grid-cols-[repeat(auto-fill,minmax(108px,1fr))] content-start gap-2.5 p-4">
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
                      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-surface-muted text-left outline-none transition-all ${
                        isActive
                          ? "border-primary ring-2 ring-primary/15"
                          : "border-border hover:border-slate-300"
                      }`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                        <SafePlateImage
                          src={record.crop_image_url}
                          alt={record.plate_display || record.plate_number}
                          plateNumber={record.plate_display}
                          className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                        />

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
                          className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            isSelected
                              ? "border-primary bg-primary text-white"
                              : "border-slate-300 bg-white/70 text-transparent hover:border-primary"
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </button>

                        <span className="absolute right-1.5 top-1.5 rounded bg-white/85 px-1 py-0.5 font-mono text-[8px] font-semibold text-content-secondary backdrop-blur-sm">
                          {record.video_time_str || "--:--"}
                        </span>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setVideoRecord(record);
                          }}
                          aria-label={`Xem video ${record.plate_display}`}
                          className="absolute inset-0 flex items-center justify-center bg-transparent text-transparent transition-all group-hover:bg-slate-950/20 group-hover:text-white"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-slate-950/70 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            <Play className="ml-0.5 h-3 w-3" />
                          </span>
                        </button>
                      </div>

                      <div className="space-y-0.5 p-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="truncate font-mono text-[10px] font-black tracking-wide text-content-primary">
                            {record.plate_display || record.plate_number}
                          </p>
                          <span className="shrink-0 font-mono text-[8px] text-status-success">
                            {Math.round(record.confidence_score * 100)}%
                          </span>
                        </div>
                        <p className="truncate font-mono text-[8px] text-content-muted">
                          {formatDateTime(record.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="font-mono text-[9px] text-content-muted">
                Hiển thị{" "}
                <span className="text-content-secondary">
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
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronsLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                  aria-label="Trang trước"
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>

                <span className="min-w-[64px] text-center font-mono text-[10px] text-content-secondary">
                  {safePage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={safePage >= totalPages}
                  aria-label="Trang sau"
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage >= totalPages}
                  aria-label="Trang cuối"
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface-muted text-content-muted transition-colors hover:border-slate-300 hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronsRight className="h-3 w-3" />
                </button>
              </div>
            </div>
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
