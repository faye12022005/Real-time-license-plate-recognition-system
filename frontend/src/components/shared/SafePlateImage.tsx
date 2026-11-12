"use client";

import React, { useState } from "react";
import Image from "next/image";
import { CameraOff, Scan } from "lucide-react";

interface SafePlateImageProps {
  src?: string;
  alt: string;
  className?: string;
  plateNumber?: string;
  fill?: boolean;
}

export function SafePlateImage({
  src,
  alt,
  className = "object-cover",
  plateNumber,
  fill = true,
}: SafePlateImageProps) {
  const [hasError, setHasError] = useState(false);

  // Khi không có ảnh hoặc ảnh bị 404/lỗi tải: hiển thị Fallback Placeholder công nghệ
  if (!src || hasError) {
    return (
      <div className="w-full h-full bg-slate-900 text-slate-400 flex flex-col items-center justify-center p-1.5 select-none text-center">
        <Scan className="w-4 h-4 text-slate-500 mb-0.5 opacity-70" />
        <span className="text-[9px] font-mono font-bold text-slate-300 tracking-wider truncate max-w-full px-1">
          {plateNumber || "NO CROP"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      unoptimized
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
