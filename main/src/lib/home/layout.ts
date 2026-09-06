import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";
import { isSafeHref, isSafeMediaUrl } from "@/lib/media/url";
import { slugify } from "@/lib/utils/slugify";
import { logger } from "@/lib/utils/logger";

import { BUILTIN_DEFINITIONS, builtinDefinition } from "./builtins";
import {
  comparePlacement,
  isBuiltinModuleKey,
  isHomeBlockType,
  normalizeMobilePlacement,
  normalizePlacement,
  type HomeBlock,
  type HomeLayoutItem,
  type HomeModuleConfig,
  type HomeModuleView,
  type HomePlacementView,
} from "./types";

const MAX_CODE_LENGTH = 32_768;

const moduleSelect = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  builtinKey: true,
  html: true,
  css: true,
  js: true,
  blocks: true,
  config: true,
  system: true,
  placement: true,
} satisfies Prisma.HomeModuleSelect;

type ModuleRow = Prisma.HomeModuleGetPayload<{ select: typeof moduleSelect }>;

function parseJson<T>(raw: string, fallback: T, label: string): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : (parsed as T);
  } catch {
    logger.warn("首页模块 JSON 解析失败，已使用默认值", { label });
    return fallback;
  }
}

/** 只保留已知 type 的积木，避免旧数据或手改库把渲染器打挂。 */
export function sanitizeBlocks(input: unknown): HomeBlock[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.slice(0, 40).flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const raw = item as Record<string, unknown>;
    if (!isHomeBlockType(raw.type)) {
      return [];
    }
    const block: HomeBlock = {
      id: typeof raw.id === "string" && raw.id ? raw.id : `block-${index}`,
      type: raw.type,
    };
    if (typeof raw.text === "string") {
      block.text = raw.text.slice(0, 2_000);
    }
    if (typeof raw.href === "string" && isSafeHref(raw.href)) {
      block.href = raw.href.slice(0, 500);
    }
    if (typeof raw.src === "string" && isSafeMediaUrl(raw.src)) {
      block.src = raw.src.slice(0, 500);
    }
    if (typeof raw.alt === "string") {
      block.alt = raw.alt.slice(0, 200);
    }
    if (raw.level === 1 || raw.level === 2 || raw.level === 3 || raw.level === 4) {
      block.level = raw.level;
    }
    if (typeof raw.limit === "number" && Number.isFinite(raw.limit)) {
      block.limit = Math.min(12, Math.max(1, Math.round(raw.limit)));
    }
    if (raw.source === "latest" || raw.source === "recommend") {
      block.source = raw.source;
    }
    if (raw.variant === "solid" || raw.variant === "ghost") {
      block.variant = raw.variant;
    }
    return [block];
  });
}

function toModuleView(row: ModuleRow): HomeModuleView {
  const builtinKey = isBuiltinModuleKey(row.builtinKey) ? row.builtinKey : null;
  const definition = builtinDefinition(builtinKey);
  const storedConfig = parseJson<HomeModuleConfig>(row.config, {}, row.slug);
  const config: HomeModuleConfig = { ...definition?.defaultConfig, ...storedConfig };
  if (config.primaryHref && !isSafeHref(config.primaryHref)) {
    delete config.primaryHref;
  }
  if (config.secondaryHref && !isSafeHref(config.secondaryHref)) {
    delete config.secondaryHref;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind === "custom" ? "custom" : "builtin",
    builtinKey,
    html: row.html,
    css: row.css,
    js: row.js,
    blocks: sanitizeBlocks(parseJson<unknown>(row.blocks, [], row.slug)),
    config,
    system: row.system,
  };
}

function toPlacementView(row: ModuleRow): HomePlacementView {
  const placement = row.placement;
  if (!placement) {
    return {
      moduleId: row.id,
      enabled: false,
      col: 1,
      colSpan: 12,
      row: 1,
      rowSpan: 1,
      hPct: 0,
      mobileCol: 1,
      mobileColSpan: 12,
      mobileRow: 1,
      mobileHPct: 0,
      sort: 0,
    };
  }
  return {
    moduleId: row.id,
    enabled: placement.enabled,
    ...normalizePlacement(placement),
    ...normalizeMobilePlacement(placement),
    sort: placement.sort,
  };
}

/**
 * 幂等写入内置模块与默认格点（首启/seed 共用）。
 * 已存在的模块不覆盖用户改动，只补缺失项。
 * 首次补建 moments 时关掉 recommend（只这一次）。
 */
