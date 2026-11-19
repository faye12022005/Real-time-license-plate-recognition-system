"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PlatesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/trace");
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center text-xs text-content-muted">
      Đang chuyển tiếp tới trang Truy vết Biển số...
    </div>
  );
}
