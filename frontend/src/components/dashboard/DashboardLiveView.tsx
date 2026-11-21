"use client";

import React, { useState } from "react";
import { DashboardKPIs, PlateRecord } from "@/types";
import { alprApi } from "@/lib/api";
import { useRealtimeEvent } from "@/lib/useRealtime";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { ParkingCapacityBanner } from "@/components/dashboard/ParkingCapacityBanner";
import { QuickTraceBento } from "@/components/dashboard/QuickTraceBento";
import { RecentPlatesBento } from "@/components/dashboard/RecentPlatesBento";

interface DashboardLiveViewProps {
  initialKpis: DashboardKPIs;
  initialPlates: PlateRecord[];
}

export function DashboardLiveView({ initialKpis, initialPlates }: DashboardLiveViewProps) {
  const [kpis, setKpis] = useState<DashboardKPIs>(initialKpis);
  const [plates, setPlates] = useState<PlateRecord[]>(initialPlates);

  // Lắng nghe sự kiện KPI thay đổi
  useRealtimeEvent("kpis_updated", () => {
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  // Lắng nghe sự kiện có biển số xe mới được nhận diện từ Video hoặc Camera
  useRealtimeEvent<PlateRecord>("plate_detected", (newPlate) => {
    if (!newPlate || !newPlate.id) return;
    setPlates((prev) => [newPlate, ...prev.filter((p) => p.id !== newPlate.id)]);
    // Cập nhật lại số liệu KPI
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  // Lắng nghe sự kiện xóa biển số xe
  useRealtimeEvent<{ plate_id: string }>("plate_deleted", ({ plate_id }) => {
    if (!plate_id) return;
    setPlates((prev) => prev.filter((p) => p.id !== plate_id));
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  // Lắng nghe sự kiện xóa biển số xe hàng loạt
  useRealtimeEvent<{ plate_ids: string[] }>("plates_bulk_deleted", ({ plate_ids }) => {
    if (!plate_ids || !Array.isArray(plate_ids)) return;
    const set = new Set(plate_ids);
    setPlates((prev) => prev.filter((p) => !set.has(p.id)));
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  // Lắng nghe sự kiện xóa video job (xóa các biển số liên quan)
  useRealtimeEvent<{ job_id: string }>("video_job_deleted", ({ job_id }) => {
    if (!job_id) return;
    setPlates((prev) => prev.filter((p) => p.job_id !== job_id));
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  // Lắng nghe sự kiện xe ra / vào bãi xe
  useRealtimeEvent("parking_check_in", () => {
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  useRealtimeEvent("parking_check_out", () => {
    alprApi.getKPIs().then(setKpis).catch(() => {});
  });

  return (
    <div className="space-y-6">
      {/* Header cố định ở trên, không di chuyển khi cuộn */}
      <header className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 bg-background/95 backdrop-blur-md pt-4 lg:pt-6 pb-3.5 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-black text-2xl tracking-tight text-content-primary">
                Tổng quan hệ thống
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Bento
              </span>
            </div>
            <p className="mt-0.5 text-xs text-content-muted">
              Chung cư Sunrise City — Tháp A · Giám sát AI thời gian thực & chỉ số vận hành bãi xe
            </p>
          </div>
        </div>
      </header>

      {/* 0. Cảnh báo sức chứa bãi xe (Cấu hình tại /settings) */}
      <ParkingCapacityBanner />

      {/* 1. Thống kê KPI Metric Cards */}
      <KpiCards kpis={kpis} />

      {/* 2. Bento Grid Modules: Truy vết Nhanh & Kho Biển số Đã Lưu trong DB */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Module Truy vết Nhanh (5 Cột) */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <QuickTraceBento />
        </div>

        {/* Danh sách Biển số (7 Cột) */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <RecentPlatesBento plates={plates} />
        </div>
      </div>
    </div>
  );
}

