"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { alprApi } from "@/lib/api";
import {
  ParkingSession,
  ParkingDashboardStats,
  ParkingCamera,
  VehicleType,
  ParkingTicketType,
} from "@/types";
import { useRealtimeEvent } from "@/lib/useRealtime";
import { resolveMediaUrl } from "@/lib/media";
import {
  Car,
  LogIn,
  LogOut,
  Clock,
  DollarSign,
  Camera,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
  Eye,
  ShieldCheck,
  Building,
  User,
  ArrowRight,
  Loader2,
  X,
  CreditCard,
  Sparkles,
} from "lucide-react";

interface SecurityAlertEvent {
  type: string;
  plate_number?: string;
  plate_display?: string;
  message: string;
  severity?: "critical" | "warning";
  direction?: string;
  gate_name?: string;
}

interface BarrierOpenEvent {
  message: string;
  duration_seconds: number;
  plate_display?: string;
  direction?: string;
  gate_name?: string;
}

export default function ParkingManagementPage() {
  const [stats, setStats] = useState<ParkingDashboardStats | undefined>(undefined);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [cameras, setCameras] = useState<ParkingCamera[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [securityAlert, setSecurityAlert] = useState<SecurityAlertEvent | null>(null);
  const [barrierNotice, setBarrierNotice] = useState<BarrierOpenEvent | null>(null);

  // Bộ lọc
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [ticketFilter, setTicketFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<ParkingSession | null>(null);

  // Form Check-in State
  const [checkInCameraId, setCheckInCameraId] = useState("CAM-IN-01");
  const [checkInPlate, setCheckInPlate] = useState("");
  const [checkInVehicleType, setCheckInVehicleType] = useState<VehicleType>("car");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInFile, setCheckInFile] = useState<File | null>(null);
  const [checkInPreview, setCheckInPreview] = useState<string | null>(null);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // Form Check-out State
  const [checkOutCameraId, setCheckOutCameraId] = useState("CAM-OUT-01");
  const [checkOutPlate, setCheckOutPlate] = useState("");
  const [checkOutSessionId, setCheckOutSessionId] = useState<string>("");
  const [checkOutNotes, setCheckOutNotes] = useState("");
  const [checkOutFile, setCheckOutFile] = useState<File | null>(null);
  const [checkOutPreview, setCheckOutPreview] = useState<string | null>(null);
  const [isSubmittingCheckOut, setIsSubmittingCheckOut] = useState(false);
  const [checkOutError, setCheckOutError] = useState<string | null>(null);
  const [checkOutSuccessResult, setCheckOutSuccessResult] = useState<ParkingSession | null>(null);

  const fileInputCheckInRef = useRef<HTMLInputElement>(null);
  const fileInputCheckOutRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, sessionsData, camerasData] = await Promise.all([
        alprApi.getParkingStats(),
        alprApi.getParkingSessions({
          status: statusFilter === "ALL" ? undefined : statusFilter,
          ticket_type: ticketFilter === "ALL" ? undefined : ticketFilter,
          plate: searchQuery.trim() || undefined,
        }),
        alprApi.getParkingCameras(),
      ]);
      setStats(statsData);
      setSessions(sessionsData);
      setCameras(camerasData);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, ticketFilter]);

  // Lắng nghe sự kiện xe ra / vào bãi thời gian thực
  useRealtimeEvent("parking_check_in", () => {
    loadData();
  });

  useRealtimeEvent("parking_check_out", () => {
    loadData();
  });

  // Cảnh báo an ninh (danh sách đen, lệch biển số...) do Backend phát đi
  useRealtimeEvent<SecurityAlertEvent>("security_alert", (alert) => {
    if (!alert) return;
    setSecurityAlert(alert);
    window.setTimeout(() => setSecurityAlert(null), 10000);
  });

  // Thông báo tự động mở barie cho xe cư dân
  useRealtimeEvent<BarrierOpenEvent>("barrier_open", (event) => {
    if (!event) return;
    setBarrierNotice(event);
    window.setTimeout(() => setBarrierNotice(null), 5000);
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Xử lý chọn ảnh Check-in
  const handleCheckInFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCheckInFile(file);
      setCheckInPreview(URL.createObjectURL(file));
    }
  };

  // Gửi Check-in
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCheckIn(true);
    setCheckInError(null);

    try {
      if (checkInFile) {
        const formData = new FormData();
        formData.append("camera_id", checkInCameraId);
        if (checkInPlate.trim()) formData.append("plate_number", checkInPlate.trim());
        formData.append("vehicle_type", checkInVehicleType);
        if (checkInNotes.trim()) formData.append("notes", checkInNotes.trim());
        formData.append("file", checkInFile);
        await alprApi.checkInVehicleWithImage(formData);
      } else {
        if (!checkInPlate.trim()) {
          throw new Error("Vui lòng nhập biển số xe hoặc tải ảnh chụp xe vào bãi");
        }
        await alprApi.checkInVehicle({
          camera_id: checkInCameraId,
          plate_number: checkInPlate.trim(),
          vehicle_type: checkInVehicleType,
          notes: checkInNotes.trim() || undefined,
        });
      }

      setShowCheckInModal(false);
      setCheckInFile(null);
      setCheckInPreview(null);
      setCheckInPlate("");
      setCheckInNotes("");
      loadData();
    } catch (err: any) {
      setCheckInError(err.message || "Lỗi khi xử lý xe vào bãi");
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  // Xử lý chọn ảnh Check-out
  const handleCheckOutFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCheckOutFile(file);
      setCheckOutPreview(URL.createObjectURL(file));
    }
  };

  // Gửi Check-out
  const handleCheckOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCheckOut(true);
    setCheckOutError(null);

    try {
      let resultSession: ParkingSession;
      if (checkOutFile) {
        const formData = new FormData();
        formData.append("camera_id", checkOutCameraId);
        if (checkOutPlate.trim()) formData.append("plate_number", checkOutPlate.trim());
        if (checkOutSessionId) formData.append("session_id", checkOutSessionId);
        if (checkOutNotes.trim()) formData.append("notes", checkOutNotes.trim());
        formData.append("file", checkOutFile);
        const res = await alprApi.checkOutVehicleWithImage(formData);
        resultSession = res.data;
      } else {
        if (!checkOutPlate.trim() && !checkOutSessionId) {
          throw new Error("Vui lòng nhập biển số xe hoặc chọn phiên gửi xe");
        }
        const res = await alprApi.checkOutVehicle({
          camera_id: checkOutCameraId,
          plate_number: checkOutPlate.trim() || undefined,
          session_id: checkOutSessionId || undefined,
          notes: checkOutNotes.trim() || undefined,
        });
        resultSession = res.data;
      }

      setCheckOutSuccessResult(resultSession);
      loadData();
    } catch (err: any) {
      setCheckOutError(err.message || "Lỗi khi xử lý xe ra bãi");
    } finally {
      setIsSubmittingCheckOut(false);
    }
  };

  // Mở modal check-out cho xe đang trong bãi
  const openCheckOutForSession = (session: ParkingSession) => {
    setCheckOutSessionId(session.id);
    setCheckOutPlate(session.plate_number);
    setCheckOutFile(null);
    setCheckOutPreview(null);
    setCheckOutError(null);
    setCheckOutSuccessResult(null);
    setShowCheckOutModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header cố định ở trên, không di chuyển khi cuộn */}
      <header className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 bg-background/95 backdrop-blur-md pt-4 lg:pt-6 pb-3.5 border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight flex items-center gap-2">
              <Car className="w-7 h-7 text-primary" />
              <span>Quản lý Bãi Xe Chung Cư</span>
            </h1>
            <p className="text-xs text-content-muted mt-1">
              Ghi nhận xe ra/vào, chụp ảnh biển số tự động, đối soát vé tháng cư dân và tính cước phí minh bạch
            </p>
          </div>

          {/* Nút tác vụ Check-in / Check-out */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCheckInError(null);
                setShowCheckInModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02]"
            >
              <LogIn className="w-4 h-4" />
              <span>Xe Vào Bãi (Check-in)</span>
            </button>

            <button
              onClick={() => {
                setCheckOutSessionId("");
                setCheckOutPlate("");
                setCheckOutFile(null);
                setCheckOutPreview(null);
                setCheckOutError(null);
                setCheckOutSuccessResult(null);
                setShowCheckOutModal(true);
              }}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02]"
            >
              <LogOut className="w-4 h-4" />
              <span>Xe Ra Bãi (Check-out)</span>
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-surface border border-border text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Cảnh báo an ninh realtime (danh sách đen / lệch biển số) */}
      {securityAlert && (
        <div className="flex items-start gap-3 rounded-bento border-2 border-status-error/50 bg-status-error/10 px-4 py-3 shadow-bento animate-pulse">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-error" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-status-error">
              {securityAlert.type === "BLACKLIST"
                ? "Cảnh báo danh sách đen"
                : securityAlert.type === "VEHICLE_TYPE_MISMATCH"
                ? "Cảnh báo lệch loại xe"
                : "Cảnh báo lệch biển số"}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-content-primary">{securityAlert.message}</p>
            <p className="mt-0.5 text-[10px] text-content-muted">
              {securityAlert.plate_display}
              {securityAlert.gate_name ? ` • ${securityAlert.gate_name}` : ""}
              {securityAlert.direction ? ` • Lượt ${securityAlert.direction === "ENTRY" ? "vào" : "ra"}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSecurityAlert(null)}
            className="rounded-lg p-1 text-content-muted transition-colors hover:bg-status-error/10 hover:text-status-error"
            aria-label="Đóng cảnh báo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Thông báo barie tự động mở */}
      {barrierNotice && (
        <div className="flex items-center gap-3 rounded-bento border border-status-success/40 bg-status-success/10 px-4 py-3 text-xs font-semibold text-status-success shadow-bento">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{barrierNotice.message}</span>
          <span className="rounded-full bg-status-success/15 px-2 py-0.5 font-mono text-[10px]">
            {barrierNotice.duration_seconds}s
          </span>
        </div>
      )}

      {/* Cảnh báo xe gửi quá số ngày cấu hình */}
      {stats && (stats.overstay_count ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-bento border border-status-warning/40 bg-status-warning/10 px-4 py-3 shadow-bento">
          <Clock className="h-4 w-4 shrink-0 text-status-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-content-primary">
              Có {stats.overstay_count} xe gửi quá {stats.overstay_alert_days ?? 3} ngày
            </p>
            <p className="mt-0.5 truncate text-[10px] text-content-muted">
              {(stats.overstay_sessions || []).slice(0, 6).map((item) => item.plate_display || item.plate_number).join(" • ")}
            </p>
          </div>
          <Link
            href="/settings"
            className="rounded-lg border border-status-warning/40 bg-surface px-2.5 py-1.5 text-[10px] font-bold text-status-warning transition-colors hover:bg-status-warning/10"
          >
            Cấu hình cảnh báo
          </Link>
        </div>
      )}

      {/* KPI Cards Thống Kê Bãi Xe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Đang trong bãi */}
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-1">
          <div className="flex items-center justify-between text-content-muted">
            <span className="text-xs font-bold uppercase tracking-wider">Đang trong bãi</span>
            <div className="p-2 rounded-lg bg-blue-50 text-primary">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-content-primary font-heading">
            {stats ? stats.currently_parked : "--"}
          </div>
          <p className="text-[11px] text-content-muted">
            <span className="font-semibold text-primary">{stats?.resident_parked ?? 0}</span> xe cư dân •{" "}
            <span className="font-semibold text-content-primary">{stats?.guest_parked ?? 0}</span> xe khách
          </p>
        </div>

        {/* Lượt vào hôm nay */}
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-1">
          <div className="flex items-center justify-between text-content-muted">
            <span className="text-xs font-bold uppercase tracking-wider">Lượt vào hôm nay</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-status-success">
              <LogIn className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-content-primary font-heading">
            {stats ? stats.entries_today : "--"}
          </div>
          <p className="text-[11px] text-status-success flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ghi nhận tự động từ camera làn vào
          </p>
        </div>

        {/* Lượt ra hôm nay */}
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-1">
          <div className="flex items-center justify-between text-content-muted">
            <span className="text-xs font-bold uppercase tracking-wider">Lượt ra hôm nay</span>
            <div className="p-2 rounded-lg bg-amber-50 text-status-warning">
              <LogOut className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-content-primary font-heading">
            {stats ? stats.exits_today : "--"}
          </div>
          <p className="text-[11px] text-content-muted">
            Đối soát ảnh xe vào & cước phí tự động
          </p>
        </div>

        {/* Doanh thu hôm nay */}
        <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-1">
          <div className="flex items-center justify-between text-content-muted">
            <span className="text-xs font-bold uppercase tracking-wider">Doanh thu thu ngân</span>
            <div className="p-2 rounded-lg bg-purple-50 text-accent-purple">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-content-primary font-heading">
            {stats ? stats.revenue_today_vnd.toLocaleString("vi-VN") : "--"} <span className="text-xs font-bold text-content-muted">đ</span>
          </div>
          <p className="text-[11px] text-content-muted">
            {stats?.total_registered_residents ?? 0} xe cư dân đăng ký vé tháng
          </p>
        </div>
      </div>

      {/* Filter và Search Bar */}
      <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo biển số xe hoặc số căn hộ (VD: 51F, A12.05)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary font-mono"
            />
          </div>

          {/* Filter Trạng thái */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-content-muted flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Trạng thái:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary font-medium"
            >
              <option value="ALL">Tất cả phiên</option>
              <option value="PARKED">Đang trong bãi (PARKED)</option>
              <option value="COMPLETED">Đã rời bãi (COMPLETED)</option>
            </select>
          </div>

          {/* Filter Loại vé */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-content-muted">Loại vé:</span>
            <select
              value={ticketFilter}
              onChange={(e) => setTicketFilter(e.target.value)}
              className="text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary font-medium"
            >
              <option value="ALL">Tất cả vé</option>
              <option value="RESIDENT">Cư dân chung cư</option>
              <option value="GUEST">Khách vãng lai</option>
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

      {/* Danh sách Phiên Gửi Xe */}
      <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div>
            <h3 className="font-heading font-bold text-sm text-content-primary">
              Lịch sử Xe Ra Vào & Các Xe Trong Bãi
            </h3>
            <p className="text-[11px] text-content-muted">
              Hiển thị {sessions.length} phiên gửi xe
            </p>
          </div>
        </div>

        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold text-content-muted uppercase bg-surface-muted/60">
                  <th className="py-3 px-3">Ảnh Xe Vào</th>
                  <th className="py-3 px-3">Biển Số Xe</th>
                  <th className="py-3 px-3">Đối Tượng</th>
                  <th className="py-3 px-3">Thời Gian Vào</th>
                  <th className="py-3 px-3">Thời Gian Ra</th>
                  <th className="py-3 px-3">Thời Lượng</th>
                  <th className="py-3 px-3">Đối Soát Lúc Ra</th>
                  <th className="py-3 px-3">Cước Phí</th>
                  <th className="py-3 px-3">Trạng Thái</th>
                  <th className="py-3 px-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sessions.map((item) => {
                  const isParked = item.status === "PARKED";
                  const isResident = item.ticket_type === "RESIDENT";
                  const isMatch = item.is_plate_matched === 1;

                  return (
                    <tr key={item.id} className="hover:bg-surface-muted/50 transition-colors">
                      {/* Ảnh xe vào */}
                      <td className="py-3 px-3">
                        <div
                          onClick={() => setSelectedSessionForDetail(item)}
                          className="relative w-14 h-9 rounded-lg overflow-hidden border border-slate-300 bg-slate-200 cursor-pointer group"
                          title="Bấm để xem chi tiết ảnh chụp xe vào"
                        >
                          {item.entry_plate_crop_url || item.entry_snapshot_url ? (
                            <img
                              src={resolveMediaUrl(item.entry_plate_crop_url || item.entry_snapshot_url)}
                              alt={item.plate_number}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-content-muted">
                              No pic
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Biển số xe */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-content-primary">
                            {item.plate_display || item.plate_number}
                          </span>
                          <p className="text-[10px] text-content-muted capitalize">{item.vehicle_type}</p>
                        </div>
                      </td>

                      {/* Đối tượng */}
                      <td className="py-3 px-3">
                        {isResident ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-primary border border-blue-200">
                              <Building className="w-3 h-3" /> Cư Dân
                            </span>
                            <p className="text-[10px] text-content-muted font-medium">{item.apartment_number}</p>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-content-secondary border border-slate-200">
                            Khách vãng lai
                          </span>
                        )}
                      </td>

                      {/* Thời gian vào */}
                      <td className="py-3 px-3 font-mono text-[11px] text-content-secondary">
                        <div className="space-y-0.5">
                          <p>{item.entry_time?.split("T")[1]?.slice(0, 8) || item.entry_time}</p>
                          <p className="text-[10px] text-content-muted">{item.entry_time?.split("T")[0]}</p>
                        </div>
                      </td>

                      {/* Thời gian ra */}
                      <td className="py-3 px-3 font-mono text-[11px] text-content-secondary">
                        {item.exit_time ? (
                          <div className="space-y-0.5">
                            <p>{item.exit_time?.split("T")[1]?.slice(0, 8) || item.exit_time}</p>
                            <p className="text-[10px] text-content-muted">{item.exit_time?.split("T")[0]}</p>
                          </div>
                        ) : (
                          <span className="text-content-muted text-[10px]">Chưa ra</span>
                        )}
                      </td>

                      {/* Thời lượng đỗ */}
                      <td className="py-3 px-3 font-mono text-[11px] text-content-secondary">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-content-muted" />
                          {Math.floor(item.duration_minutes / 60)}h {item.duration_minutes % 60}m
                        </span>
                      </td>

                      {/* Đối soát lúc ra */}
                      <td className="py-3 px-3">
                        {item.exit_time ? (
                          isMatch ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-status-success bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3" /> Trùng khớp
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-status-error bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" /> Lệch biển số
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-content-muted">--</span>
                        )}
                      </td>

                      {/* Cước phí */}
                      <td className="py-3 px-3 font-mono font-bold text-xs text-content-primary">
                        {isResident ? (
                          <span className="text-[11px] font-semibold text-primary bg-primary-light px-2 py-0.5 rounded border border-primary-border">
                            Vé tháng
                          </span>
                        ) : (
                          <span>{item.parking_fee.toLocaleString("vi-VN")} đ</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="py-3 px-3">
                        {isParked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                            Trong bãi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-content-muted bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                            Đã rời bãi
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isParked && (
                            <button
                              onClick={() => openCheckOutForSession(item)}
                              className="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 transition-colors"
                              title="Check-out xe này ra khỏi bãi"
                            >
                              <LogOut className="w-3 h-3" />
                              <span>Ra bãi</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSessionForDetail(item)}
                            className="p-1.5 rounded-lg border border-border text-content-muted hover:text-content-primary hover:bg-surface-muted transition-colors"
                            title="Xem chi tiết ảnh vào/ra và đối soát"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-content-muted space-y-2">
            <Car className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">Chưa có phiên gửi xe nào phù hợp bộ lọc</p>
            <p className="text-[11px]">Bấm vào &quot;Xe Vào Bãi (Check-in)&quot; để bắt đầu ghi nhận phương tiện</p>
          </div>
        )}
      </div>

      {/* MODAL CHECK-IN (XE VÀO BÃI) */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-status-success border border-emerald-200">
                  <LogIn className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-content-primary">
                    Ghi Nhận Xe Vào Bãi (Check-in)
                  </h3>
                  <p className="text-xs text-content-muted">
                    Hỗ trợ chụp ảnh từ camera hoặc tải ảnh biển số xe
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCheckInModal(false)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCheckInSubmit} className="space-y-4">
              {/* Chọn camera cổng vào */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-content-primary">
                  Camera Cổng Làn Vào:
                </label>
                <select
                  value={checkInCameraId}
                  onChange={(e) => setCheckInCameraId(e.target.value)}
                  className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                >
                  {cameras.length > 0 ? (
                    cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id} - {c.location})
                      </option>
                    ))
                  ) : (
                    <option value="CAM-IN-01">Camera Cổng Vào Làn 1 (CAM-IN-01)</option>
                  )}
                </select>
              </div>

              {/* Upload ảnh xe vào (Tùy chọn hoặc khuyên dùng) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-content-primary flex items-center justify-between">
                  <span>Ảnh chụp xe lúc vào:</span>
                  <span className="text-[10px] text-primary font-normal">
                    (AI sẽ tự động nhận diện biển số từ ảnh)
                  </span>
                </label>
                <div
                  onClick={() => fileInputCheckInRef.current?.click()}
                  className="border-2 border-dashed border-border hover:border-primary rounded-xl p-4 text-center cursor-pointer bg-surface-muted/40 hover:bg-surface-muted transition-colors space-y-2"
                >
                  <input
                    ref={fileInputCheckInRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCheckInFileChange}
                    className="hidden"
                  />
                  {checkInPreview ? (
                    <div className="relative h-32 w-full rounded-lg overflow-hidden border border-border mx-auto">
                      <img
                        src={checkInPreview}
                        alt="Preview"
                        className="w-full h-full object-contain bg-slate-900"
                      />
                    </div>
                  ) : (
                    <div className="py-2 space-y-1">
                      <Upload className="w-6 h-6 mx-auto text-content-muted" />
                      <p className="text-xs font-semibold text-content-secondary">
                        Bấm để tải ảnh chụp xe vào (JPEG, PNG)
                      </p>
                      <p className="text-[10px] text-content-muted">
                        Nếu không tải ảnh, hệ thống sẽ sử dụng biển số nhập bên dưới
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Biển số xe */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Biển số xe:
                  </label>
                  <input
                    type="text"
                    value={checkInPlate}
                    onChange={(e) => setCheckInPlate(e.target.value.toUpperCase())}
                    placeholder="VD: 51F-882.34"
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary uppercase"
                  />
                </div>

                {/* Loại xe */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Loại xe:
                  </label>
                  <select
                    value={checkInVehicleType}
                    onChange={(e) => setCheckInVehicleType(e.target.value as VehicleType)}
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  >
                    <option value="car">Ô tô con</option>
                    <option value="motorcycle">Xe máy</option>
                    <option value="truck">Xe tải</option>
                    <option value="bus">Xe khách</option>
                  </select>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-content-primary">
                  Ghi chú vào bãi:
                </label>
                <input
                  type="text"
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="Ghi chú thêm (tùy chọn)"
                  className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                >
                </input>
              </div>

              {checkInError && (
                <div className="p-2.5 rounded-lg bg-red-50 text-status-error text-xs border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{checkInError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingCheckIn}
                  onClick={() => setShowCheckInModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-content-secondary hover:bg-surface-muted rounded-xl transition-colors border border-border"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckIn}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {isSubmittingCheckIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Xác nhận Xe Vào</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHECK-OUT (XE RA BÃI & ĐỐI SOÁT) */}
      {showCheckOutModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-50 text-primary border border-blue-200">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-content-primary">
                    Ghi Nhận Xe Ra Bãi (Check-out)
                  </h3>
                  <p className="text-xs text-content-muted">
                    Đối soát biển số lúc vào và tính cước phí tự động
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCheckOutModal(false)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {checkOutSuccessResult ? (
              /* Hiển thị kết quả Check-out thành công */
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-status-success mx-auto" />
                  <h4 className="font-heading font-bold text-base text-status-success">
                    Check-out Hoàn Tất Thành Công!
                  </h4>
                  <p className="text-xs text-content-muted">
                    Phương tiện đã được thanh toán và rời bãi đỗ xe an toàn
                  </p>
                </div>

                <div className="p-4 bg-surface-muted rounded-xl border border-border space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-border/80">
                    <span className="text-content-muted">Biển số xe:</span>
                    <span className="font-mono font-bold text-sm text-content-primary">
                      {checkOutSuccessResult.plate_display || checkOutSuccessResult.plate_number}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/80">
                    <span className="text-content-muted">Loại vé:</span>
                    <span className="font-semibold text-content-primary">
                      {checkOutSuccessResult.ticket_type === "RESIDENT" ? (
                        <span className="text-primary font-bold">Cư dân ({checkOutSuccessResult.apartment_number})</span>
                      ) : (
                        "Khách vãng lai"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/80">
                    <span className="text-content-muted">Thời lượng gửi:</span>
                    <span className="font-mono text-content-primary">
                      {Math.floor(checkOutSuccessResult.duration_minutes / 60)} giờ {checkOutSuccessResult.duration_minutes % 60} phút
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-border/80">
                    <span className="text-content-muted">Đối soát biển số:</span>
                    <span className="font-bold">
                      {checkOutSuccessResult.is_plate_matched === 1 ? (
                        <span className="text-status-success flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Trùng khớp 100%
                        </span>
                      ) : (
                        <span className="text-status-error flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Sai lệch biển số lúc vào!
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-sm font-bold">
                    <span className="text-content-primary">Cước phí cần thu:</span>
                    <span className="text-primary text-base font-mono">
                      {checkOutSuccessResult.ticket_type === "RESIDENT"
                        ? "0 đ (Miễn phí cư dân)"
                        : `${checkOutSuccessResult.parking_fee.toLocaleString("vi-VN")} đ`}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setShowCheckOutModal(false);
                      setCheckOutSuccessResult(null);
                    }}
                    className="w-full py-2 bg-primary text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            ) : (
              /* Form nhập Check-out */
              <form onSubmit={handleCheckOutSubmit} className="space-y-4">
                {/* Chọn camera cổng ra */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Camera Cổng Làn Ra:
                  </label>
                  <select
                    value={checkOutCameraId}
                    onChange={(e) => setCheckOutCameraId(e.target.value)}
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  >
                    {cameras.length > 0 ? (
                      cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id} - {c.location})
                        </option>
                      ))
                    ) : (
                      <option value="CAM-OUT-01">Camera Cổng Ra Làn 2 (CAM-OUT-01)</option>
                    )}
                  </select>
                </div>

                {/* Upload ảnh xe ra */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-content-primary flex items-center justify-between">
                    <span>Ảnh chụp xe lúc ra:</span>
                    <span className="text-[10px] text-primary font-normal">
                      (Để AI tự động so sánh đối soát với ảnh lúc vào)
                    </span>
                  </label>
                  <div
                    onClick={() => fileInputCheckOutRef.current?.click()}
                    className="border-2 border-dashed border-border hover:border-primary rounded-xl p-4 text-center cursor-pointer bg-surface-muted/40 hover:bg-surface-muted transition-colors space-y-2"
                  >
                    <input
                      ref={fileInputCheckOutRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCheckOutFileChange}
                      className="hidden"
                    />
                    {checkOutPreview ? (
                      <div className="relative h-32 w-full rounded-lg overflow-hidden border border-border mx-auto">
                        <img
                          src={checkOutPreview}
                          alt="Preview"
                          className="w-full h-full object-contain bg-slate-900"
                        />
                      </div>
                    ) : (
                      <div className="py-2 space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-content-muted" />
                        <p className="text-xs font-semibold text-content-secondary">
                          Bấm để tải ảnh chụp xe lúc ra (JPEG, PNG)
                        </p>
                        <p className="text-[10px] text-content-muted">
                          Hoặc đối soát theo biển số xe bên dưới
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Biển số xe cần check out */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Biển số xe:
                  </label>
                  <input
                    type="text"
                    value={checkOutPlate}
                    onChange={(e) => setCheckOutPlate(e.target.value.toUpperCase())}
                    placeholder="VD: 51F-882.34"
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary uppercase"
                  />
                </div>

                {/* Ghi chú */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Ghi chú xuất bãi:
                  </label>
                  <input
                    type="text"
                    value={checkOutNotes}
                    onChange={(e) => setCheckOutNotes(e.target.value)}
                    placeholder="Ghi chú thêm lúc xuất bãi (tùy chọn)"
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {checkOutError && (
                  <div className="p-2.5 rounded-lg bg-red-50 text-status-error text-xs border border-red-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{checkOutError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isSubmittingCheckOut}
                    onClick={() => setShowCheckOutModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-content-secondary hover:bg-surface-muted rounded-xl transition-colors border border-border"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCheckOut}
                    className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {isSubmittingCheckOut ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang đối soát...</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Xác nhận Xe Ra & Tính Tiền</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT PHIÊN GỬI XE & ĐỐI SOÁT ẢNH VÀO - RA */}
      {selectedSessionForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-primary-light text-primary border border-primary-border">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-content-primary">
                    Đối Soát Ảnh Phiên Gửi Xe: {selectedSessionForDetail.plate_display || selectedSessionForDetail.plate_number}
                  </h3>
                  <p className="text-xs text-content-muted">
                    Mã phiên: <span className="font-mono">{selectedSessionForDetail.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSessionForDetail(null)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* So sánh Side-by-Side Ảnh Vào vs Ảnh Ra */}
            <div className="grid grid-cols-2 gap-4">
              {/* Bên trái: Lượt vào */}
              <div className="p-3 bg-surface-muted rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-status-success">
                  <span className="flex items-center gap-1">
                    <LogIn className="w-3.5 h-3.5" /> 1. LƯỢT VÀO
                  </span>
                  <span className="font-mono text-[11px] text-content-muted">
                    {selectedSessionForDetail.entry_time}
                  </span>
                </div>
                <div className="relative h-44 rounded-lg overflow-hidden border border-slate-300 bg-slate-900 flex items-center justify-center">
                  {selectedSessionForDetail.entry_snapshot_url || selectedSessionForDetail.entry_plate_crop_url ? (
                    <img
                      src={resolveMediaUrl(selectedSessionForDetail.entry_snapshot_url || selectedSessionForDetail.entry_plate_crop_url)}
                      alt="Ảnh vào"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Không có ảnh vào</span>
                  )}
                </div>
                <div className="text-[11px] text-content-muted space-y-0.5">
                  <p>Cổng: <span className="text-content-primary font-medium">{selectedSessionForDetail.entry_gate_name || "Cổng chính"}</span></p>
                  <p>Độ tin cậy: <span className="font-bold text-emerald-600">{(selectedSessionForDetail.entry_confidence * 100).toFixed(0)}%</span></p>
                </div>
              </div>

              {/* Bên phải: Lượt ra */}
              <div className="p-3 bg-surface-muted rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-primary">
                  <span className="flex items-center gap-1">
                    <LogOut className="w-3.5 h-3.5" /> 2. LƯỢT RA
                  </span>
                  <span className="font-mono text-[11px] text-content-muted">
                    {selectedSessionForDetail.exit_time || "Chưa xuất bãi"}
                  </span>
                </div>
                <div className="relative h-44 rounded-lg overflow-hidden border border-slate-300 bg-slate-900 flex items-center justify-center">
                  {selectedSessionForDetail.exit_snapshot_url || selectedSessionForDetail.exit_plate_crop_url ? (
                    <img
                      src={resolveMediaUrl(selectedSessionForDetail.exit_snapshot_url || selectedSessionForDetail.exit_plate_crop_url)}
                      alt="Ảnh ra"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Xe đang trong bãi đỗ</span>
                  )}
                </div>
                <div className="text-[11px] text-content-muted space-y-0.5">
                  <p>Cổng: <span className="text-content-primary font-medium">{selectedSessionForDetail.exit_gate_name || "--"}</span></p>
                  <p>
                    Đối soát:{" "}
                    {selectedSessionForDetail.exit_time ? (
                      selectedSessionForDetail.is_plate_matched === 1 ? (
                        <span className="font-bold text-status-success">Trùng khớp 100%</span>
                      ) : (
                        <span className="font-bold text-status-error">Lệch biển số xe!</span>
                      )
                    ) : (
                      <span>Đang đỗ</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Thông tin Căn hộ & Cước phí */}
            <div className="p-3.5 bg-surface-muted rounded-xl border border-border grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-content-muted">Loại khách hàng:</p>
                <p className="font-bold text-content-primary text-sm mt-0.5">
                  {selectedSessionForDetail.ticket_type === "RESIDENT" ? (
                    <span className="text-primary flex items-center gap-1">
                      <Building className="w-4 h-4" /> Căn hộ {selectedSessionForDetail.apartment_number} ({selectedSessionForDetail.resident_name || "Cư dân"})
                    </span>
                  ) : (
                    "Khách vãng lai"
                  )}
                </p>
              </div>
              <div>
                <p className="text-content-muted">Cước phí gửi xe:</p>
                <p className="font-bold text-primary font-mono text-sm mt-0.5">
                  {selectedSessionForDetail.ticket_type === "RESIDENT"
                    ? "Miễn phí (Vé tháng cư dân)"
                    : `${selectedSessionForDetail.parking_fee.toLocaleString("vi-VN")} đ`}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSessionForDetail(null)}
                className="px-4 py-2 bg-surface hover:bg-surface-muted text-content-primary text-xs font-semibold rounded-xl border border-border transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

