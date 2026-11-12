import React from "react";
import { VehicleType, PlateColor } from "@/types";

export function VehicleBadge({ type }: { type: VehicleType }) {
  const configs: Record<VehicleType, { label: string; bg: string; text: string; border: string }> = {
    car: {
      label: "Ô tô con",
      bg: "bg-cyan-50",
      text: "text-cyan-700",
      border: "border-cyan-200",
    },
    motorcycle: {
      label: "Xe máy",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
    },
    bus: {
      label: "Xe buýt",
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
    },
    truck: {
      label: "Xe tải",
      bg: "bg-pink-50",
      text: "text-pink-700",
      border: "border-pink-200",
    },
  };

  const c = configs[type] || configs.car;

  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}
    >
      {c.label}
    </span>
  );
}

export function PlateBadge({
  display,
  color = "white",
}: {
  display: string;
  color?: PlateColor;
}) {
  const isYellow = color === "yellow";
  const isBlue = color === "blue";
  const isRed = color === "red";

  let bgClass = "bg-white text-slate-900 border-slate-300";
  if (isYellow) bgClass = "bg-amber-100 text-amber-950 border-amber-300";
  if (isBlue) bgClass = "bg-blue-100 text-blue-950 border-blue-300";
  if (isRed) bgClass = "bg-red-100 text-red-950 border-red-300";

  return (
    <span
      className={`inline-block font-mono font-black text-xs px-2.5 py-1 rounded-md border-2 tracking-wider shadow-2xs ${bgClass}`}
    >
      {display}
    </span>
  );
}
