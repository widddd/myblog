/**
 * 首页模块化类型。此文件不引入 prisma / react，client 组件可直接 import。
 * 设计说明见 docs/home-modules-spec.md 与 docs/responsive-layout-spec.md。
 */

import {
  clampInt,
  normalizeBox,
  type DualLayoutBox,
} from "@/lib/layout/box";
import { LAYOUT_COLUMNS } from "@/lib/layout/viewport";

export { clampInt };
export type { DualLayoutBox, LayoutBox } from "@/lib/layout/box";
export type { LayoutViewportId } from "@/lib/layout/viewport";

export const HOME_GRID_COLUMNS = LAYOUT_COLUMNS;

export const BUILTIN_MODULE_KEYS = [
  "banner",
  "welcome",
  "recommend",
  "moments",
  "posts",
  "announcement",
  "site",
  "categories",
  "tags",
  "recent",
  "uptime",
] as const;

export type BuiltinModuleKey = (typeof BUILTIN_MODULE_KEYS)[number];

export type HomeModuleKind = "builtin" | "custom";

/** 自建模块里的积木。基础组件全部复用现有前台组件，不平行重写。 */
export const HOME_BLOCK_TYPES = [
  "heading",
  "text",
  "html",
  "button",
  "image",
  "divider",
  "postList",
  "postGrid",
  "categories",
  "tags",
  "siteStats",
  "recent",
] as const;

export type HomeBlockType = (typeof HOME_BLOCK_TYPES)[number];

export type HomeBlock = {
  id: string;
  type: HomeBlockType;
  text?: string;
  level?: 1 | 2 | 3 | 4;
  href?: string;
  src?: string;
  alt?: string;
  limit?: number;
  source?: "latest" | "recommend";
  variant?: "solid" | "ghost";
};

export type HomeModuleConfig = {
  /** banner */
  subtitle?: string;
  height?: "full" | "large" | "medium";
  /** welcome */
  eyebrow?: string;
  title?: string;
  lines?: string[];
  chips?: string[];
  showChips?: boolean;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** recommend / recent / moments */
  limit?: number;
  /** posts */
  showCategoryBar?: boolean;
  /** widget 类通用 */
  heading?: string;
  /** announcement：留空时回退 Setting.announcement */
  body?: string;
  /** 自建模块 */
  card?: boolean;
  scopedCss?: boolean;
};

export type HomeModuleView = {
  id: number;
  slug: string;
  name: string;
  kind: HomeModuleKind;
  builtinKey: BuiltinModuleKey | null;
  html: string;
  css: string;
  js: string;
  blocks: HomeBlock[];
  config: HomeModuleConfig;
  system: boolean;
};

export type HomePlacementView = DualLayoutBox & {
  moduleId: number;
  enabled: boolean;
  rowSpan: number;
  sort: number;
};

export type HomeLayoutItem = {
  module: HomeModuleView;
  placement: HomePlacementView;
};

export type DropTarget = {
  row: number;
  col: number;
  colSpan?: number;
  adopt: boolean;
};

export type PlacementBox = {
  row: number;
  col: number;
  colSpan: number;
};

export function samePlacement(a: PlacementBox, b: PlacementBox): boolean {
  return a.row === b.row && a.col === b.col && a.colSpan === b.colSpan;
}

/** 把落点收成合法格点。并入已有格时采用目标格的宽度。 */
export function resolveDropPlacement(
  current: PlacementBox,
  target: DropTarget,
): PlacementBox {
  const colSpan = target.adopt
    ? clampInt(target.colSpan ?? current.colSpan, 1, HOME_GRID_COLUMNS, current.colSpan)
    : current.colSpan;
  const col = clampInt(target.col, 1, HOME_GRID_COLUMNS - colSpan + 1, 1);
  const row = clampInt(target.row, 1, 200, 1);
  return { row, col, colSpan };
}

export function applyDropToEntries<
  T extends { moduleId: number; row: number; col: number; colSpan: number },
>(entries: T[], moduleId: number, next: PlacementBox): T[] {
  return entries.map((entry) =>
    entry.moduleId === moduleId ? { ...entry, ...next } : entry,
  );
}

/**
 * 把格点收进 12 列画布内：col + colSpan 不得越过右边界。
 * 后台拖动与 API 写入都走这里，避免两套裁剪逻辑漂移。
 *
 * rowSpan 恒为 1：纵向高度由「同格堆叠」表达，不用行跨越
 * （行跨越会把侧栏 widget 摊成大间距，见 docs/pitfalls.md P-037）。
 */
