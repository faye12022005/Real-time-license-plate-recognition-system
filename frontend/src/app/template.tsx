import React from "react";

/**
 * Bọc toàn bộ nội dung dưới Root Layout. File này remount mỗi lần chuyển route:
 * - trạng thái cũ không bị giữ sang trang khác;
 * - có nơi thống nhất để thêm hiệu ứng chuyển trang.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in duration-200">{children}</div>;
}
