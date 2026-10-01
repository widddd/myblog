/**
 * 静态页面地址规则的守卫测试。两件事最重要：
 *
 * 1. **保留清单必须覆盖 src/app 下所有真实顶层路由**。Next 里框架路由永远优先于
 *    `[dir]/[slug]`，所以将来新加一个顶层栏目（例如 /notes）时，若忘了登记保留段，
 *    用户可以用同名目录建页面 → 页面永远访问不到 / 或者更糟：以为生效了。这里读真实的
 *    文件系统，让这种脱节在 `pnpm test` 阶段就暴露。
 * 2. 目录名 / 地址名的格式与保留段判定，是「不能冲突」的第一道闸（第二道是运行期让位）。
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";

import {
  DEFAULT_STATIC_PAGES_DIR,
  describeDirectoryConflict,
  isReservedForRouting,
  normalizeDirectory,
  normalizeSlug,
  RESERVED_BLOCK_SEGMENTS,
  RESERVED_SEGMENTS,
  STATIC_PAGE_SEGMENT_MAX,
  staticPageHref,
} from "./directories";

const APP_DIR_URL = new URL("../../app/", import.meta.url);

/**
 * 把 `src/app/` 的顶层条目翻译成 URL 首段，规则与 Next 一致：
 * - 目录 / 文件 → 首段（`posts/` → `posts`，`robots.ts` → `robots.txt`）
 * - `(group)` → 路由组，不进 URL，跳过
 * - `_private` → 私有文件夹，不进路由，跳过
 */
async function readTopLevelUrlSegments(): Promise<string[]> {
  const entries = await readdir(APP_DIR_URL, { withFileTypes: true });
  const segments = new Set<string>();

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith("(") && name.endsWith(")")) {
      continue;
    }
    if (name.startsWith("_")) {
      continue;
    }
    if (entry.isDirectory()) {
      segments.add(name);
      continue;
    }
    // page.tsx / layout.tsx / globals.css 不是路由；其余按「文件名即路径」处理
    if (name === "globals.css" || name.endsWith(".css")) {
      continue;
    }
    const match = /^(.+)\.(tsx|ts)$/.exec(name);
    if (!match) {
      // favicon.ico 这类静态文件名本身就是路径
      if (name.includes(".") && !name.startsWith("layout") && !name.startsWith("page")) {
        segments.add(name);
      }
      continue;
    }
    const base = match[1] ?? "";
    if (base === "page" || base === "layout" || base === "loading" || base === "not-found" || base === "global-error" || base === "error") {
      continue;
    }
    // robots.ts → robots.txt；rss.xml 目录已在上面的目录分支处理
    if (base === "robots" || base === "sitemap") {
      segments.add(`${base}.txt`.replace("sitemap.txt", "sitemap.xml"));
      continue;
    }
    segments.add(base);
  }

  return [...segments].sort();
}

test("保留清单覆盖 src/app 的每个顶层路由", async () => {
  const routes = await readTopLevelUrlSegments();
  assert.ok(
    routes.length >= 8,
    `只解析出 ${routes.length} 个顶层路由，路径或大小写可能已变化：${routes.join("、")}`,
  );

  const blocking = new Set(RESERVED_BLOCK_SEGMENTS);
  const uncovered = routes.filter((route) => !blocking.has(route));
  assert.deepEqual(
    uncovered,
    [],
    `这些顶层路由没有登记成 block 保留段：${uncovered.join("、")}。` +
      "在 src/lib/pages/directories.ts 的 RESERVED_SEGMENTS 里补上，否则同名目录下的静态页面" +
      "会被框架路由顶掉（访问不到），用户却以为建成了。",
  );
});

test("保留清单里每一条都有决策与理由", () => {
  for (const entry of RESERVED_SEGMENTS) {
    assert.ok(entry.segment.length > 0, `${entry.segment} 为空`);
    assert.ok(
      entry.decision === "block" || entry.decision === "warn",
      `${entry.segment} 的 decision 非法：${entry.decision}`,
    );
    assert.ok(entry.reason.length > 0, `${entry.segment} 缺少 reason`);
  }

  const seen = new Set<string>();
  for (const entry of RESERVED_SEGMENTS) {
    assert.ok(!seen.has(entry.segment), `${entry.segment} 在清单里重复`);
    seen.add(entry.segment);
  }
});

