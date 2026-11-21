import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { NetworkStatusBanner } from "@/components/shared/NetworkStatusBanner";

export const metadata: Metadata = {
  title: "Smart ALPR 2.0 — Thống kê & Truy vết biển số",
  description: "Hệ thống nhận diện và truy vết biển số xe qua video sử dụng AI & Bento Grid UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="bg-background text-content-primary h-screen max-h-screen overflow-hidden antialiased flex flex-row">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Content Workspace: CHỈ PHẦN MAIN LÀ CÓ SCROLL, HEADER CỐ ĐỊNH KHÔNG DI CHUYỂN */}
        <main className="flex-1 h-screen max-h-screen overflow-y-auto overflow-x-hidden min-w-0">
          <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 h-full flex flex-col min-h-0">
            <NetworkStatusBanner />
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
