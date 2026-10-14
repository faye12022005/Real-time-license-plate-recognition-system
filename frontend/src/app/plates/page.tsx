"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { alprApi, setMockEnabled } from "@/lib/api";
import { PlateRecord, VehicleType } from "@/types";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Search, Filter, Compass, Clock, MapPin, Gauge, Database } from "lucide-react";

export default function PlatesDatabasePage() {
  const [plates, setPlates] = useState<PlateRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");

  const loadData = async () => {
    const data = await alprApi.getPlates({
      q: searchQuery,
      vehicle_type: vehicleFilter,
    });
    setPlates(data);
  };

  useEffect(() => {
    loadData();
  }, [vehicleFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight">
          Kho Biển số Nhận diện (Database)
        </h1>
        <p className="text-xs text-content-muted mt-1">
          Toàn bộ biển số xe được hệ thống AI trích xuất tự động từ video và lưu trữ vào cơ sở dữ liệu
        </p>
      </div>

      {/* Filter and Search Bar Bento Card */}
      <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm biển số (VD: 51F-882, 59P2*, 29A)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface font-mono"
            />
          </div>

          {/* Vehicle Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-content-muted flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Lọc:
            </span>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary font-medium"
            >
              <option value="all">Tất cả loại xe</option>
              <option value="car">Ô tô con</option>
              <option value="motorcycle">Xe máy</option>
              <option value="bus">Xe buýt</option>
              <option value="truck">Xe tải</option>
            </select>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Tìm kiếm</span>
          </button>
        </form>
      </div>

      {/* Plates Table Bento Card */}
      <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div>
            <h3 className="font-heading font-bold text-sm text-content-primary">
              Danh mục Bản ghi Biển số
            </h3>
            <p className="text-[11px] text-content-muted">
              Hiển thị {plates.length} bản ghi phù hợp
            </p>
          </div>
        </div>

        {plates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold text-content-muted uppercase bg-surface-muted/60">
                  <th className="py-3 px-4">Ảnh Crop Biển Số</th>
                  <th className="py-3 px-4">Biển Số Nhận Diện</th>
                  <th className="py-3 px-4">Tỉnh Thành</th>
                  <th className="py-3 px-4">Loại Xe</th>
                  <th className="py-3 px-4">Video Nguồn</th>
                  <th className="py-3 px-4">Mốc Thời Gian</th>
                  <th className="py-3 px-4">Độ Tin Cậy</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {plates.map((plate) => (
                  <tr key={plate.id} className="hover:bg-surface-muted/50 transition-colors">
                    {/* Ảnh crop */}
                    <td className="py-3 px-4">
                      <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-slate-300 bg-slate-200">
                        <Image
                          src={plate.crop_image_url}
                          alt={plate.plate_number}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    </td>

                    {/* Biển số badge */}
                    <td className="py-3 px-4">
                      <PlateBadge display={plate.plate_display} color={plate.plate_type} />
                    </td>

                    {/* Tỉnh thành */}
                    <td className="py-3 px-4 text-content-secondary font-medium">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-content-muted" />
                        {plate.province}
                      </span>
                    </td>

                    {/* Loại xe */}
                    <td className="py-3 px-4">
                      <VehicleBadge type={plate.vehicle_type} />
                    </td>

                    {/* Video Nguồn */}
                    <td className="py-3 px-4 text-content-muted font-medium truncate max-w-[180px]">
                      {plate.job_filename}
                    </td>

                    {/* Mốc thời gian trong video */}
                    <td className="py-3 px-4 font-mono text-content-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {plate.video_time_str}
                      </span>
                    </td>

                    {/* Độ tin cậy OCR */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-status-success font-bold font-mono text-[11px] border border-emerald-200">
                        <Gauge className="w-3 h-3" />
                        {(plate.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/trace?q=${encodeURIComponent(plate.plate_number)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-light hover:bg-primary text-primary hover:text-white text-xs font-semibold border border-primary-border transition-all"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>Truy vết</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Database}
            title="Kho Cơ sở Dữ liệu Biển số Hiện đang Trống"
            description="Chưa có dữ liệu biển số xe nào được lưu trong hệ thống. Bạn có thể tải lên tệp video mới để AI bắt đầu quét hoặc bấm 'Xem dữ liệu mẫu' để xem trước giao diện khi có dữ liệu."
            actionText="Tải lên Video ngay"
            onAction={() => (window.location.href = "/upload")}
            secondaryActionText="Xem trước Dữ liệu mẫu"
            onSecondaryAction={() => {
              setMockEnabled(true);
              window.location.reload();
            }}
          />
        )}
      </div>
    </div>
  );
}
