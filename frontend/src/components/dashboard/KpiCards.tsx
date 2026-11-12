import React from "react";
import { DashboardKPIs } from "@/types";
import { Film, CheckCircle2, Car, Award, TrendingUp, Clock } from "lucide-react";

export function KpiCards({ kpis }: { kpis: DashboardKPIs }) {
  const isEmpty = kpis.total_videos === 0;

  const cards = [
    {
      label: "Tổng Video Phân tích",
      value: kpis.total_videos,
      unit: "video",
      icon: Film,
      trend: isEmpty ? "Chờ video tải lên" : "+3 hôm nay",
      bgIcon: "bg-blue-50 text-primary border-blue-200",
    },
    {
      label: "Tổng Lượt Nhận diện",
      value: kpis.total_plates_detected,
      unit: "lượt",
      icon: CheckCircle2,
      trend: isEmpty ? "Chưa có lượt quét" : "Zero-drop frames",
      bgIcon: "bg-emerald-50 text-status-success border-emerald-200",
    },
    {
      label: "Biển số Duy nhất (DB)",
      value: kpis.unique_plates_count,
      unit: "xe",
      icon: Car,
      trend: isEmpty ? "Cơ sở dữ liệu trống" : "Phủ khắp tỉnh thành",
      bgIcon: "bg-purple-50 text-accent-purple border-purple-200",
    },
    {
      label: "Độ chính xác OCR TB",
      value: isEmpty ? "--" : `${kpis.avg_accuracy_pct}%`,
      unit: "",
      icon: Award,
      trend: isEmpty ? "Chờ dữ liệu mẫu" : "Voting đa khung hình",
      bgIcon: "bg-amber-50 text-status-warning border-amber-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-surface border border-border rounded-bento p-4 lg:p-5 shadow-bento hover:shadow-bento-hover hover:border-slate-300 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
                {card.label}
              </span>
              <div
                className={`p-2 rounded-xl border ${card.bgIcon}`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-black text-2xl lg:text-3xl text-content-primary tracking-tight font-mono">
                  {card.value}
                </span>
                {card.unit && (
                  <span className="text-xs text-content-muted font-medium">
                    {card.unit}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 mt-2 text-[11px] font-semibold text-content-muted">
                {isEmpty ? (
                  <Clock className="w-3 h-3 text-content-muted" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-status-success" />
                )}
                <span>{card.trend}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
