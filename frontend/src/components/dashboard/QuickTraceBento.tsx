"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Compass, ArrowRight, ShieldCheck, History } from "lucide-react";
import { alprApi } from "@/lib/api";
import { PlateTraceSummary } from "@/types";
import { PlateBadge } from "@/components/shared/Badge";

export function QuickTraceBento() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlateTraceSummary[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await alprApi.tracePlate(query.trim());
    setResults(res);
    setHasSearched(true);
  };

  return (
    <div className="bg-surface border border-border rounded-bento p-5 lg:p-6 shadow-bento flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-sm tracking-tight text-content-primary">
              Truy vết Phương tiện Nhanh (Forensic Trace)
            </h3>
            <p className="text-[11px] text-content-muted">
              Tra cứu lịch sử xuất hiện của biển số trên tất cả video đã xử lý
            </p>
          </div>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập biển số (VD: 51F-882, 59P2*, 29A)..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span>Truy vết</span>
          </button>
        </form>

        {/* Results Preview */}
        {hasSearched && (
          <div className="space-y-2 mt-2">
            {results.length > 0 ? (
              results.map((item) => (
                <div
                  key={item.plate_number}
                  onClick={() => router.push(`/trace?q=${encodeURIComponent(item.plate_number)}`)}
                  className="p-3 rounded-xl bg-surface-muted hover:bg-blue-50/60 border border-border/80 hover:border-primary/40 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PlateBadge display={item.plate_display} color={item.plate_type} />
                      <span className="text-[11px] font-medium text-content-secondary">
                        {item.province}
                      </span>
                    </div>
                    <p className="text-[10px] text-content-muted flex items-center gap-1">
                      <History className="w-3 h-3" />
                      Xuất hiện {item.total_detections} lần qua {item.distinct_videos} video
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-primary text-xs font-semibold">
                    <span>Chi tiết</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-content-muted text-center py-4">
                Không tìm thấy biển số phù hợp trong cơ sở dữ liệu.
              </p>
            )}
          </div>
        )}
      </div>

      {!hasSearched && (
        <div className="pt-4 border-t border-border/80 text-[11px] text-content-muted flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-status-success" />
            Tìm kiếm chính xác hoặc ký tự đại diện wildcard (*)
          </span>
        </div>
      )}
    </div>
  );
}