export async function ensureHomeModules(): Promise<void> {
  for (const [index, definition] of BUILTIN_DEFINITIONS.entries()) {
    const existing = await prisma.homeModule.findUnique({
      where: { slug: definition.slug },
      select: { id: true, placement: { select: { id: true } } },
    });
    const enabled = definition.defaultEnabled !== false;

    if (!existing) {
      await prisma.homeModule.create({
        data: {
          slug: definition.slug,
          name: definition.name,
          kind: "builtin",
          builtinKey: definition.key,
          config: JSON.stringify(definition.defaultConfig),
          system: true,
          placement: {
            create: {
              enabled,
              ...definition.defaultPlacement,
              ...definition.defaultMobilePlacement,
              sort: index,
            },
          },
        },
      });
      if (definition.key === "moments") {
        await prisma.homePlacement.updateMany({
          where: { module: { slug: "recommend" } },
          data: { enabled: false },
        });
      }
      continue;
    }

    if (!existing.placement) {
      await prisma.homePlacement.create({
        data: {
          moduleId: existing.id,
          enabled,
          ...definition.defaultPlacement,
          ...definition.defaultMobilePlacement,
          sort: index,
        },
      });
    }
  }
}

/** 前台首页：只取启用项。桌面按行列分组；手机用各自的 mobile* 几何。 */
export async function getHomeLayout(): Promise<HomeLayoutItem[]> {
  return cachedPublic(["getHomeLayout"], [PUBLIC_CACHE_TAGS.home], async () => {
    const rows = await prisma.homeModule.findMany({
      where: { placement: { enabled: true } },
      select: moduleSelect,
    });

    return rows
      .map((row) => ({
        module: toModuleView(row),
        placement: toPlacementView(row),
      }))
      .sort((a, b) => comparePlacement(a.placement, b.placement));
  });
}

/** 后台：全部模块（含未启用与未入格）。 */
export async function listHomeModules(): Promise<HomeLayoutItem[]> {
  const rows = await prisma.homeModule.findMany({
    select: moduleSelect,
    orderBy: { id: "asc" },
  });

  return rows.map((row) => ({
    module: toModuleView(row),
    placement: toPlacementView(row),
  }));
}

export async function getHomeModule(id: number): Promise<HomeLayoutItem | null> {
  const row = await prisma.homeModule.findUnique({
    where: { id },
    select: moduleSelect,
  });
  if (!row) {
    return null;
  }
  return { module: toModuleView(row), placement: toPlacementView(row) };
}

export type LayoutWriteItem = {
  moduleId: number;
  enabled: boolean;
  col: number;
  colSpan: number;
  row: number;
  hPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  mobileHPct: number;
};

/** 整表替换格点。sort 由桌面行列重算；同格用 payload 顺序作次序。 */
export async function saveHomeLayout(items: LayoutWriteItem[]): Promise<void> {
  const known = await prisma.homeModule.findMany({ select: { id: true } });
  const knownIds = new Set(known.map((item) => item.id));

  const normalized = items
    .filter((item) => knownIds.has(item.moduleId))
    .map((item, index) => ({
      moduleId: item.moduleId,
      enabled: item.enabled,
      ...normalizePlacement(item),
      ...normalizeMobilePlacement(item),
      payloadOrder: index,
    }));

  const ordered = [...normalized].sort((a, b) =>
    a.row !== b.row
      ? a.row - b.row
      : a.col !== b.col
        ? a.col - b.col
        : a.payloadOrder - b.payloadOrder,
  );
  const sortByModule = new Map(ordered.map((item, index) => [item.moduleId, index]));

  await prisma.$transaction(
    normalized.map((item) =>
      prisma.homePlacement.upsert({
        where: { moduleId: item.moduleId },
        create: {
          moduleId: item.moduleId,
          enabled: item.enabled,
          col: item.col,
          colSpan: item.colSpan,
          row: item.row,
          rowSpan: item.rowSpan,
          hPct: item.hPct,
          mobileCol: item.mobileCol,
          mobileColSpan: item.mobileColSpan,
          mobileRow: item.mobileRow,
          mobileHPct: item.mobileHPct,
          sort: sortByModule.get(item.moduleId) ?? 0,
        },
        update: {
          enabled: item.enabled,
          col: item.col,
          colSpan: item.colSpan,
          row: item.row,
          rowSpan: item.rowSpan,
          hPct: item.hPct,
          mobileCol: item.mobileCol,
          mobileColSpan: item.mobileColSpan,
          mobileRow: item.mobileRow,
          mobileHPct: item.mobileHPct,
          sort: sortByModule.get(item.moduleId) ?? 0,
        },
      }),
    ),
  );
}