export function normalizePlacement(input: {
  col?: unknown;
  colSpan?: unknown;
  row?: unknown;
  hPct?: unknown;
}): Pick<HomePlacementView, "col" | "colSpan" | "row" | "rowSpan" | "hPct"> {
  const box = normalizeBox(input);
  return { ...box, rowSpan: 1 };
}

export function normalizeMobilePlacement(input: {
  mobileCol?: unknown;
  mobileColSpan?: unknown;
  mobileRow?: unknown;
  mobileHPct?: unknown;
}): Pick<
  HomePlacementView,
  "mobileCol" | "mobileColSpan" | "mobileRow" | "mobileHPct"
> {
  const box = normalizeBox({
    col: input.mobileCol,
    colSpan: input.mobileColSpan,
    row: input.mobileRow,
    hPct: input.mobileHPct,
  });
  return {
    mobileCol: box.col,
    mobileColSpan: box.colSpan,
    mobileRow: box.row,
    mobileHPct: box.hPct,
  };
}

/** 格点最小形状。前台带模块数据，后台画布只带 id，共用同一套分组。 */
export type PlacedLike = {
  moduleId: number;
  row: number;
  col: number;
  colSpan: number;
  sort: number;
};

/** 格点排序：先行、再列、最后同格堆叠顺序。 */
export function comparePlacement(a: PlacedLike, b: PlacedLike): number {
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  if (a.col !== b.col) {
    return a.col - b.col;
  }
  if (a.sort !== b.sort) {
    return a.sort - b.sort;
  }
  return a.moduleId - b.moduleId;
}

/**
 * 一个格子（同一行的同一列区间）。同格多个模块纵向堆叠，
 * 这样「文章卡 + 右侧一列 widget」不需要行跨越就能还原现有版式。
 */
export type HomeArea<T extends PlacedLike = PlacedLike> = {
  key: string;
  row: number;
  col: number;
  colSpan: number;
  items: T[];
};

export function areaKey(placement: {
  row: number;
  col: number;
  colSpan: number;
}): string {
  return `${placement.row}:${placement.col}:${placement.colSpan}`;
}

/**
 * 分组成格子，并解决同一行的横向重叠：被压住的格子整体下移一行。
 * 前台与后台画布共用本函数，保证所见即所得。
 */
export function toAreas<T extends PlacedLike>(items: T[]): HomeArea<T>[] {
  const grouped = new Map<string, HomeArea<T>>();

  for (const item of [...items].sort(comparePlacement)) {
    const { row, col, colSpan } = item;
    const key = areaKey({ row, col, colSpan });
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      grouped.set(key, { key, row, col, colSpan, items: [item] });
    }
  }

  const pending = new Map<number, HomeArea<T>[]>();
  for (const area of grouped.values()) {
    const bucket = pending.get(area.row);
    if (bucket) {
      bucket.push(area);
    } else {
      pending.set(area.row, [area]);
    }
  }

  if (pending.size === 0) {
    return [];
  }

  const resolved: HomeArea<T>[] = [];
  const startRow = Math.min(...pending.keys());
  const lastRow = Math.max(...pending.keys()) + grouped.size + 1;

  for (let row = startRow; row <= lastRow; row += 1) {
    const bucket = pending.get(row);
    if (!bucket) {
      continue;
    }
    pending.delete(row);

    const occupied: Array<[number, number]> = [];
    for (const area of [...bucket].sort((a, b) => a.col - b.col)) {
      const start = area.col;
      const end = area.col + area.colSpan - 1;
      const clash = occupied.some(([from, to]) => start <= to && end >= from);
      if (clash) {
        const nextRow = row + 1;
        const next = pending.get(nextRow) ?? [];
        next.push({ ...area, row: nextRow });
        pending.set(nextRow, next);
        continue;
      }
      occupied.push([start, end]);
      resolved.push({ ...area, row });
    }
  }

  return resolved.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
}

export function isBuiltinModuleKey(value: unknown): value is BuiltinModuleKey {
  return (
    typeof value === "string" &&
    (BUILTIN_MODULE_KEYS as readonly string[]).includes(value)
  );
}

export function isHomeBlockType(value: unknown): value is HomeBlockType {
  return (
    typeof value === "string" &&
    (HOME_BLOCK_TYPES as readonly string[]).includes(value)
  );
}
