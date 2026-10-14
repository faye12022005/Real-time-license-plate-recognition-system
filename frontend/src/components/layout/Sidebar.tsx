"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UploadCloud,
  Database,
  SearchCode,
  ShieldCheck,
  Cpu,
  ChevronRight,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
} from "lucide-react";
import { isMockEnabled, setMockEnabled, apiClient } from "@/lib/api";

const NAV_ITEMS = [
  {
    name: "Tổng quan",
    href: "/",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    name: "Upload & Xử lý",
    href: "/upload",
    icon: UploadCloud,
    badge: "AI 2.0",
  },
  {
    name: "Biển số",
    href: "/plates",
    icon: Database,
    badge: null,
  },
  {
    name: "Truy vết Biển số",
    href: "/trace",
    icon: SearchCode,
    badge: "Forensic",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mockActive, setMockActive] = useState<boolean>(false);
  const [engineStatus, setEngineStatus] = useState<"mock" | "online" | "offline">("online");

  useEffect(() => {
    const isMock = isMockEnabled();
    setMockActive(isMock);
    if (isMock) {
      setEngineStatus("mock");
    } else {
      // Kiểm tra tín hiệu thực tế từ Backend FastAPI
      apiClient
        .get("/analytics/kpis")
        .then(() => setEngineStatus("online"))
        .catch(() => setEngineStatus("offline"));

      const handleApiError = () => setEngineStatus("offline");
      window.addEventListener("alpr_api_error", handleApiError);
      return () => window.removeEventListener("alpr_api_error", handleApiError);
    }
  }, []);

  const handleToggleMock = () => {
    const nextState = !mockActive;
    setMockActive(nextState);
    setMockEnabled(nextState);
    window.location.reload();
  };

  return (
    <aside className="w-64 bg-surface border-r border-border h-screen flex flex-col justify-between shrink-0 sticky top-0 z-30 select-none">
      {/* Top: Logo & Tech Brand */}
      <div>
        <div className="p-5 border-b border-border/80 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-black tracking-tight text-content-primary text-base">
                  ALPR TECH
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-light text-primary border border-primary-border">
                  2.0
                </span>
              </div>
              <p className="text-[11px] text-content-muted font-medium">Bento AI Intelligence</p>
            </div>
          </Link>
        </div>

        {/* Navigation Section */}
        <div className="p-3 space-y-1">
          <div className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-content-muted">
            Quản trị Vận hành
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-primary-light text-primary border border-primary-border shadow-xs"
                      : "text-content-secondary hover:text-content-primary hover:bg-surface-muted"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? "text-primary" : "text-content-muted group-hover:text-content-primary"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-primary text-white"
                          : "bg-surface-muted text-content-secondary border border-border"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom: Data Switcher, System Status & User Profile */}
      <div className="p-4 border-t border-border/80 space-y-3 bg-surface">
        {/* Chế độ Dữ liệu (Mock Data vs Giao diện Trống) */}
        <div className="p-2.5 rounded-xl bg-surface-muted border border-border space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-content-muted">
            <span>Chế độ Xem</span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                mockActive
                  ? "bg-blue-100 text-primary border border-blue-200"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {mockActive ? "DỮ LIỆU MẪU" : "TRỐNG (MẶC ĐỊNH)"}
            </span>
          </div>

          <button
            onClick={handleToggleMock}
            className="w-full py-1.5 px-2 bg-white hover:bg-slate-50 border border-border rounded-lg text-[11px] font-semibold text-content-primary flex items-center justify-center gap-1.5 transition-all shadow-2xs hover:border-primary/50"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>
              {mockActive ? "Chuyển về Giao diện Trống" : "Xem trước Dữ liệu Mẫu"}
            </span>
          </button>
        </div>

        {/* System Health Card (Trạng thái động thực tế) */}
        <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                engineStatus === "online"
                  ? "bg-status-success animate-tech-pulse"
                  : engineStatus === "mock"
                  ? "bg-primary animate-pulse"
                  : "bg-status-error"
              }`}
            />
            <div>
              <p className="text-[11px] font-bold text-content-primary">
                {engineStatus === "online"
                  ? "AI Engine Online"
                  : engineStatus === "mock"
                  ? "Chế độ Mock Data"
                  : "Backend Mất kết nối"}
              </p>
              <p className="text-[10px] text-content-muted">
                {engineStatus === "online"
                  ? "FastAPI Hub Connected"
                  : engineStatus === "mock"
                  ? "Mô phỏng độc lập"
                  : "Cổng 8000 không phản hồi"}
              </p>
            </div>
          </div>
          {engineStatus === "online" ? (
            <ShieldCheck className="w-4 h-4 text-status-success" />
          ) : engineStatus === "mock" ? (
            <Sparkles className="w-4 h-4 text-primary" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-status-error" />
          )}
        </div>

        {/* User Account Info */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-xs text-content-primary">
              OP
            </div>
            <div className="leading-tight">
              <p className="text-xs font-bold text-content-primary">Chỉ huy Vận hành</p>
              <p className="text-[10px] text-content-muted font-mono">operator@alpr.its</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-content-muted" />
        </div>
      </div>
    </aside>
  );
}
