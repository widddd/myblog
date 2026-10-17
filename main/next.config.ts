import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const editorEntry = path.join(rootDir, "src/editor/index.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  // 局域网真机调试：Next 16 默认拦截跨源访问 /_next 与 /__nextjs 内部资源（403）。
  // 只匹配 Origin 的 hostname（不含协议与端口），* 恰好替换一段标签：192.168.2.* 可覆盖 .36 且抗 DHCP 漂移。
  // 仅 dev 生效，不影响生产构建；不用真机时删掉此块即可。
  // 10.0.2.2 是 Android 模拟器约定的宿主机回环地址（真机壳/模拟器都要能连 HMR）。
  // 127.0.0.1 必须有：`pnpm shot` / CDP 截图工具默认就用 127.0.0.1，而 localhost 不算同源 ——
  // 缺了它页面照常渲染，但客户端 chunk 全被 403 拦掉、**整页不 hydrate**（交互全哑、附带的
  // 副作用也不执行），看起来像"功能坏了"。见 docs/pitfalls.md P-138。
  allowedDevOrigins: ["127.0.0.1", "192.168.2.*", "*.ts.net", "10.0.2.2"],
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
