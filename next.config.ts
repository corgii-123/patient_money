import type { NextConfig } from "next";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const normalizedBasePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+/, "").replace(/\/+$/, "")}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    // GitHub Pages 不支持 Next.js 默认的 Image 优化服务
    unoptimized: true,
  },
  basePath: normalizedBasePath || undefined,
  assetPrefix: normalizedBasePath || undefined,
};

export default nextConfig;
