import type { Prisma } from "@prisma/client";

import { AdminHttpError } from "@/lib/admin/http";
import { cachedPublic, PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";
import { isSafeHref, isSafeMediaUrl } from "@/lib/media/url";
import { slugify } from "@/lib/utils/slugify";
import { logger } from "@/lib/utils/logger";

import { appLogoSvgMarkup } from "./app-logo";
import { BUILTIN_DEFINITIONS, builtinDefinition } from "./builtins";
import { APP_PROMO_LEGACY_HTML, APP_PROMO_LEGACY_LOGO } from "./templates";
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
  type HomePinMode,
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

/**
 * 内置模块的出厂代码：**只有库里那一栏是空的**才用默认值补上。
 * 这样「推荐应用」这类可编辑内置模块开箱就带着一份 HTML，用户一改就生效，
 * 且后续升级默认值不会覆盖用户的改动（非空即用户版本）。
 */
function withDefaultCode(
  row: Pick<ModuleRow, "builtinKey" | "html" | "css" | "js">,
): Pick<HomeModuleView, "html" | "css" | "js"> {
  const definition = builtinDefinition(
    isBuiltinModuleKey(row.builtinKey) ? row.builtinKey : null,
  );
  const fallback = definition?.defaultCode;
  return {
    html: row.html || fallback?.html || "",
    css: row.css || fallback?.css || "",
    js: row.js || fallback?.js || "",
  };
}

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
  const code = withDefaultCode(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind === "custom" ? "custom" : "builtin",
    builtinKey,
    html: code.html,
    css: code.css,
    js: code.js,
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
      select: {
        id: true,
        html: true,
        css: true,
        js: true,
        placement: { select: { id: true } },
      },
    });
    const enabled = definition.defaultEnabled !== false;

    if (!existing) {
      await prisma.homeModule.create({
        data: {
          slug: definition.slug,
          name: definition.name,
          kind: "builtin",
          builtinKey: definition.key,
          html: definition.defaultCode?.html ?? "",
          css: definition.defaultCode?.css ?? "",
          js: definition.defaultCode?.js ?? "",
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

    // 既有记录：只补**空**的出厂代码，用户写过的一律不动
    //（推荐应用是 0.1.2 之后才变成可编辑内置模块的，老库这三栏是空的）
    if (definition.defaultCode) {
      const patch: Prisma.HomeModuleUpdateInput = {};
      // 出厂代码升版：库里的 HTML 逐字命中历史上某一版出厂代码时，换成新版（P-140）
      if (isShippedLegacyHtml(definition.key, existing.html)) {
        if (definition.defaultCode.html) {
          patch.html = definition.defaultCode.html;
        }
        if (definition.defaultCode.css) {
          patch.css = definition.defaultCode.css;
        }
        if (definition.defaultCode.js) {
          patch.js = definition.defaultCode.js;
        }
      } else {
        // 逐字没命中 → 用户改过：只做**一块块**的保守升级（把历史版本的某个 SVG 块
        // 换成新版，其余一个字节都不碰）。
        const migrated = upgradeLogoBlocks(definition.key, existing.html);
        if (migrated) {
          patch.html = migrated;
        }
      }
      if (!patch.html && !existing.html && definition.defaultCode.html) {
        patch.html = definition.defaultCode.html;
      }
      if (!patch.css && !existing.css && definition.defaultCode.css) {
        patch.css = definition.defaultCode.css;
      }
      if (!patch.js && !existing.js && definition.defaultCode.js) {
        patch.js = definition.defaultCode.js;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.homeModule.update({ where: { id: existing.id }, data: patch });
      }
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

  await migrateLegacyHeights();
}

/**
 * 出厂代码升版判定：库里那份 HTML 是否**逐字**等于历史上某一版出厂代码。
 *
 * 命中才换成新版；用户改过一个字就不命中 —— 这是「出厂代码可以升版、用户改动不可覆盖」
 * 的分界线。历史版本由 `lib/home/templates.ts` 的 `APP_PROMO_LEGACY_HTML` 维护
 * （改 `APP_PROMO_HTML` 之前先把当前那份追加进去）。
 *
 * 为什么要它：`ensureHomeModules()` 原本只补**空**的三栏，于是老库里那份「上一版出厂
 * HTML」会一直留着 —— 推荐应用的方形 logo 换成 App 真图标后，前台照旧渲染旧占位图。
 * 见 [P-140](../docs/pitfalls.md)。
 */
function isShippedLegacyHtml(key: string, storedHtml: string): boolean {
  if (!storedHtml) {
    return false;
  }
  if (
    key === "app-promo" &&
    APP_PROMO_LEGACY_HTML.some((legacy) => legacy === storedHtml)
  ) {
    return true;
  }
  return false;
}

/**
 * 保守的**块级**升级：把用户 HTML 里**逐字命中历史出厂版本**的那块 logo SVG 换成新版，
 * 其余内容（包括用户在同一份 HTML 里加的其他东西）一个字节都不碰。
 *
 * 比整份替换更弱，所以门槛可以放宽到「这块 logo 在不在」—— 只有从没碰过它的页面才命中。
 * 匹配走**空白折叠**后的正则、替换只动命中的那一段，所以缩进/换行差异（CRLF、编辑器重排）
 * 不会让升级悄悄失败。
 */
function upgradeLogoBlocks(key: string, storedHtml: string): string | null {
  if (key !== "app-promo" || !storedHtml) {
    return null;
  }
  let next = storedHtml;
  let changed = false;
  for (const legacy of APP_PROMO_LEGACY_LOGO) {
    const pattern = new RegExp(legacy.trim().split(/\s+/).map(escapeRegExp).join("\\s+"));
    if (!pattern.test(next)) {
      continue;
    }
    next = next.replace(pattern, appLogoSvgMarkup("-promo"));
    changed = true;
  }
  return changed ? next : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 一次性迁移：把内置模块的「视口百分比高度」改成「像素高度」。
 *
 * `hPct` 过去是**视口高度的百分数**（37 = 37% 视口），调高度只会把格子撑高、
 * 模块本身被挤在里面（用户反馈）。现在 0 = 自适应、其余按像素（P-139）。
 *
 * 只搬**内置模块的出厂值**（这些值本来就是按设计视口定的）与 Banner：
 * - `popup` / `app-promo` 是覆盖层，不占格点，它们的 `hPct` 无意义 → 归 0；
 * - Banner 的高度由自己的 `config.height` 决定 → 归 0（自适应）；
 * - 欢迎光临 / 瞬间 / 推荐文章：老值（桌面 37、手机 32/36）换成新的像素默认值。
 * 用户自己调过的其它值（例如 40、60）不动 —— 它现在被读成像素，只是变小了，改高度即可。
 */
async function migrateLegacyHeights(): Promise<void> {
  const targets: Array<{
    slug: string;
    desktop: number[] | "any";
    mobile: number[] | "any";
    nextDesktop: number;
    nextMobile: number;
  }> = [
    { slug: "banner", desktop: "any", mobile: "any", nextDesktop: 0, nextMobile: 0 },
    { slug: "popup", desktop: "any", mobile: "any", nextDesktop: 0, nextMobile: 0 },
    { slug: "app-promo", desktop: "any", mobile: "any", nextDesktop: 0, nextMobile: 0 },
    {
      slug: "welcome",
      desktop: [37],
      mobile: [32, 36],
      nextDesktop: 380,
      nextMobile: 340,
    },
    {
      slug: "moments",
      desktop: [37],
      mobile: [32, 36],
      nextDesktop: 380,
      nextMobile: 340,
    },
    {
      slug: "recommend",
      desktop: [37],
      mobile: [32, 36],
      nextDesktop: 380,
      nextMobile: 340,
    },
  ];

  for (const target of targets) {
    const rows = await prisma.homePlacement.findMany({
      where: { module: { slug: target.slug } },
      select: { id: true, hPct: true, mobileHPct: true },
    });
    for (const row of rows) {
      const desktopHit =
        target.desktop === "any" || target.desktop.includes(row.hPct);
      const mobileHit =
        target.mobile === "any" || target.mobile.includes(row.mobileHPct);
      if (!desktopHit && !mobileHit) {
        continue;
      }
      // ⚠️ 命中一侧就把**两侧**都写成新值：只改命中那侧会留下「桌面 0 / 手机 70」这种
      // 半迁移状态，而在走手机套的断点判断下手机的值会反过来决定桌面（P-139 的翻车点）。
      await prisma.homePlacement.update({
        where: { id: row.id },
        data: { hPct: target.nextDesktop, mobileHPct: target.nextMobile },
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
  /** 同格堆叠顺序；批量都给时才按它排序（见 `saveHomeLayout`） */
  sort?: number;
  /** 栏位：跟着格点一起写进模块 `config.pin`（不传就不动） */
  pin?: HomePinMode;
};

/**
 * 整表替换格点。
 *
 * `sort` 的口径：**同一格（row + col）内谁的 payload 顺序在前谁在上面**。
 * 后台会把算好的 `sort` 一起发上来（拖拽落点与「上移 / 下移」的产物），
 * 此时按它排 —— 只按 payload 顺序重算会把用户排的同格顺序抹掉（保存前后不一致）；
 * 没带 `sort` 的调用方（老客户端 / 脚本）仍走「payload 顺序」这条旧口径。
 * 最后统一重编号成 0…n-1，保证跨次保存稳定。
 */
export async function saveHomeLayout(items: LayoutWriteItem[]): Promise<void> {
  const modules = await prisma.homeModule.findMany({
    select: { id: true, config: true },
  });
  const knownIds = new Set(modules.map((item) => item.id));
  const configById = new Map(modules.map((item) => [item.id, item.config]));

  const normalized = items
    .filter((item) => knownIds.has(item.moduleId))
    .map((item, index) => ({
      moduleId: item.moduleId,
      enabled: item.enabled,
      sort: item.sort,
      pin: item.pin,
      ...normalizePlacement(item),
      ...normalizeMobilePlacement(item),
      payloadOrder: index,
    }));

  const usesProvidedSort = normalized.every((item) => typeof item.sort === "number");
  const ordered = [...normalized].sort((a, b) => {
    if (a.row !== b.row) {
      return a.row - b.row;
    }
    if (a.col !== b.col) {
      return a.col - b.col;
    }
    if (usesProvidedSort) {
      const diff = (a.sort ?? 0) - (b.sort ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return a.payloadOrder - b.payloadOrder;
  });
  const sortByModule = new Map(ordered.map((item, index) => [item.moduleId, index]));

  // 栏位（`config.pin`）跟格点一起存：它是「这一格怎么摆」的属性，跟位置/宽窄同一个心智模型，
  // 用户点一次「保存布局」就该全落库，不该再点一次「保存模块配置」。
  const pinUpdates = normalized.filter((item) => item.pin !== undefined);

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

  if (pinUpdates.length > 0) {
    await prisma.$transaction(
      pinUpdates.map((item) => {
        const current = parseJson<HomeModuleConfig>(
          configById.get(item.moduleId) ?? "{}",
          {},
          `module-${item.moduleId}-config`,
        );
        return prisma.homeModule.update({
          where: { id: item.moduleId },
          data: { config: JSON.stringify({ ...current, pin: item.pin }) },
        });
      }),
    );
  }
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
  /**
   * 模板带来的初始格点（可选）。不传就不建 placement（老行为：模块先躺在列表里，
   * 去首页管理再入格）；传了则建一条**未启用**的记录，用户到首页管理里打勾即可 ——
   * 位置/宽度直接沿用模板，省得从默认整宽开始拉。
   */
  placement?: {
    col: number;
    colSpan: number;
    row: number;
    hPct: number;
    mobileCol: number;
    mobileColSpan: number;
    mobileRow: number;
    mobileHPct: number;
  };
};

export async function createCustomModule(input: CustomModuleInput): Promise<number> {
  const name = input.name.trim();
  if (!name) {
    throw new AdminHttpError("VALIDATION_ERROR", "模块名称不能为空", 400);
  }
  assertCodeLength("HTML", input.html);
  assertCodeLength("CSS", input.css);
  assertCodeLength("JS", input.js);

  const placement = input.placement
    ? {
        enabled: false,
        ...normalizePlacement(input.placement),
        ...normalizeMobilePlacement(input.placement),
      }
    : null;

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
      ...(placement
        ? {
            placement: {
              create: { ...placement, sort: await nextPlacementSort() },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  return created.id;
}

/** 新模块插到格点堆叠清单的最前面（首页管理的左栏按 sort 展示）。 */
async function nextPlacementSort(): Promise<number> {
  const first = await prisma.homePlacement.findFirst({
    select: { sort: true },
    orderBy: { sort: "asc" },
  });
  return (first?.sort ?? 1) - 1;
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
    select: { id: true, kind: true, builtinKey: true },
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

  // 代码与积木：自建模块随便改；**可编辑的内置模块**（推荐应用）也开放，
  // 否则「改成可编辑」只是句口号。其余内置模块的结构（key / blocks）仍然不给动。
  const editable = isEditableBuiltin(existing.builtinKey);
  if (existing.kind === "custom" || editable) {
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
    if (input.blocks !== undefined && existing.kind === "custom") {
      data.blocks = JSON.stringify(sanitizeBlocks(input.blocks));
    }
  }

  await prisma.homeModule.update({ where: { id }, data });
}

/** 该内置模块是否开放代码编辑（只看内置定义上的 `editable`）。 */
export function isEditableBuiltin(key: string | null): boolean {
  return builtinDefinition(isBuiltinModuleKey(key) ? key : null)?.editable === true;
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
