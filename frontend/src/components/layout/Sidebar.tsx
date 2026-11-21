"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  UploadCloud,
  Camera,
  Database,
  SearchCode,
  ShieldCheck,
  Cpu,
  ChevronRight,
  AlertTriangle,
  Car,
  Building2,
  SlidersHorizontal,
  Sparkles,
  ShieldAlert,
  HardDrive,
} from "lucide-react";
import { apiClient } from "@/lib/api";

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
    name: "Quản lý Bãi xe",
    href: "/parking",
    icon: Car,
    badge: "Smart",
  },
  {
    name: "Xe Cư dân",
    href: "/residents",
    icon: Building2,
    badge: null,
  },
  {
    name: "Camera trực tiếp",
    href: "/camera",
    icon: Camera,
    badge: "Live",
  },
  {
    name: "Truy vết Biển số",
    href: "/trace",
    icon: SearchCode,
    badge: "Forensic",
  },
  {
    name: "Cấu hình hệ thống",
    href: "/settings",
    icon: SlidersHorizontal,
    badge: null,
  },
];

const SETTINGS_SUB_ITEMS = [
  { id: "parking", name: "Bãi xe & Bảng giá", href: "/settings?tab=parking", icon: Car },
  { id: "ai", name: "AI & Barie", href: "/settings?tab=ai", icon: Sparkles },
  { id: "security", name: "An ninh", href: "/settings?tab=security", icon: ShieldAlert },
  { id: "storage", name: "Lưu trữ", href: "/settings?tab=storage", icon: HardDrive },
  { id: "system", name: "Tòa nhà & Database", href: "/settings?tab=system", icon: Database },
];

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams ? searchParams.get("tab") || "parking" : "parking";
  const isSettingsPage = pathname === "/settings";
  const [settingsOpen, setSettingsOpen] = useState(isSettingsPage);

  useEffect(() => {
    if (isSettingsPage) {
      setSettingsOpen(true);
    }
  }, [isSettingsPage]);

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        if (item.href === "/settings") {
          return (
            <div key={item.href} className="space-y-1">
              <div
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isSettingsPage
                    ? "bg-primary-light text-primary border border-primary-border shadow-xs"
                    : "text-content-secondary hover:text-content-primary hover:bg-surface-muted"
                }`}
              >
                <Link
                  href="/settings?tab=parking"
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isSettingsPage ? "text-primary" : "text-content-muted"
                    }`}
                  />
                  <span className="truncate">{item.name}</span>
                </Link>

                <button
                  type="button"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  aria-label="Mở rộng menu cấu hình"
                  className="p-1 rounded-md hover:bg-black/5 transition-colors text-content-muted hover:text-content-primary"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      settingsOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Sub-menu Dropdown cho Cấu hình hệ thống */}
              {settingsOpen && (
                <div className="pl-3 pr-1 py-1 space-y-0.5 border-l-2 border-primary/20 ml-5 my-1 animate-in fade-in duration-150">
                  {SETTINGS_SUB_ITEMS.map((sub) => {
                    const isSubActive = isSettingsPage && currentTab === sub.id;
                    const SubIcon = sub.icon;
                    return (
                      <Link
                        key={sub.id}
                        href={sub.href}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isSubActive
                            ? "bg-primary-light text-primary border border-primary-border/60 font-bold shadow-2xs"
                            : "text-content-secondary hover:text-content-primary hover:bg-surface-muted"
                        }`}
                      >
                        <SubIcon
                          className={`w-3.5 h-3.5 ${
                            isSubActive ? "text-primary" : "text-content-muted"
                          }`}
                        />
                        <span className="truncate">{sub.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

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
                  isActive ? "text-primary" : "text-content-muted"
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
  );
}

export function Sidebar() {
  const [engineStatus, setEngineStatus] = useState<"online" | "offline">("offline");
  const [buildingName, setBuildingName] = useState("Chung cư Sunrise City - Tháp A");

  useEffect(() => {
    let cancelled = false;

    // Kiểm tra tín hiệu thực tế từ Backend FastAPI
    const checkHealth = () =>
      apiClient
        .get("/health")
        .then(() => {
          if (!cancelled) setEngineStatus("online");
        })
        .catch(() => {
          if (!cancelled) setEngineStatus("offline");
        });
    void checkHealth();
    const timer = window.setInterval(checkHealth, 15000);

    // Hiển thị tên tòa nhà theo cấu hình hệ thống
    apiClient
      .get<{ building?: { name?: string } }>("/settings")
      .then((res) => {
        const name = res.data?.building?.name?.trim();
        if (!cancelled && name) setBuildingName(name);
      })
      .catch(() => {});

    const handleApiError = (event: Event) => {
      if ((event as CustomEvent).detail?.isNetworkError) setEngineStatus("offline");
    };
    const handleConnected = () => setEngineStatus("online");
    window.addEventListener("alpr_api_error", handleApiError);
    window.addEventListener("alpr_api_connected", handleConnected);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("alpr_api_error", handleApiError);
      window.removeEventListener("alpr_api_connected", handleConnected);
    };
  }, []);

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
              <p className="max-w-[172px] truncate text-[11px] text-content-muted font-medium" title={buildingName}>
                {buildingName}
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Section */}
        <div className="p-3 space-y-1">
          <div className="px-3 pt-3 pb-2 text-[10px] font-bold tracking-wider uppercase text-content-muted">
            Quản trị Vận hành
          </div>

          <Suspense fallback={<nav className="space-y-1" />}>
            <SidebarNav />
          </Suspense>
        </div>
      </div>

      {/* Bottom: System Status & User Profile */}
      <div className="p-4 border-t border-border/80 space-y-3 bg-surface">
        {/* System Health Card */}
        <div className="p-3 rounded-xl bg-surface-muted border border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                engineStatus === "online"
                  ? "bg-status-success animate-tech-pulse"
                  : "bg-status-error"
              }`}
            />
            <div>
              <p className="text-[11px] font-bold text-content-primary">
                {engineStatus === "online" ? "AI Engine Online" : "Backend Mất kết nối"}
              </p>
              <p className="text-[10px] text-content-muted">
                {engineStatus === "online" ? "FastAPI Hub Connected" : "Cổng 8000 không phản hồi"}
              </p>
            </div>
          </div>
          {engineStatus === "online" ? (
            <ShieldCheck className="w-4 h-4 text-status-success" />
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