function assertCodeLength(field: string, value: string | undefined): void {
  if (value && value.length > MAX_CODE_LENGTH) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      `${field} 超过 ${MAX_CODE_LENGTH / 1024}KB 上限`,
      400,
    );
  }
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "module";
  let candidate = `custom-${base}`.slice(0, 60);
  let counter = 2;
  while (await prisma.homeModule.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `custom-${base}-${counter}`.slice(0, 60);
    counter += 1;
  }
  return candidate;
}

export type CustomModuleInput = {
  name: string;
  html?: string;
  css?: string;
  js?: string;
  blocks?: unknown;
  config?: HomeModuleConfig;
};

export async function createCustomModule(input: CustomModuleInput): Promise<number> {
  const name = input.name.trim();
  if (!name) {
    throw new AdminHttpError("VALIDATION_ERROR", "模块名称不能为空", 400);
  }
  assertCodeLength("HTML", input.html);
  assertCodeLength("CSS", input.css);
  assertCodeLength("JS", input.js);

  const created = await prisma.homeModule.create({
    data: {
      slug: await uniqueSlug(name),
      name,
      kind: "custom",
      builtinKey: null,
      html: input.html ?? "",
      css: input.css ?? "",
      js: input.js ?? "",
      blocks: JSON.stringify(sanitizeBlocks(input.blocks)),
      config: JSON.stringify({ card: true, scopedCss: true, ...input.config }),
      system: false,
    },
    select: { id: true },
  });

  return created.id;
}

export type ModulePatchInput = {
  name?: string;
  html?: string;
  css?: string;
  js?: string;
  blocks?: unknown;
  config?: HomeModuleConfig;
};

export async function updateHomeModule(
  id: number,
  input: ModulePatchInput,
): Promise<void> {
  const existing = await prisma.homeModule.findUnique({
    where: { id },
    select: { id: true, kind: true },
  });
  if (!existing) {
    throw new AdminHttpError("NOT_FOUND", "模块不存在", 404);
  }

  const data: Prisma.HomeModuleUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new AdminHttpError("VALIDATION_ERROR", "模块名称不能为空", 400);
    }
    data.name = name;
  }
  if (input.config !== undefined) {
    data.config = JSON.stringify(input.config);
  }

  // 内置模块只允许改 config / name：key、代码与积木属于结构，不给改。
  if (existing.kind === "custom") {
    if (input.html !== undefined) {
      assertCodeLength("HTML", input.html);
      data.html = input.html;
    }
    if (input.css !== undefined) {
      assertCodeLength("CSS", input.css);
      data.css = input.css;
    }
    if (input.js !== undefined) {
      assertCodeLength("JS", input.js);
      data.js = input.js;
    }
    if (input.blocks !== undefined) {
      data.blocks = JSON.stringify(sanitizeBlocks(input.blocks));
    }
  }

  await prisma.homeModule.update({ where: { id }, data });
}

export async function setBannerSubtitle(subtitle: string): Promise<void> {
  const row = await prisma.homeModule.findUnique({
    where: { slug: "banner" },
    select: { id: true, config: true },
  });
  if (!row) {
    return;
  }
  const current = parseJson<HomeModuleConfig>(row.config, {}, "banner");
  await prisma.homeModule.update({
    where: { id: row.id },
    data: {
      config: JSON.stringify({
        ...current,
        subtitle: subtitle.trim().slice(0, 200),
      }),
    },
  });
}

export async function deleteHomeModule(id: number): Promise<void> {
  const existing = await prisma.homeModule.findUnique({
    where: { id },
    select: { id: true, system: true, placement: { select: { enabled: true } } },
  });
  if (!existing) {
    throw new AdminHttpError("NOT_FOUND", "模块不存在", 404);
  }
  if (existing.system) {
    throw new AdminHttpError("SYSTEM_MODULE", "内置模块不能删除，只能在首页管理里关闭", 409);
  }
  if (existing.placement?.enabled) {
    throw new AdminHttpError(
      "MODULE_IN_USE",
      "该模块仍在首页启用中，请先在首页管理里移除后再删除",
      409,
    );
  }

  await prisma.homeModule.delete({ where: { id } });
}
