/**
 * 静态页面的地址规则与冲突判定（纯函数，无 prisma，client / test 都能引）。
 *
 * 地址形态：`/{Setting staticPagesDir}/{slug}`，两段都是单段 URL 安全字符。
 * 目录是**单值**（一个 Station 只有一个静态页目录），所以 slug 全库唯一就等于地址唯一。
 *
 * 为什么要有「保留段」：`src/app/` 下的顶层路由（/posts、/admin、/api …）与
 * `public/` 下的文件（favicon.ico、robots.txt …）在 Next 里**永远优先**于
 * `src/app/[dir]/[slug]` 这个动态段。若目录或 slug 取成这些名字，静态页永远访问不到
 * （或在 Next 新增路由后突然被顶掉）。所以这里在写入前就拦掉，而不是等运行期出错。
 *
 * 运行期还有第二道闸：`src/app/(static)/[dir]/[slug]/page.tsx` 在目录命中保留段时
 * 直接 notFound()，把地址让给框架路由；`src/lib/pages/static-page.test.ts` 守着
 * 「保留清单 ⊇ src/app 顶层真实路由」，将来新增冲突路由会让 pnpm test 失败。
 */

export const STATIC_PAGES_DIR_KEY = "staticPagesDir";

/** 默认目录名。不叫 pages 之外的常用名，避免和将来可能的顶层路由撞名。 */
export const DEFAULT_STATIC_PAGES_DIR = "pages";

export const STATIC_PAGE_SEGMENT_MAX = 60;
export const STATIC_PAGE_TITLE_MAX = 80;
export const STATIC_PAGE_DESCRIPTION_MAX = 200;
export const STATIC_PAGE_CODE_MAX = 32_768;

/** 单段地址（目录名或 slug）的合法形态：小写字母/数字打头，内部可用 - 与 _。 */
export const STATIC_PAGE_SEGMENT_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

export type ReservedDecision = "block" | "warn";

export const RESERVED_SEGMENTS = [
  // —— 本站真实顶层路由（与 src/app 对齐，测试会守着这一半）——
  { segment: "admin", decision: "block", reason: "后台工作区 /admin" },
  { segment: "api", decision: "block", reason: "接口前缀 /api" },
  { segment: "archives", decision: "block", reason: "归档页 /archives" },
  { segment: "categories", decision: "block", reason: "分类页 /categories" },
  { segment: "messages", decision: "block", reason: "留言板 /messages" },
  { segment: "moments", decision: "block", reason: "瞬间页 /moments" },
  { segment: "posts", decision: "block", reason: "文章页 /posts" },
  { segment: "search", decision: "block", reason: "搜索页 /search" },
  { segment: "tags", decision: "block", reason: "标签页 /tags" },
  // —— 根级文件路由 ——
  { segment: "robots.txt", decision: "block", reason: "robots 路由 src/app/robots.ts" },
  { segment: "sitemap.xml", decision: "block", reason: "sitemap 路由 src/app/sitemap.ts" },
  { segment: "rss.xml", decision: "block", reason: "RSS 路由 src/app/rss.xml" },
  { segment: "favicon.ico", decision: "block", reason: "图标 src/app/favicon.ico" },
  // —— Next 内部前缀：永远不会落到我们的路由 ——
  { segment: "_next", decision: "block", reason: "Next 内部静态资源前缀" },
  // —— 约定俗成的敏感路径，站内没有也留着，防将来被占 ——
  { segment: ".well-known", decision: "block", reason: "站点验证 / ACME 约定路径" },
  { segment: "api-docs", decision: "warn", reason: "常被当作接口文档地址" },
  { segment: "static", decision: "warn", reason: "Next 习惯把静态资源放这里" },
  { segment: "assets", decision: "warn", reason: "静态资源常用名" },
  { segment: "public", decision: "warn", reason: "与 public/ 目录同名，容易误读" },
  { segment: "index", decision: "warn", reason: "容易被当成站点首页" },
] as const;

const RESERVED_LOOKUP = new Map<string, { decision: ReservedDecision; reason: string }>(
  RESERVED_SEGMENTS.map((entry) => [
    entry.segment,
    { decision: entry.decision, reason: entry.reason },
  ]),
);

/** 只取 block 档：这些段一定不能用。 */
export const RESERVED_BLOCK_SEGMENTS: readonly string[] = RESERVED_SEGMENTS.filter(
  (entry) => entry.decision === "block",
).map((entry) => entry.segment);

/** 目录是单值，slug 唯一的理由写在这里，供文档与后台提示复用。 */
export function staticPageHref(dir: string, slug: string): string {
  return `/${dir}/${slug}`;
}

export function describeReserved(segment: string): string | null {
  const hit = RESERVED_LOOKUP.get(segment);
  return hit ? hit.reason : null;
}

/** 未登记的段一律放行；block 拒绝、warn 提示后可继续。 */
export function checkReservedSegment(segment: string): ReservedDecision | "allow" {
  return RESERVED_LOOKUP.get(segment)?.decision ?? "allow";
}

/**
 * 目录名与 slug 的归一/校验共用一条实现（两处口径必须一致，否则会出现
 * 「目录拦住了、地址名放行」或者反过来的漏洞）。
 *
 * 判定**顺序很重要**：先看保留清单，再看字符形态。反过来的话，`robots.txt`、`rss.xml`
 * 这类保留段会先撞上「只允许小写字母数字-_」的字符规则，用户拿到的提示是
 * 「格式不对」——而真正的原因是它占了 robots / RSS 的地址。保留段要先说。
 */
function normalizeSegment(
  raw: unknown,
  label: string,
): { ok: boolean; value: string; message: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { ok: false, value: "", message: `${label}不能为空` };
  }

  const reserved = RESERVED_LOOKUP.get(value);
  if (reserved && reserved.decision === "block") {
    return {
      ok: false,
      value,
      message: `${label}「${value}」与站内已有地址冲突（${reserved.reason}），换一个`,
    };
  }

  if (value.length > STATIC_PAGE_SEGMENT_MAX) {
    return {
      ok: false,
      value,
      message: `${label}不能超过 ${STATIC_PAGE_SEGMENT_MAX} 个字符`,
    };
  }
  if (!STATIC_PAGE_SEGMENT_PATTERN.test(value)) {
    return {
      ok: false,
      value,
      message: `${label}只能用小写字母、数字、- 和 _，且不能以符号开头或结尾`,
    };
  }

  return { ok: true, value, message: "" };
}

/** 目录名的归一与校验。返回 `ok:false` 时 `message` 直接可以给用户看。 */
export function normalizeDirectory(raw: unknown): { ok: boolean; value: string; message: string } {
  return normalizeSegment(raw, "目录名");
}

/** slug 的归一与校验。目录命中的保留段同样适用于 slug（地址最后一段也不能是保留名）。 */
export function normalizeSlug(raw: unknown): { ok: boolean; value: string; message: string } {
  return normalizeSegment(raw, "页面地址名");
}

/** 目录或 slug 是否**曾经**合法；用来判断一条历史数据现在还能不能对外访问。 */
export function isReservedForRouting(segment: string): boolean {
  return RESERVED_LOOKUP.get(segment)?.decision === "block";
}

/** 后台展示用：目录当前是不是被保留段占着（保留段一律视为冲突）。 */
export function describeDirectoryConflict(dir: string): string | null {
  if (!dir) {
    return null;
  }
  const decision = RESERVED_LOOKUP.get(dir);
  if (!decision) {
    return null;
  }
  const severity = decision.decision === "block" ? "冲突" : "注意";
  return `${severity}：${decision.reason}`;
}
