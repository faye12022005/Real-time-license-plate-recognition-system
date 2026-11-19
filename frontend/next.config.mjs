/** @type {import('next').NextConfig} */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

// Frontend và backend dùng chung một file .env.local ở thư mục gốc dự án.
// Next.js mặc định chỉ đọc .env* trong thư mục frontend, nên load thêm từ root.
loadEnvConfig(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.env.NODE_ENV !== "production", undefined, true);

const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
