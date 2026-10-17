#!/usr/bin/env node
/**
 * count-loc.mjs — 统计「自己写的代码」有多少行（只读、零依赖、不进 `pnpm test`）
 *
 * 跑法（`main/` 下）：
 *   pnpm loc                        默认：博客 / 安卓 App / 周边 三块分开报
 *   pnpm loc -- --all               额外列出「没计入的都有什么、为什么」
 *   pnpm loc -- --files --scope blog  逐文件明细（排查「谁这么大」用）
 *   pnpm loc -- --json > loc.json   机器可读
 * 仓库根下等价：`node main/scripts/count-loc.mjs`
 *
 * 口径（为什么这么数）：
 *   1. 只数仓库里人写的文件：依赖（`node_modules`）、vendor 冻结子树（`src/editor`）、
 *      构建产物（`.next` / `build`）、运行时数据（`main/data`）、锁文件（`pnpm-lock.yaml`）、
 *      二进制（前 8KB 含 NUL 字节）一律不计。
 *   2. 行数 = 物理行（`\n` 计数 + 末行无换行补 1），空行照数；同时给「非空行」参考值。
 *   3. 一个文件只会落进一个桶（先声明先命中），不会重复计数；没被任何桶接住的文件
 *      会在 `--all` 里按扩展名汇总，防止「漏数了却没人发现」。
 *   4. 目录不存在就跳过并提示——本脚本随更新包发到服务器，那边没有 `androidapp/`。
 *
 * 路径一律先归一化成 posix 再比较（Windows 开发 / Linux 部署同一套判定，见 P-006）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 配置：桶（bucket）＝ 一组「同性质文件」的统计单位
//   dirs     ：要遍历的目录或单个文件（相对仓库根）
//   exts     ：扩展名白名单（小写、带点）；null = 任意文本文件
//   exclude  ：路径前缀黑名单（相对仓库根，posix）
//   kind     ：
//     code   —— 自己写的代码，计入小计
//     config —— 自己写的工程配置，单独一行（不想算代码就不加它）
//     side   —— 项目周边，不计入两个项目
//     other  —— 明确不计入（vendor / 依赖 / 产物 / 数据 / 文档 / 第三方）
// ---------------------------------------------------------------------------

const BUCKETS = [
  // ---------------- 博客站点：main/ ----------------
  {
    scope: "blog",
    kind: "code",
    label: "应用源码 src/**",
    dirs: ["main/src"],
    exts: [".ts", ".tsx"],
    exclude: ["main/src/editor"],
    note: "前台 + 后台 + lib，排除 vendor 子树 src/editor",
  },
  {
    scope: "blog",
    kind: "code",
    label: "样式 src/**/*.css",
    dirs: ["main/src"],
    exts: [".css"],
    exclude: ["main/src/editor"],
    note: "globals.css / admin.css / albums.css 等自己写的样式",
  },
  {
    scope: "blog",
    kind: "code",
    label: "数据层 prisma/",
    dirs: ["main/prisma"],
    exts: [".prisma", ".ts"],
    exclude: ["main/prisma/migrations"],
    note: "schema.prisma + seed.ts",
  },
  {
    scope: "blog",
    kind: "code",
    label: "迁移 SQL prisma/migrations/",
    dirs: ["main/prisma/migrations"],
    exts: [".sql", ".toml"],
    exclude: [],
    note: "prisma migrate 生成的 DDL，按自己的迁移写",
  },
  {
    scope: "blog",
    kind: "code",
    label: "运维/验证脚本 scripts/",
    dirs: ["main/scripts"],
    exts: [".ts", ".cjs", ".mjs", ".sh"],
    exclude: [],
    note: "boot / 打包 / 更新 / 恢复 / UI 与端到端验证脚本",
  },
  {
    scope: "blog",
    kind: "code",
    label: "静态页 public/*.html",
    dirs: ["main/public"],
    exts: [".html"],
    exclude: [],
    note: "自己写的静态页（Next 脚手架自带的 svg 不算，见 --all）",
  },
  {
    scope: "blog",
    kind: "config",
    label: "工程配置 main/ 根",
    dirs: ["main"],
    exts: [".json", ".ts", ".mjs", ".cjs", ".yaml", ".npmrc", ".example", ".gitignore"],
    exclude: [
      "main/src",
      "main/scripts",
      "main/prisma",
      "main/public",
      // 依赖锁（9,631 行）与 Next 生成的 next-env.d.ts 都不是自己写的：
      // 漏掉前者会让「工程配置」虚高 30 倍，口径直接失真。
      "main/pnpm-lock.yaml",
      "main/next-env.d.ts",
    ],
    note: "next/tsconfig/postcss/eslint/package.json/.npmrc/.env.example 等（锁文件与 next-env.d.ts 除外）",
  },

  // ---------------- 安卓 App：androidapp/ ----------------
  {
    scope: "android",
    kind: "code",
    label: "Kotlin 主源码 app/src/main/",
    dirs: ["androidapp/app/src/main"],
    exts: [".kt"],
    exclude: [],
    note: "宿主、相册、编辑器、录音、播放、压缩等",
  },
  {
    scope: "android",
    kind: "code",
    label: "资源与 Manifest (*.xml)",
    dirs: ["androidapp/app/src/main"],
    exts: [".xml"],
    exclude: [],
    note: "AndroidManifest + res/ 的布局、values、drawable",
  },
  {
    scope: "android",
    kind: "code",
    label: "Kotlin JVM 单测 app/src/test/",
    dirs: ["androidapp/app/src/test"],
    exts: [".kt"],
    exclude: [],
    note: "AppUrl / 压缩策略 / 录音策略 / 编辑器状态等纯逻辑单测",
  },
  {
    scope: "android",
    kind: "code",
    label: "Gradle 构建脚本 (*.kts)",
    dirs: ["androidapp"],
    exts: [".kts"],
    exclude: ["androidapp/build", "androidapp/app/build", "androidapp/.gradle"],
    note: "根 build.gradle.kts / settings.gradle.kts / app/build.gradle.kts",
  },
  {
    scope: "android",
    kind: "config",
    label: "构建配置 *.properties / .gitignore",
    dirs: ["androidapp"],
    exts: [".properties", ".gitignore"],
    exclude: ["androidapp/gradle/wrapper", "androidapp/local.properties"],
    note: "gradle.properties 与 androidapp/.gitignore 是手写的；wrapper 的 properties 与 local.properties 是生成物，不算",
  },
  {
    scope: "android",
    kind: "code",
    label: "调试脚本 tools/",
    dirs: ["androidapp/tools"],
    exts: [".bat"],
    exclude: [],
    note: "起模拟器的小脚本",
  },

  // ---------------- 周边：不是两个项目本体，单独列、不计入 ----------------
  {
    scope: "side",
    kind: "side",
    label: "App 下载落地页",
    dirs: ["smartblog.html"],
    exts: [".html"],
    exclude: [],
    note: "仓库根的单文件落地页，跟 App 一起发但不算 App 代码",
  },
  {
    scope: "side",
    kind: "side",
    label: "宣传片工程 promo/",
    dirs: ["promo"],
    exts: [".html", ".js", ".mjs", ".css", ".py", ".json"],
    exclude: [],
    note: "onetake 合成流水线，不进仓库、与站点运行时无关",
  },

  // ---------------- 明确不计入（--all 才展开） ----------------
  {
    scope: "other",
    kind: "other",
    label: "vendor：src/editor/",
    dirs: ["main/src/editor"],
    exts: [".ts", ".tsx", ".css"],
    exclude: [],
    note: "mdx-editor v4.2.3 源码，冻结子树、不是自己写的（P-005）",
  },
  {
    scope: "other",
    kind: "other",
    label: "锁文件 pnpm-lock.yaml",
    dirs: ["main/pnpm-lock.yaml"],
    exts: [".yaml"],
    exclude: [],
    note: "包管理器生成，属依赖范畴",
  },
  {
    scope: "other",
    kind: "other",
    label: "文档 docs/ 与 *.md",
    dirs: ["docs", "main", ".", "androidapp", "changelog"],
    exts: [".md"],
    exclude: ["main/src", "main/scripts", "main/public", "main/prisma"],
    note: "规章与手册，不是代码",
  },
  {
    scope: "other",
    kind: "other",
    label: "后台参照稿 demo/",
    dirs: ["demo"],
    exts: null,
    exclude: [],
    note: "视觉参照稿，只读不动",
  },
  {
    scope: "other",
    kind: "other",
    label: "第三方主题 reference/",
    dirs: ["reference"],
    exts: null,
    exclude: [],
    note: "第三方主题源码 + 旧站导出 + 私人笔记，只读不动（P-092）",
  },
  {
    scope: "other",
    kind: "other",
    label: "Gradle wrapper 与本地 SDK 路径",
    dirs: ["androidapp"],
    exts: ["(noext)", ".bat"],
    exclude: ["androidapp/tools"],
    note: "gradlew / gradlew.bat 由 gradle wrapper 任务产出，非手写",
  },
];

