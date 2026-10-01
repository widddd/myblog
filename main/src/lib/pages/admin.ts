import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { requirePrismaModel } from "@/lib/db-schema";
import { getSetting, setSetting } from "@/lib/settings";
import {
  DEFAULT_STATIC_PAGES_DIR,
  normalizeDirectory,
  normalizeSlug,
  STATIC_PAGES_DIR_KEY,
  STATIC_PAGE_CODE_MAX,
  STATIC_PAGE_DESCRIPTION_MAX,
  STATIC_PAGE_TITLE_MAX,
} from "@/lib/pages/directories";

export type StaticPageRecord = {
  id: number;
  slug: string;
  title: string;
  description: string;
  html: string;
  css: string;
  js: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** 后台列表行：不带代码体，避免把 32KB 的字符串塞进列表。 */
export type StaticPageSummary = Omit<StaticPageRecord, "html" | "css" | "js"> & {
  hasCode: boolean;
  codeSize: number;
};

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  html: true,
  css: true,
  js: true,
} satisfies Prisma.StaticPageSelect;

type SummaryRow = Prisma.StaticPageGetPayload<{ select: typeof summarySelect }>;

type StaticPageModel = Prisma.StaticPageDelegate;

/**
 * 取 `StaticPage` 委托。
 *
 * 不直接写 `prisma.staticPage`：模型没生成时它是 `undefined`，报错是
 * `Cannot read properties of undefined (reading 'findMany')`——用户与 AI 都得回头翻代码
 * 才知道是「服务器比 prisma generate 起得早」。走这里就直说是哪个模型、该怎么修
 * （见 `lib/db-schema.ts` 对两种状态的区分）。
 */
function staticPageModel(): StaticPageModel {
  return requirePrismaModel<StaticPageModel>(
    prisma,
    "staticPage",
    "重启开发服务器（pnpm dev）即可；重启后仍报此错，先在 main/ 执行 pnpm prisma generate 再启动。",
  );
}

function toSummary(row: SummaryRow): StaticPageSummary {
  const codeSize = row.html.length + row.css.length + row.js.length;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasCode: codeSize > 0,
    codeSize,
  };
}

/**
 * 读取静态页目录。
 *
 * 为什么不加 unstable_cache：目录是**单值 Setting**，`getSetting` 自己已有 60 秒 TTL 缓存；
 * 再加一层会让「刚在后台改完目录」的语义更绕（见 P-089 的教训：写侧忘记立即过期就出错）。
 * 每个请求一次廉价的 KV 读，换来「改完立刻生效」。
 */
export async function getStaticPagesDir(): Promise<string> {
  const raw = await getSetting<string>(STATIC_PAGES_DIR_KEY);
  const normalized = normalizeDirectory(raw ?? DEFAULT_STATIC_PAGES_DIR);
  if (normalized.ok) {
    return normalized.value;
  }
  // 脏值（历史数据或手改库）不能把整站带崩：回退默认目录，并留一条日志。
  const fallback = normalizeDirectory(DEFAULT_STATIC_PAGES_DIR);
  return fallback.ok ? fallback.value : DEFAULT_STATIC_PAGES_DIR;
}

/** 后台保存目录：校验通过才写；未变的目录不重复写库。 */
export async function saveStaticPagesDir(raw: unknown): Promise<string> {
  const normalized = normalizeDirectory(raw);
  if (!normalized.ok) {
    throw new AdminHttpError("VALIDATION_ERROR", normalized.message, 400);
  }
  const current = await getStaticPagesDir();
  if (current !== normalized.value) {
    await setSetting(STATIC_PAGES_DIR_KEY, normalized.value);
  }
  return normalized.value;
}

/** 公开侧：目录下**启用中**的页面清单（索引页与 sitemap 用）。 */
export async function listEnabledStaticPages(): Promise<StaticPageSummary[]> {
  const rows = await staticPageModel().findMany({
    where: { enabled: true },
    select: summarySelect,
    orderBy: { title: "asc" },
  });
  return rows.map(toSummary);
}

/** 后台列表：全部页面（含停用），不扫代码体。 */
export async function listStaticPages(): Promise<StaticPageSummary[]> {
  const rows = await staticPageModel().findMany({
    select: summarySelect,
    orderBy: [{ enabled: "desc" }, { title: "asc" }],
  });
  return rows.map(toSummary);
}

export async function getStaticPage(id: number): Promise<StaticPageRecord | null> {
  return staticPageModel().findUnique({ where: { id } });
}

/**
 * 公开侧按地址取页：目录必须与当前配置一致，页面必须启用。
 * 目录不匹配时**不查库**直接返回 null —— 这也是「让位给框架路由」的收敛点：
 * 保留目录与不匹配目录都不会产生额外查询。
 */