test("目录名：合法形态通过与归一", () => {
  for (const value of [DEFAULT_STATIC_PAGES_DIR, "docs", "my-pages", "about_us", "p1"]) {
    const result = normalizeDirectory(value);
    assert.equal(result.ok, true, `${value} 应该合法：${result.message}`);
    assert.equal(result.value, value);
  }

  const padded = normalizeDirectory("  docs  ");
  assert.equal(padded.ok, true);
  assert.equal(padded.value, "docs", "首尾空白应被去掉");
});

test("目录名：非法形态被拒", () => {
  const cases: Array<[unknown, string]> = [
    ["", "空"],
    ["   ", "全空白"],
    [undefined, "undefined"],
    [null, "null"],
    [123, "数字"],
    ["Docs", "含大写"],
    ["-docs", "以连字符开头"],
    ["docs-", "以连字符结尾"],
    ["docs/子", "含斜杠"],
    ["docs sub", "含空格"],
    ["docs.sub", "含点"],
    ["../etc", "路径穿越"],
    ["a".repeat(STATIC_PAGE_SEGMENT_MAX + 1), "超长"],
  ];

  for (const [value, label] of cases) {
    const result = normalizeDirectory(value);
    assert.equal(result.ok, false, `${label} 应该被拒`);
    assert.ok(result.message.length > 0, `${label} 应给出可读原因`);
  }
});

test("目录名：保留段被拒，且提示里说明冲突原因", () => {
  for (const segment of RESERVED_BLOCK_SEGMENTS) {
    const result = normalizeDirectory(segment);
    assert.equal(result.ok, false, `保留段 ${segment} 不能被用作目录`);
    assert.match(result.message, /冲突|保留/, `${segment} 的提示应说明冲突`);
  }

  // 首页路由没有首段，所以空目录/斜杠都会被拒（已在上一条覆盖）
  assert.equal(normalizeDirectory("/").ok, false);
});

test("地址名 slug：形态与保留段同口径", () => {
  assert.equal(normalizeSlug("about").ok, true);
  assert.equal(normalizeSlug("about-us").ok, true);
  assert.equal(normalizeSlug("About").ok, false, "大写被拒（避免大小写重复地址）");
  assert.equal(normalizeSlug("中文标题").ok, false, "中文需要用户自己填 ASCII 地址名");
  assert.equal(normalizeSlug("").ok, false);
  assert.equal(normalizeSlug("a/b").ok, false);
  assert.equal(normalizeSlug("admin").ok, false, "保留段不能当地址名");
  assert.equal(normalizeSlug("posts").ok, false);
});

test("warn 档只提示不拦截：目录仍可保存，但后台会给出冲突说明", () => {
  const warned = RESERVED_SEGMENTS.filter((entry) => entry.decision === "warn");
  assert.ok(warned.length > 0, "至少应有一条 warn 档用于提示");

  for (const entry of warned) {
    assert.equal(
      normalizeDirectory(entry.segment).ok,
      true,
      `${entry.segment} 是 warn 档，不应被硬拦`,
    );
    assert.ok(
      describeDirectoryConflict(entry.segment),
      `${entry.segment} 应能生成冲突说明给后台展示`,
    );
    assert.equal(isReservedForRouting(entry.segment), false, "warn 档不算路由冲突");
  }

  assert.equal(describeDirectoryConflict("docs"), null, "未登记的目录没有冲突说明");
  assert.equal(describeDirectoryConflict(""), null);
});

test("地址拼接与路由冲突判定", () => {
  assert.equal(staticPageHref("pages", "about"), "/pages/about");
  assert.equal(isReservedForRouting("posts"), true);
  assert.equal(isReservedForRouting("_next"), true);
  assert.equal(isReservedForRouting("docs"), false);
});