const SCOPES = [
  { id: "blog", title: "博客项目  main/（Next.js 站点本体）" },
  { id: "android", title: "安卓 App  androidapp/（Kotlin 宿主 SmartBlog）" },
  { id: "side", title: "周边（不计入上面两项）" },
  { id: "other", title: "未计入明细（依赖 / vendor / 产物 / 数据 / 文档）" },
];

/** 遍历时永远跳过的目录名（依赖、产物、运行时数据、IDE）。 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "build",
  "dist",
  "out",
  ".gradle",
  ".idea",
  ".kotlin",
  "__pycache__",
  ".cache",
  ".turbo",
  "coverage",
  ".vscode",
  "data",
  ".ui-shots",
  ".promo-shots",
]);

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/** 相对路径统一成 posix 形式，跨平台比较只认这一套（P-006）。 */
function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

/** 终端显示宽度：CJK 全角按 2 列算，用来对齐中文表头。 */
function displayWidth(text) {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

function padRight(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function padLeft(text, width) {
  return " ".repeat(Math.max(0, width - displayWidth(text))) + text;
}

/** 千分位；不用 toLocaleString，避免小 ICU 环境下输出不一致。 */
function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 数一个文件：返回 { lines, nonBlank, bytes }；二进制返回 null。
 * 行数口径 = `\n` 计数 + 末行无换行补 1；空文件 0 行。
 */
function measureFile(abs) {
  const buf = fs.readFileSync(abs);
  if (buf.subarray(0, 8192).includes(0)) return null;
  const text = buf.toString("utf8");
  if (text === "") return { lines: 0, nonBlank: 0, bytes: buf.length };
  const lines = text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  let nonBlank = 0;
  for (const line of text.split("\n")) {
    if (line.trim() !== "") nonBlank += 1;
  }
  return { lines, nonBlank, bytes: buf.length };
}

/** 深度遍历，产出绝对路径（目录不存在就返回空）。 */
function* walk(abs) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return;
  }
  if (stat.isFile()) {
    yield abs;
    return;
  }
  if (!stat.isDirectory()) return;
  const stack = [abs];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(child);
      } else if (entry.isFile()) {
        yield child;
      }
    }
  }
}