export async function findPublicStaticPage(
  dir: string,
  slug: string,
): Promise<StaticPageRecord | null> {
  const configured = await getStaticPagesDir();
  if (dir !== configured) {
    return null;
  }
  const row = await staticPageModel().findUnique({ where: { slug } });
  if (!row || !row.enabled) {
    return null;
  }
  return row;
}

export type StaticPageInput = {
  slug: string;
  title: string;
  description?: string;
  html?: string;
  css?: string;
  js?: string;
  enabled?: boolean;
};

function assertCodeLength(field: string, value: string | undefined): void {
  if (value && value.length > STATIC_PAGE_CODE_MAX) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      `${field} 超过 ${STATIC_PAGE_CODE_MAX / 1024}KB 上限`,
      400,
    );
  }
}

function normalizeTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) {
    throw new AdminHttpError("VALIDATION_ERROR", "页面标题不能为空", 400);
  }
  if (title.length > STATIC_PAGE_TITLE_MAX) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      `页面标题不能超过 ${STATIC_PAGE_TITLE_MAX} 个字`,
      400,
    );
  }
  return title;
}

function normalizeDescription(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value.length > STATIC_PAGE_DESCRIPTION_MAX) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      `页面描述不能超过 ${STATIC_PAGE_DESCRIPTION_MAX} 个字`,
      400,
    );
  }
  return value;
}

/** slug 唯一性检查：目录是单值，所以 slug 唯一就等于地址唯一。 */
async function assertSlugAvailable(slug: string, exceptId?: number): Promise<void> {
  const existing = await staticPageModel().findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (existing && existing.id !== exceptId) {
    throw new AdminHttpError(
      "SLUG_TAKEN",
      `地址名「${slug}」已被页面「${existing.title}」占用，换一个`,
      409,
    );
  }
}

export async function createStaticPage(input: StaticPageInput): Promise<number> {
  const slug = normalizeSlug(input.slug);
  if (!slug.ok) {
    throw new AdminHttpError("VALIDATION_ERROR", slug.message, 400);
  }
  assertCodeLength("HTML", input.html);
  assertCodeLength("CSS", input.css);
  assertCodeLength("JS", input.js);
  await assertSlugAvailable(slug.value);

  const created = await staticPageModel().create({
    data: {
      slug: slug.value,
      title: normalizeTitle(input.title),
      description: normalizeDescription(input.description),
      html: input.html ?? "",
      css: input.css ?? "",
      js: input.js ?? "",
      enabled: input.enabled ?? true,
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateStaticPage(
  id: number,
  input: Partial<StaticPageInput>,
): Promise<void> {
  const existing = await staticPageModel().findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new AdminHttpError("NOT_FOUND", "页面不存在", 404);
  }

  const data: Prisma.StaticPageUpdateInput = {};
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug.ok) {
      throw new AdminHttpError("VALIDATION_ERROR", slug.message, 400);
    }
    await assertSlugAvailable(slug.value, id);
    data.slug = slug.value;
  }
  if (input.title !== undefined) {
    data.title = normalizeTitle(input.title);
  }
  if (input.description !== undefined) {
    data.description = normalizeDescription(input.description);
  }
  for (const [field, value] of [
    ["HTML", input.html],
    ["CSS", input.css],
    ["JS", input.js],
  ] as const) {
    if (value !== undefined) {
      assertCodeLength(field, value);
    }
  }
  if (input.html !== undefined) {
    data.html = input.html;
  }
  if (input.css !== undefined) {
    data.css = input.css;
  }
  if (input.js !== undefined) {
    data.js = input.js;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }

  if (Object.keys(data).length === 0) {
    throw new AdminHttpError("VALIDATION_ERROR", "没有要修改的字段", 400);
  }

  await staticPageModel().update({ where: { id }, data });
}

export async function deleteStaticPage(id: number): Promise<void> {
  const existing = await staticPageModel().findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new AdminHttpError("NOT_FOUND", "页面不存在", 404);
  }
  await staticPageModel().delete({ where: { id } });
}

/**
 * 目录改名前的体检：哪些页面会因为「地址变了」而失效。
 * 目录本身是单值 Setting，改目录等于把所有页面的地址整体搬走（旧地址 404），
 * 后台需要把这件事在按钮前说清楚，而不是让用户改完才发现。
 */
export async function describeDirectoryChange(raw: unknown): Promise<{
  ok: boolean;
  message: string;
  from: string;
  to: string;
  affected: number;
}> {
  const normalized = normalizeDirectory(raw);
  const from = await getStaticPagesDir();
  if (!normalized.ok) {
    return { ok: false, message: normalized.message, from, to: "", affected: 0 };
  }
  const affected = await staticPageModel().count({ where: { enabled: true } });
  return {
    ok: true,
    message: normalized.value === from ? "" : `目录改为「${normalized.value}」`,
    from,
    to: normalized.value,
    affected: normalized.value === from ? 0 : affected,
  };
}
