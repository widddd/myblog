import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const editorEntry = path.join(rootDir, "src/editor/index.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/media/image-loader.ts",
    unoptimized: true,
  },
  async headers() {
    const privateNoStore = [
      { key: "Cache-Control", value: "private, no-store" },
    ];
    return [
      { source: "/admin", headers: privateNoStore },
      { source: "/admin/:path*", headers: privateNoStore },
      { source: "/api/admin/:path*", headers: privateNoStore },
      { source: "/api/auth/:path*", headers: privateNoStore },
    ];
  },
  experimental: {
    proxyClientMaxBodySize: "512mb",
  },
  serverExternalPackages: [
    "@prisma/client",
    "better-sqlite3",
    "sharp",
    "archiver",
    "cos-nodejs-sdk-v5",
  ],
  turbopack: {
    resolveAlias: {
      "@myblog/mdx-editor": "./src/editor/index.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@myblog/mdx-editor": editorEntry,
    };
    return config;
  },
};

export default nextConfig;
