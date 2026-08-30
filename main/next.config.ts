import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const editorEntry = path.join(rootDir, "src/editor/index.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: [
    "@prisma/client",
    "better-sqlite3",
    "sharp",
    "archiver",
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
