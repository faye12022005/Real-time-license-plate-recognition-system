"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Car, Gauge, Settings2 } from "lucide-react";
import { alprApi } from "@/lib/api";
import { useRealtimeEvent } from "@/lib/useRealtime";

interface CapacityState {
  parked: number;
  total: number;
  carCapacity: number;
  motorcycleCapacity: number;
}

export function ParkingCapacityBanner() {
  const [capacity, setCapacity] = useState<CapacityState | null>(null);

  const loadCapacity = useCallback(async () => {
    try {
      const [settings, stats] = await Promise.all([
        alprApi.getSettings(),
        alprApi.getParkingStats(),
      ]);
      const car = Math.max(0, settings.parking.max_capacity.car || 0);
      const motorcycle = Math.max(0, settings.parking.max_capacity.motorcycle || 0);
      const total = car + motorcycle;
      if (total <= 0) {
        setCapacity(null);
        return;
      }
      setCapacity({
        parked: Math.max(0, stats?.currently_parked || 0),
        total,
        carCapacity: car,
        motorcycleCapacity: motorcycle,
      });
    } catch {
      setCapacity(null);
    }
  }, []);

  useEffect(() => {
    void loadCapacity();
  }, [loadCapacity]);

  useRealtimeEvent("parking_check_in", () => void loadCapacity());
  useRealtimeEvent("parking_check_out", () => void loadCapacity());

  if (!capacity) return null;

  const percent = Math.min(100, Math.round((capacity.parked / capacity.total) * 100));
  const isFull = percent >= 100;
  const isWarning = percent >= 85 && !isFull;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-bento border px-4 py-3 shadow-bento ${
        isFull
          ? "border-status-error/40 bg-status-error/10"
          : isWarning
          ? "border-status-warning/40 bg-status-warning/10"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            isFull
              ? "bg-status-error/15 text-status-error"
              : isWarning
              ? "bg-status-warning/15 text-status-warning"
              : "bg-primary-light text-primary"
          }`}
        >
          {isFull || isWarning ? <AlertTriangle className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-xs font-bold text-content-primary">
            {isFull
              ? "Bãi xe đã đầy"
              : isWarning
              ? "Bãi xe sắp đầy"
              : "Tình trạng bãi xe"}
          </p>
          <p className="mt-0.5 text-[10px] text-content-muted">
            Đang gửi <strong className="text-content-primary">{capacity.parked.toLocaleString("vi-VN")}</strong> /{" "}
            {capacity.total.toLocaleString("vi-VN")} chỗ · {percent}% sức chứa
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 text-[10px] text-content-muted sm:flex">
          <span className="flex items-center gap-1">
            <Car className="h-3 w-3" /> {capacity.carCapacity.toLocaleString("vi-VN")} ô tô
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>{capacity.motorcycleCapacity.toLocaleString("vi-VN")} xe máy</span>
        </div>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              isFull ? "bg-status-error" : isWarning ? "bg-status-warning" : "bg-primary"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px] font-bold text-content-secondary transition-colors hover:text-content-primary"
        >
          <Settings2 className="h-3 w-3" />
          Cấu hình
        </Link>
      </div>
    </div>
  );
}
