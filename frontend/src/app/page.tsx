import React from "react";
import { cookies } from "next/headers";
import { alprApi, BackendUnreachableError } from "@/lib/api";
import { DashboardKPIs, PlateRecord } from "@/types";
import { RealtimeVideoScanner } from "@/components/video/RealtimeVideoScanner";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { QuickTraceBento } from "@/components/dashboard/QuickTraceBento";
import { RecentPlatesBento } from "@/components/dashboard/RecentPlatesBento";
import { BackendOffline } from "@/components/dashboard/BackendOffline";

/**
 * Server Component không có localStorage → đọc cờ Mock từ COOKIE trình duyệt
 * (do `setMockEnabled()` ghi khi người dùng bật ở Sidebar).
 * Người dùng chưa từng bật → trả `undefined` để API tự rơi về NEXT_PUBLIC_USE_MOCK.
 */
function getMockFlagFromCookie(): boolean | undefined {
  const raw = cookies().get("alpr_use_mock")?.value;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

// Bắt buộc render theo request: KPI và danh sách biển số là dữ liệu realtime,
// TUYỆT ĐỐI không được Next cache static (sẽ đóng băng số liệu tại thời điểm `next build`).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const mock = getMockFlagFromCookie();

  let kpis: DashboardKPIs;
  let plates: PlateRecord[];

  try {
    [kpis, plates] = await Promise.all([
      alprApi.getKPIs({ mock }),
      alprApi.getPlates(undefined, { mock }),
    ]);
  } catch (err) {
    // Backend không gọi được → giao diện cứu cánh có nút Thử lại / Bật Mock.
    if (err instanceof BackendUnreachableError) {
      return <BackendOffline message={err.message} />;
    }
    throw err; // lỗi bất thường khác → error.tsx (Error Boundary)
  }

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
            <p className="text-xs text-content-muted">Danh sách biển số đã nhận diện</p>
          </div>
          <RecentPlatesBento plates={plates} />
        </div>
      </div>
    </div>
  );
}
