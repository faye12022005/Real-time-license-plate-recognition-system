"use client";

import React, { useState, useEffect } from "react";
import { alprApi } from "@/lib/api";
import { ResidentVehicle, VehicleType } from "@/types";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Building2,
  Search,
  Filter,
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  Phone,
  User,
  Calendar,
  AlertTriangle,
  Loader2,
  X,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

export default function ResidentsManagementPage() {
  const [residents, setResidents] = useState<ResidentVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal Thêm / Sửa xe cư dân
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingResident, setEditingResident] = useState<ResidentVehicle | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    plate_number: "",
    owner_name: "",
    apartment_number: "",
    phone_number: "",
    vehicle_type: "car" as VehicleType,
    rfid_card_id: "",
    monthly_fee: 1200000,
    expiry_date: "2029-12-31",
    status: "ACTIVE" as "ACTIVE" | "EXPIRED" | "LOCKED",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Xóa xe cư dân
  const [residentToDelete, setResidentToDelete] = useState<ResidentVehicle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await alprApi.getResidents({
        q: searchQuery.trim() || undefined,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      setResidents(data);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const openCreateModal = () => {
    setEditingResident(null);
    setFormData({
      id: "",
      plate_number: "",
      owner_name: "",
      apartment_number: "",
      phone_number: "",
      vehicle_type: "car",
      rfid_card_id: "",
      monthly_fee: 1200000,
      expiry_date: "2029-12-31",
      status: "ACTIVE",
      notes: "Cư dân chính chủ",
    });
    setFormError(null);
    setShowFormModal(true);
  };

  const openEditModal = (resident: ResidentVehicle) => {
    setEditingResident(resident);
    setFormData({
      id: resident.id,
      plate_number: resident.plate_display || resident.plate_number,
      owner_name: resident.owner_name,
      apartment_number: resident.apartment_number,
      phone_number: resident.phone_number || "",
      vehicle_type: resident.vehicle_type,
      rfid_card_id: resident.rfid_card_id || "",
      monthly_fee: resident.monthly_fee,
      expiry_date: resident.expiry_date || "2029-12-31",
      status: resident.status,
      notes: resident.notes || "",
    });
    setFormError(null);
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.plate_number.trim() || !formData.owner_name.trim() || !formData.apartment_number.trim()) {
      setFormError("Vui lòng điền đầy đủ Biển số xe, Tên chủ xe và Số căn hộ");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await alprApi.registerResident({
        id: formData.id || undefined,
        plate_number: formData.plate_number.trim(),
        owner_name: formData.owner_name.trim(),
        apartment_number: formData.apartment_number.trim(),
        phone_number: formData.phone_number.trim() || undefined,
        vehicle_type: formData.vehicle_type,
        rfid_card_id: formData.rfid_card_id.trim() || undefined,
        monthly_fee: Number(formData.monthly_fee) || 0,
        expiry_date: formData.expiry_date,
        status: formData.status,
        notes: formData.notes.trim() || undefined,
      });

      setShowFormModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || "Lỗi khi lưu thông tin xe cư dân");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!residentToDelete) return;
    setIsDeleting(true);

    try {
      await alprApi.deleteResident(residentToDelete.id);
      setResidents((prev) => prev.filter((r) => r.id !== residentToDelete.id));
      setResidentToDelete(null);
    } catch (err: any) {
      alert("Lỗi khi xóa xe cư dân: " + (err.message || "Lỗi máy chủ"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header cố định ở trên, không di chuyển khi cuộn */}
      <header className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 bg-background/95 backdrop-blur-md pt-4 lg:pt-6 pb-3.5 border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-black text-2xl text-content-primary tracking-tight flex items-center gap-2">
              <Building2 className="w-7 h-7 text-primary" />
              <span>Quản lý Xe Cư Dân</span>
            </h1>
            <p className="text-xs text-content-muted mt-1">
              Danh sách biển số xe đăng ký vé tháng theo căn hộ, tự động đối soát mở barie khi xe vào/ra bãi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              <span>Đăng ký Xe Cư Dân Mới</span>
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-surface border border-border text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-bento p-5 shadow-bento space-y-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[260px] relative">
            <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo biển số xe, tên chủ xe hoặc số phòng (VD: A12.05, 51F-882)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary font-mono"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-content-muted flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Trạng thái:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary font-medium"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hiệu lực (ACTIVE)</option>
              <option value="EXPIRED">Hết hạn (EXPIRED)</option>
              <option value="LOCKED">Tạm khóa (LOCKED)</option>
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

      {/* Residents Table */}
      <div className="bg-surface border border-border rounded-bento p-6 shadow-bento space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div>
            <h3 className="font-heading font-bold text-sm text-content-primary">
              Danh sách Phương Tiện Cư Dân Đăng Ký Vé Tháng
            </h3>
            <p className="text-[11px] text-content-muted">
              Tổng cộng {residents.length} xe cư dân trong hệ thống
            </p>
          </div>
        </div>

        {residents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold text-content-muted uppercase bg-surface-muted/60">
                  <th className="py-3 px-4">Biển Số Xe</th>
                  <th className="py-3 px-4">Căn Hộ</th>
                  <th className="py-3 px-4">Chủ Xe</th>
                  <th className="py-3 px-4">Số Điện Thoại</th>
                  <th className="py-3 px-4">Loại Xe</th>
                  <th className="py-3 px-4">Mã Thẻ RFID</th>
                  <th className="py-3 px-4">Phí Tháng</th>
                  <th className="py-3 px-4">Hạn Vé</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {residents.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-muted/50 transition-colors">
                    {/* Biển số */}
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-content-primary">
                        {item.plate_display || item.plate_number}
                      </span>
                    </td>

                    {/* Căn hộ */}
                    <td className="py-3 px-4 font-semibold text-content-primary">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        {item.apartment_number}
                      </span>
                    </td>

                    {/* Chủ xe */}
                    <td className="py-3 px-4 text-content-secondary font-medium">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-content-muted" />
                        {item.owner_name}
                      </span>
                    </td>

                    {/* Số điện thoại */}
                    <td className="py-3 px-4 font-mono text-content-secondary">
                      {item.phone_number ? (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-content-muted" />
                          {item.phone_number}
                        </span>
                      ) : (
                        <span className="text-content-muted">--</span>
                      )}
                    </td>

                    {/* Loại xe */}
                    <td className="py-3 px-4">
                      <VehicleBadge type={item.vehicle_type} />
                    </td>

                    {/* Thẻ RFID */}
                    <td className="py-3 px-4 font-mono text-content-muted">
                      {item.rfid_card_id ? (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-content-muted" />
                          {item.rfid_card_id}
                        </span>
                      ) : (
                        <span className="text-content-muted">Nhận diện AI</span>
                      )}
                    </td>

                    {/* Phí tháng */}
                    <td className="py-3 px-4 font-mono text-content-primary font-medium">
                      {item.monthly_fee.toLocaleString("vi-VN")} đ
                    </td>

                    {/* Hạn vé */}
                    <td className="py-3 px-4 font-mono text-[11px] text-content-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-content-muted" />
                        {item.expiry_date}
                      </span>
                    </td>

                    {/* Trạng thái */}
                    <td className="py-3 px-4">
                      {item.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-status-success bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Hiệu lực
                        </span>
                      ) : item.status === "EXPIRED" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-status-warning bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          <Clock className="w-3 h-3" /> Hết hạn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-status-error bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                          <AlertTriangle className="w-3 h-3" /> Tạm khóa
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg border border-border text-content-muted hover:text-primary hover:bg-primary-light transition-colors"
                          title="Sửa thông tin xe cư dân"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setResidentToDelete(item)}
                          className="p-1.5 rounded-lg border border-border text-content-muted hover:text-status-error hover:bg-red-50 transition-colors"
                          title="Xóa xe cư dân khỏi hệ thống"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="Chưa có Xe Cư Dân Nào Được Đăng Ký"
            description="Hãy bấm nút 'Đăng ký Xe Cư Dân Mới' để bắt đầu thêm phương tiện của cư dân các căn hộ vào hệ thống."
            actionText="Đăng ký xe ngay"
            onAction={openCreateModal}
          />
        )}
      </div>

      {/* MODAL THÊM / SỬA XE CƯ DÂN */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-primary-light text-primary border border-primary-border">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-content-primary">
                    {editingResident ? "Cập Nhật Thông Tin Xe Cư Dân" : "Đăng Ký Xe Cư Dân Mới"}
                  </h3>
                  <p className="text-xs text-content-muted">
                    Liên kết biển số xe với căn hộ chung cư để miễn phí gửi xe
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                {/* Biển số xe */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Biển số xe: <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.plate_number}
                    onChange={(e) => setFormData({ ...formData, plate_number: e.target.value.toUpperCase() })}
                    placeholder="VD: 51F-882.34"
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary uppercase"
                  />
                </div>

                {/* Số căn hộ */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Số căn hộ: <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.apartment_number}
                    onChange={(e) => setFormData({ ...formData, apartment_number: e.target.value })}
                    placeholder="VD: A12.05 - Tòa Ruby"
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Chủ hộ */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Họ tên chủ xe: <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.owner_name}
                    onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                    placeholder="VD: Nguyễn Văn An"
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Số điện thoại */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Số điện thoại:
                  </label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="VD: 0908123456"
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Loại xe */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Loại phương tiện:
                  </label>
                  <select
                    value={formData.vehicle_type}
                    onChange={(e) => {
                      const vType = e.target.value as VehicleType;
                      setFormData({
                        ...formData,
                        vehicle_type: vType,
                        monthly_fee: vType === "car" ? 1200000 : 120000,
                      });
                    }}
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  >
                    <option value="car">Ô tô con</option>
                    <option value="motorcycle">Xe máy</option>
                    <option value="truck">Xe tải</option>
                    <option value="bus">Xe khách</option>
                  </select>
                </div>

                {/* Mã thẻ RFID */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Mã thẻ từ RFID (tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={formData.rfid_card_id}
                    onChange={(e) => setFormData({ ...formData, rfid_card_id: e.target.value })}
                    placeholder="VD: RFID-123456"
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Phí tháng */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Phí tháng (VNĐ):
                  </label>
                  <input
                    type="number"
                    value={formData.monthly_fee}
                    onChange={(e) => setFormData({ ...formData, monthly_fee: Number(e.target.value) || 0 })}
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Ngày hết hạn */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Hạn vé tháng:
                  </label>
                  <input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="w-full text-xs font-mono bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Trạng thái */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-content-primary">
                    Trạng thái:
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                  >
                    <option value="ACTIVE">Hiệu lực</option>
                    <option value="EXPIRED">Hết hạn</option>
                    <option value="LOCKED">Tạm khóa</option>
                  </select>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-content-primary">
                  Ghi chú:
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ghi chú thêm (VD: Cư dân chính chủ)"
                  className="w-full text-xs bg-surface-muted border border-border rounded-xl px-3 py-2 text-content-primary focus:outline-none focus:border-primary"
                />
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 text-status-error text-xs border border-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-content-secondary hover:bg-surface-muted rounded-xl transition-colors border border-border"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>{editingResident ? "Lưu Thay Đổi" : "Đăng Ký Xe"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA XE CƯ DÂN */}
      {residentToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-100 text-status-error border border-red-200 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-base text-content-primary">
                  Xóa Xe Cư Dân Khỏi Hệ Thống?
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Xe sẽ chuyển thành vé khách vãng lai khi ra/vào bãi
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-surface-muted rounded-xl border border-border text-xs space-y-1.5">
              <p>Biển số: <b className="font-mono text-content-primary">{residentToDelete.plate_display || residentToDelete.plate_number}</b></p>
              <p>Chủ xe: <span className="text-content-primary font-medium">{residentToDelete.owner_name}</span></p>
              <p>Căn hộ: <span className="text-primary font-bold">{residentToDelete.apartment_number}</span></p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={isDeleting}
                onClick={() => setResidentToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-content-secondary hover:bg-surface-muted rounded-xl transition-colors border border-border"
              >
                Hủy bỏ
              </button>
              <button
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-semibold text-white bg-status-error hover:bg-red-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận Xóa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

