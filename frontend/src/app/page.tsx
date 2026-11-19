import React from "react";
import { alprApi, BackendUnreachableError } from "@/lib/api";
import { DashboardKPIs, PlateRecord } from "@/types";
import { DashboardLiveView } from "@/components/dashboard/DashboardLiveView";
import { BackendOffline } from "@/components/dashboard/BackendOffline";

// Bắt buộc render theo request: KPI và danh sách biển số là dữ liệu realtime,
// TUYỆT ĐỐI không được Next cache static (sẽ đóng băng số liệu tại thời điểm `next build`).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let kpis: DashboardKPIs;
  let plates: PlateRecord[];

  try {
    [kpis, plates] = await Promise.all([alprApi.getKPIs(), alprApi.getPlates()]);
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Không thể kết nối đến máy chủ Backend FastAPI (http://localhost:8000).";
    return <BackendOffline message={errorMsg} />;
  }

  return <DashboardLiveView initialKpis={kpis} initialPlates={plates} />;
}
