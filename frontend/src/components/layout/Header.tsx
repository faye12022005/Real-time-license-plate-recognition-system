"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, Upload, Sparkles } from "lucide-react";
import Link from "next/link";

export function Header() {
  const router = useRouter();
  const [quickQuery, setQuickQuery] = useState("");

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickQuery.trim()) {
      router.push(`/trace?q=${encodeURIComponent(quickQuery.trim())}`);
    }
  };

  return (
    <header className="h-16 bg-surface border-b border-border px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Quick Search for Plates */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <form onSubmit={handleQuickSearch} className="w-full relative">
          <Search className="w-4 h-4 text-content-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="Tra cứu nhanh biển số (VD: 51F-882, 59P2*, 29A)..."
            className="w-full pl-9 pr-12 py-2 text-xs bg-surface-muted border border-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary focus:bg-surface font-mono transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-surface text-content-muted border border-border px-1.5 py-0.5 rounded font-mono shadow-2xs">
            ↵
          </kbd>
        </form>
      </div>

      {/* Right: Actions, Notifications & Profile */}
      <div className="flex items-center gap-3">
        {/* Quick Upload Video Button */}
        <Link
          href="/upload"
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Tải lên Video</span>
        </Link>

        {/* Notifications Button */}
        <button
          aria-label="Thông báo hệ thống"
          className="relative p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-muted border border-transparent hover:border-border transition-all"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-accent-red absolute top-1.5 right-1.5 ring-2 ring-white" />
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-primary/20">
            ITS
          </div>
        </div>
      </div>
    </header>
  );
}
