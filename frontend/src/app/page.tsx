import React from "react";
import { alprApi } from "@/lib/api";
import { RealtimeVideoScanner } from "@/components/video/RealtimeVideoScanner";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { QuickTraceBento } from "@/components/dashboard/QuickTraceBento";
import { RecentPlatesBento } from "@/components/dashboard/RecentPlatesBento";

export default async function DashboardPage() {
  const kpis = await alprApi.getKPIs();
  const plates = await alprApi.getPlates();

  return (
    <div className="space-y-6">
      {/* 1. Giao diện Trung tâm: Video Player tải lên & Xử lý Quét Biển số Realtime */}
      <RealtimeVideoScanner />

      {/* 2. Thống kê KPI Metric Cards */}
      <KpiCards kpis={kpis} />

      {/* 3. Bento Grid Modules: Truy vết Nhanh & Kho Biển số Đã Lưu trong DB */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Module Truy vết Nhanh (5 Cột) */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <div className="mb-2">
            <h2 className="font-heading font-black text-base text-content-primary tracking-tight">
              Truy vết Nhanh
            </h2>
            <p className="text-xs text-content-muted">
              Tra cứu lịch sử xuất hiện và hành trình phương tiện
            </p>
          </div>
          <QuickTraceBento />
        </div>

        {/* Danh sách Biển số (7 Cột) */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div className="mb-2">
            <h2 className="font-heading font-black text-base text-content-primary tracking-tight">
              Biển số
            </h2>
            <p className="text-xs text-content-muted">
              Danh sách biển số đã nhận diện
            </p>
          </div>
          <RecentPlatesBento plates={plates} />
        </div>
      </div>
    </div>
  );
}
