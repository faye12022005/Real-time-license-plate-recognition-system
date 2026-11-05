import React from "react";
import { alprApi, BackendUnreachableError } from "@/lib/api";
import { DashboardKPIs, PlateRecord } from "@/types";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { QuickTraceBento } from "@/components/dashboard/QuickTraceBento";
import { RecentPlatesBento } from "@/components/dashboard/RecentPlatesBento";
import { BackendOffline } from "@/components/dashboard/BackendOffline";

// Bắt buộc render theo request: KPI và danh sách biển số là dữ liệu realtime,
// TUYỆT ĐỐI không được Next cache static (sẽ đóng băng số liệu tại thời điểm `next build`).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let kpis: DashboardKPIs;
  let plates: PlateRecord[];

  try {
    [kpis, plates] = await Promise.all([alprApi.getKPIs(), alprApi.getPlates()]);
  } catch (err) {
    // Backend không gọi được → giao diện cứu cánh có nút Thử lại.
    if (err instanceof BackendUnreachableError) {
      return <BackendOffline message={err.message} />;
    }
    throw err; // lỗi bất thường khác → error.tsx (Error Boundary)
  }

  return (
    <div className="space-y-6">
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
