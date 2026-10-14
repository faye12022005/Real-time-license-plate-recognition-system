import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

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
      <body className="bg-background text-content-primary min-h-screen antialiased flex flex-row">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Content Workspace (Không header dư thừa, tối đa hóa không gian trải nghiệm) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