function extOf(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext !== "") return ext;
  return name.startsWith(".") ? name.toLowerCase() : "(noext)";
}

function parseArgs(argv) {
  const options = {
    scope: new Set(SCOPES.map((s) => s.id)),
    json: false,
    files: false,
    all: false,
    root: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--files") options.files = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root") options.root = argv[++i];
    else if (arg === "--scope") {
      const value = argv[++i];
      const ids = String(value).split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = ids.filter((id) => !SCOPES.some((s) => s.id === id));
      if (unknown.length > 0) {
        throw new Error(`未知 --scope：${unknown.join(", ")}（可用：${SCOPES.map((s) => s.id).join(" / ")}）`);
      }
      options.scope = new Set(ids);
    } else {
      throw new Error(`未知参数：${arg}（--help 看用法）`);
    }
  }
  return options;
}

function usage() {
  return [
    "count-loc.mjs —— 只统计「自己写的代码」行数（只读）",
    "",
    "用法：node scripts/count-loc.mjs [选项]",
    "  --all              额外展开「未计入明细」与「没被任何桶接住的文件」",
    "  --files            逐文件明细（按行数倒序）",
    "  --scope <ids>      只报指定块：blog / android / side / other（逗号分隔）",
    "  --json             输出 JSON（含每个桶的文件数与字节数）",
    "  --root <dir>       指定仓库根（默认取本脚本的上两级目录）",
    "  -h, --help         这份说明",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

function collect(root, scopes) {
  const claimed = new Set();
  const stats = new Map();

  for (const scope of scopes) {
    for (const bucket of BUCKETS) {
      if (bucket.scope !== scope.id) continue;
      const key = `${scope.id}\u0000${bucket.label}`;
      const entry = stats.get(key) ?? { bucket, scope: scope.id, files: 0, lines: 0, nonBlank: 0, bytes: 0, items: [] };
      for (const dir of bucket.dirs) {
        const absDir = path.resolve(root, dir);
        for (const absFile of walk(absDir)) {
          const rel = toPosix(path.relative(root, absFile));
          if (claimed.has(rel)) continue;
          if (bucket.exclude.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
          const ext = extOf(path.basename(absFile));
          if (bucket.exts !== null && !bucket.exts.includes(ext)) continue;
          const measured = measureFile(absFile);
          claimed.add(rel);
          if (measured === null) continue;
          entry.files += 1;
          entry.lines += measured.lines;
          entry.nonBlank += measured.nonBlank;
          entry.bytes += measured.bytes;
          entry.items.push({ path: rel, lines: measured.lines, nonBlank: measured.nonBlank, bytes: measured.bytes });
        }
      }
      if (entry.files > 0) stats.set(key, entry);
    }
  }

  return { claimed, stats: [...stats.values()] };
}

/** 全仓库审计：谁都没接住的文件按扩展名汇总（防止悄悄漏数）。 */
function auditUnclaimed(root, claimed) {
  const byExt = new Map();
  for (const absFile of walk(path.resolve(root, "."))) {
    const rel = toPosix(path.relative(root, absFile));
    if (claimed.has(rel)) continue;
    const ext = extOf(path.basename(absFile));
    const entry = byExt.get(ext) ?? { ext, files: 0, lines: 0, bytes: 0, samples: [] };
    const measured = measureFile(absFile);
    entry.files += 1;
    if (measured !== null) {
      entry.lines += measured.lines;
      entry.bytes += measured.bytes;
      if (entry.samples.length < 5) entry.samples.push(rel);
    } else {
      entry.binary = (entry.binary ?? 0) + 1;
    }
    byExt.set(ext, entry);
  }
  return [...byExt.values()].sort((a, b) => b.files - a.files);
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function renderTable(header, rows) {
  const widths = header.map((cell, i) =>
    Math.max(displayWidth(cell), ...rows.map((row) => displayWidth(String(row[i] ?? "")))),
  );
  const numeric = new Set([1, 2, 3]);
  const line = (cells) =>
    cells
      .map((cell, i) => (numeric.has(i) ? padLeft(String(cell), widths[i]) : padRight(String(cell), widths[i])))
      .join("  ")
      .trimEnd();
  const out = [line(header), widths.map((w) => "─".repeat(w)).join("  ").trimEnd()];
  for (const row of rows) out.push(line(row));
  return out;
}

function summarize(entries, kind) {
  return entries
    .filter((entry) => entry.bucket.kind === kind)
    .reduce(
      (acc, entry) => ({
        files: acc.files + entry.files,
        lines: acc.lines + entry.lines,
        nonBlank: acc.nonBlank + entry.nonBlank,
      }),
      { files: 0, lines: 0, nonBlank: 0 },
    );
}

function report(options, root, entries, unclaimed) {
  const lines = [];
  lines.push("自写代码行数统计（只读）");
  lines.push(`仓库根：${root}`);
  lines.push("口径：物理行（含空行）；依赖 / vendor / 构建产物 / 运行时数据 / 锁文件 / 二进制不计入；");
  lines.push("      一个文件只落一个桶，先声明先命中。`--all` 看没计入了什么。");
  lines.push("");

  const totals = {};
  for (const scope of SCOPES) {
    if (!options.scope.has(scope.id)) continue;
    const own = entries.filter((entry) => entry.scope === scope.id);
    if (own.length === 0) continue;
    lines.push(`▍${scope.title}`);
    const rows = [];
    for (const entry of own.sort((a, b) => b.lines - a.lines)) {
      const tag = entry.bucket.kind === "code" ? "" : `（${entry.bucket.kind === "config" ? "配置" : "不计入"}）`;
      rows.push([entry.bucket.label + tag, entry.files, fmt(entry.lines), fmt(entry.nonBlank)]);
    }
    const code = summarize(own, "code");
    const config = summarize(own, "config");
    const side = summarize(own, "side");
    if (scope.id === "other") {
      lines.push(...renderTable(["未计入项", "文件", "行数", "非空行"], rows));
    } else {
      lines.push(...renderTable(["类别", "文件", "行数", "非空行"], rows));
      lines.push("");
      if (code.files > 0) lines.push(`  代码小计      ${padLeft(fmt(code.files), 5)} 文件   ${padLeft(fmt(code.lines), 9)} 行（非空 ${fmt(code.nonBlank)}）`);
      if (config.files > 0) lines.push(`  配置小计      ${padLeft(fmt(config.files), 5)} 文件   ${padLeft(fmt(config.lines), 9)} 行`);
      if (side.files > 0) lines.push(`  本块小计      ${padLeft(fmt(side.files), 5)} 文件   ${padLeft(fmt(side.lines), 9)} 行`);
      const head = code.lines + config.lines + (scope.id === "side" ? side.lines : 0);
      if (scope.id !== "side") lines.push(`  合计（代码+配置）${" ".repeat(2)}${padLeft(fmt(code.files + config.files), 5)} 文件   ${padLeft(fmt(head), 9)} 行`);
      totals[scope.id] = {
        code: code.lines,
        config: config.lines,
        side: side.lines,
        total: head,
        files: code.files + config.files,
      };
    }
    lines.push("");
  }

  if (options.scope.has("blog") && options.scope.has("android") && totals.blog && totals.android) {
    lines.push("▍两项目合计");
    lines.push(`  博客（代码）        ${padLeft(fmt(totals.blog.code), 9)} 行`);
    lines.push(`  博客（+工程配置）   ${padLeft(fmt(totals.blog.total), 9)} 行`);
    lines.push(`  安卓 App（代码）    ${padLeft(fmt(totals.android.code), 9)} 行`);
    lines.push(`  安卓 App（+构建配置）${padLeft(fmt(totals.android.total), 8)} 行`);
    lines.push(`  ─────────────────────────────`);
    lines.push(`  两项目合计（代码）  ${padLeft(fmt(totals.blog.code + totals.android.code), 9)} 行`);
    lines.push(`  两项目合计（含配置）${padLeft(fmt(totals.blog.total + totals.android.total), 8)} 行`);
    if (totals.side) lines.push(`  周边另计（不计入）  ${padLeft(fmt(totals.side.total), 9)} 行`);
    lines.push("");
  }

  if (options.all) {
    lines.push("▍没被任何桶接住的文件（按扩展名，检查有没有漏数）");
    const rows = unclaimed.map((entry) => [
      entry.ext,
      entry.files,
      entry.binary ? `${fmt(entry.binary)} 个二进制` : fmt(entry.lines),
      entry.samples[0] ?? "",
    ]);
    if (rows.length === 0) lines.push("  （无）");
    else lines.push(...renderTable(["扩展名", "文件", "行数", "样例"], rows));
    lines.push("");
  }

  if (options.files) {
    lines.push("▍逐文件明细（行数倒序）");
    const all = entries
      .filter((entry) => entry.bucket.kind !== "other")
      .flatMap((entry) => entry.items.map((item) => ({ ...item, bucket: entry.bucket.label })));
    for (const item of all.sort((a, b) => b.lines - a.lines)) {
      lines.push(`${padLeft(fmt(item.lines), 7)}  ${item.path}`);
    }
    lines.push("");
  }

  return { text: lines.join("\n"), totals };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error.message));
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const root = options.root ? path.resolve(options.root) : path.resolve(here, "..", "..");
  if (!fs.existsSync(root)) {
    console.error(`仓库根不存在：${root}`);
    process.exitCode = 2;
    return;
  }

  const missing = ["main", "androidapp"].filter((dir) => !fs.existsSync(path.resolve(root, dir)));
  const scopes = SCOPES.filter((scope) => options.scope.has(scope.id) && (options.all || scope.id !== "other"));
  const { claimed, stats } = collect(root, scopes);
  const unclaimed = options.all ? auditUnclaimed(root, claimed) : [];
  const { text, totals } = report(options, root, stats, unclaimed);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          root,
          scope: [...options.scope],
          missing,
          totals,
          buckets: stats.map((entry) => ({
            scope: entry.scope,
            kind: entry.bucket.kind,
            label: entry.bucket.label,
            note: entry.bucket.note,
            files: entry.files,
            lines: entry.lines,
            nonBlank: entry.nonBlank,
            bytes: entry.bytes,
          })),
          unclaimed,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(text);
  if (missing.length > 0) {
    const hint =
      missing.length >= 2
        ? "这个目录不像仓库根（main/ 与 androidapp/ 都没找到），用 --root 指到仓库根再试"
        : "服务器上只发 main/、没有 androidapp/，属正常";
    for (const dir of missing) console.log(`提示：没找到 ${dir}/ —— 该项跳过（${hint}）。`);
  }
}

main();
