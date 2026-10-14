"use client";

import React from "react";
import Link from "next/link";
import { SafePlateImage } from "@/components/shared/SafePlateImage";
import { PlateRecord } from "@/types";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ExternalLink, Clock, MapPin, Gauge, Database } from "lucide-react";

export function RecentPlatesBento({ plates }: { plates: PlateRecord[] }) {
  return (
    <div className="bg-surface border border-border rounded-bento p-5 lg:p-6 shadow-bento flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/80 mb-4">
        <div>
          <h3 className="font-heading font-bold text-sm tracking-tight text-content-primary">
            Biển số Xe Mới Nhận diện (Database)
          </h3>
          <p className="text-[11px] text-content-muted mt-0.5">
            Trích xuất tự động từ video và lưu trữ vĩnh viễn
          </p>
        </div>
        <Link
          href="/plates"
          className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
        >
          <span>Xem tất cả</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Plate List or Empty State */}
      {plates.length > 0 ? (
        <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
          {plates.slice(0, 5).map((plate) => (
            <div
              key={plate.id}
              className="p-3 rounded-xl bg-surface-muted hover:bg-slate-100/80 border border-border/80 transition-all flex items-center justify-between gap-3 group"
            >
              {/* Left: Crop Image & Plate Details */}
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-9 rounded-lg overflow-hidden border border-slate-300 bg-slate-200 shrink-0">
                  <SafePlateImage
                    src={plate.crop_image_url}
                    alt={plate.plate_number}
                    plateNumber={plate.plate_display}
                    className="object-cover group-hover:scale-105 transition-transform"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <PlateBadge display={plate.plate_display} color={plate.plate_type} />
                    <VehicleBadge type={plate.vehicle_type} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-content-muted font-medium">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {plate.province}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {plate.video_time_str}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Confidence Score & Action */}
              <div className="text-right shrink-0">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-status-success text-[10px] font-bold border border-emerald-200">
                  <Gauge className="w-3 h-3" />
                  {(plate.confidence_score * 100).toFixed(0)}%
                </div>
                <p className="text-[10px] text-content-muted font-mono mt-1">
                  {plate.speed_kmh ? `${plate.speed_kmh} km/h` : "--"}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Database}
          title="Chưa có Biển số nào trong Cơ sở Dữ liệu"
          description="Hệ thống chưa ghi nhận biển số nào. Khi bạn tải lên và xử lý video, tất cả biển số được AI bóc tách sẽ tự động lưu trữ và hiển thị tại đây."
        />
      )}
    </div>
  );
}
