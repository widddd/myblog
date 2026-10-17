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

import type { ModuleStyle } from "./style";

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
  "albums",
  "album-cards",
  "announcement",
  "site",
  "categories",
  "tags",
  "recent",
  "uptime",
  "popup",
  "app-promo",
] as const;

export type BuiltinModuleKey = (typeof BUILTIN_MODULE_KEYS)[number];

/**
 * 覆盖层模块（弹出模块）：**不进格点流**，由 `HomeFloat` 画成 `position: fixed`
 * 覆盖在所有模块之上。仍然是一条正常的模块记录（有 slug / config / 格点），
 * 所以后台能照常配大小与位置；区别只在渲染层：`floatingDefinition()` 为真的模块
 * 会被 `HomeGrid` 摘掉、交给覆盖层。
 */
export const FLOATING_MODULE_KEYS = ["popup", "app-promo"] as const;

export type FloatingModuleKey = (typeof FLOATING_MODULE_KEYS)[number];

export function isFloatingModuleKey(
  value: BuiltinModuleKey | null,
): value is FloatingModuleKey {
  return (
    value !== null && (FLOATING_MODULE_KEYS as readonly string[]).includes(value)
  );
}

/** 出现边：左 / 右上 / 右下 / 居中（提示框） */
export const POPUP_PLACEMENTS = ["left", "top-right", "bottom-right", "center"] as const;

export type PopupPlacement = (typeof POPUP_PLACEMENTS)[number];

export function isPopupPlacement(value: unknown): value is PopupPlacement {
  return typeof value === "string" && (POPUP_PLACEMENTS as readonly string[]).includes(value);
}

export type HomeModuleKind = "builtin" | "custom";

/**
 * 栏位：这一格跟着页面滚（固定）还是钉在视口里（侧面）。
 * 判定与防重叠规则在 `lib/home/grid-model.ts`（`isSideWanted()` / `resolvePinnable()`）。
 */
export const HOME_PIN_MODES = ["auto", "side", "flow"] as const;

export type HomePinMode = (typeof HOME_PIN_MODES)[number];

export function isHomePinMode(value: unknown): value is HomePinMode {
  return typeof value === "string" && (HOME_PIN_MODES as readonly string[]).includes(value);
}

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
  /**
   * welcome：**一屏看到几颗**漂浮泡泡（3–16）。
   * 颗数只用来算密度（泡泡高度 = 可用高度 ÷ 一屏几颗），总列表另有上限
   * `CHIP_MAX`（24 条）——列表越长，一屏之外的靠 `rowup-scroll` 依次带上来。
   */
  chipVisible?: number;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** recommend / recent / moments / albums */
  limit?: number;
  /**
   * albums：要滚动展示哪些相册的图（每行一个**相册地址名**，即 /albums/{slug} 的那一段）。
   * 留空 = 取全部启用相册。只做筛选，不会按相册自动成组（组是文章正文里的事）。
   */
  albumSlugs?: string[];
  /** albums：横向滚动一轮的秒数（20–180，越小越快；默认 60 = 缓慢滚动） */
  speedSeconds?: number;
  /** posts */
  showCategoryBar?: boolean;
  /**
   * posts：一页最多穿插几条瞬间卡；0 = 不插（与 showCategoryBar 同在「文章卡片」模块）。
   * 瞬间与文章**按时间穿插**，所以这只是上限：本页放得下几条就放几条。
   */
  momentLimit?: number;
  /** widget 类通用 */
  heading?: string;
  /**
   * 栏位（在首页管理里选）：
   * - `auto`（默认）：窄的**同格堆叠**当「侧面」（钉住跟随滚动）；
   * - `side`：明确要求侧面；
   * - `flow`：明确要求随页面滚。
   *
   * ⚠️ 「想贴」不等于「能贴」：**只有这几列里最后一格才允许贴** —— 下面还占着同样列的格子
   * 会一路滚上来压在它身上（见 `lib/home/grid-model.ts` 的 `resolvePinnable()` 与 P-168）。
   * 放在 `config` 里是为了不引数据库列（模块在首页最多出现一次，实例配置就是格点配置）。
   */
  pin?: HomePinMode;
  /** announcement：留空时回退 Setting.announcement */
  body?: string;
  /**
   * 覆盖层模块（popup / app-promo）：
   * - placement 决定**从哪条边出现**：left / top-right / bottom-right / center（居中提示框）；
   * - delaySeconds 进页面多少秒后出现（0 = 立刻）；
   * - dismissible 是否给关闭叉叉；once 关掉后是否记住（localStorage，按模块 slug 存）。
   */
  placement?: PopupPlacement;
  delaySeconds?: number;
  dismissible?: boolean;
  once?: boolean;
  /** 覆盖层内容：title = 主标题、text = 说明文案、actionLabel/actionHref = 按钮 */
  text?: string;
  actionLabel?: string;
  actionHref?: string;
  image?: string;
  /** app-promo：小标签（如「推荐应用」） */
  badge?: string;
  /** 自建模块 */
  card?: boolean;
  scopedCss?: boolean;
  /**
   * 这个模块是不是**覆盖层**（浮在页面上、不占格点）。
   * 内置的弹出模块 / 推荐应用由 `BuiltinDefinition.floating` 决定；
   * 自建模块（模板里选「弹出模块 / 推荐应用」建的）走这个开关 ——
   * 两者由 `isFloatingModule()` 统一裁决，别再各判各的（P-137）。
   */
  floating?: boolean;
  /**
   * 基本样式（字体 / 配色 / 按钮 / 圆角 / 留白…）：普通自建模块、覆盖层模块、
   * 可编辑的内置模块都用同一套，见 `lib/home/style.ts`。没写过的键不出现在这里。
   */
  style?: ModuleStyle;
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

/**
 * 一个格子的位置（不含高度）。拖拽落点在 `lib/home/drop.ts`，那里是**显式**的
 * `stack / column / row` 三选一；这里只留「两个位置是不是同一个」这一条判断。
 */
export type PlacementBox = {
  row: number;
  col: number;
  colSpan: number;
};

export function samePlacement(a: PlacementBox, b: PlacementBox): boolean {
  return a.row === b.row && a.col === b.col && a.colSpan === b.colSpan;
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

/**
 * 这个模块是不是覆盖层（不占格点、由 `HomeFloat` 画）。
 *
 * **唯一裁决点**：内置看在不在 `FLOATING_MODULE_KEYS` 里，自建看 `config.floating`。
 * 之前这里只在三处各写一遍 `builtinDefinition(...)?.floating`，于是用模板建出来的
 * 「弹出模块」被当普通模块塞进格子里 —— 卡片内容在，定位与动画全没了（P-137）。
 */
export function isFloatingModule(module: {
  builtinKey: BuiltinModuleKey | null;
  config?: { floating?: boolean };
}): boolean {
  if (isFloatingModuleKey(module.builtinKey)) {
    return true;
  }
  return module.config?.floating === true;
}

export function isHomeBlockType(value: unknown): value is HomeBlockType {
  return (
    typeof value === "string" &&
    (HOME_BLOCK_TYPES as readonly string[]).includes(value)
  );
}
