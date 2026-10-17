/**
 * 首页格点模型：**前台 `HomeGrid` 与后台画布共用的唯一一份布局计算**。
 *
 * 为什么要单独一层：预览与前台不一致的根子就在「两边各写一套近似版式」——
 * 画布曾经自己改 `--grid-max`、自己加内边距、自己用 `--h-unit` 算高度，
 * 还把覆盖层模块与页脚运行时间当普通格子排进格点流。现在两边都只做一件事：
 * 把数据喂给 `buildHomeAreas()`，然后照着返回的类名 / CSS 变量渲染。
 *
 * 本文件是纯函数（只依赖 `lib/home/grid.ts` 与 `lib/home/types.ts`），
 * 服务端组件与 client 画布都能直接用。
 */

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils/cn";

import { areaStyle, moduleBoxStyle } from "./grid";
import { isBuiltinModuleKey, toAreas } from "./types";

/** 窄的堆叠格子（侧栏那种）跟随滚动，保持原侧栏 sticky 观感。 */
const STICKY_MAX_SPAN = 6;

/**
 * 「栏位」：这一格跟着页面滚（固定）还是钉住（侧面）。
 *
 * - `auto`（默认）：窄的**同格堆叠**才当侧面（老规矩，宽度 ≤ 6 列且格子里不止一块）；
 * - `side`：明确要求侧面；
 * - `flow`：明确要求随页面滚（哪怕它是个窄堆叠）。
 *
 * ⚠️ 想贴 ≠ 能贴：**只有「这几列里最后一格」才允许贴**。理由不是审美，是几何 ——
 * 贴住的格子会停在视口某个位置，而**它下面还占着同样那几列的格子会一路滚上来压在它身上**
 * （用户实测：划到最底部分类/标签/最近发布和公告/站点叠成一团）。所以判定要按列做：
 * 后面只要还有一格的列与它相交，它就只能是「固定」。真正的侧面栏 = 把这些格子拖进同一格，
 * 让它成为这些列里的最后一格。
 */
export type GridPinMode = "auto" | "side" | "flow";

export function isSideWanted(
  specs: ReadonlyArray<{ pin?: GridPinMode }>,
  stacked: boolean,
  colSpan: number,
): boolean {
  if (specs.some((spec) => spec.pin === "flow")) {
    return false;
  }
  if (specs.some((spec) => spec.pin === "side")) {
    return true;
  }
  return stacked && colSpan <= STICKY_MAX_SPAN;
}

function columnsOverlap(
  a: { col: number; colSpan: number },
  b: { col: number; colSpan: number },
): boolean {
  return a.col <= b.col + b.colSpan - 1 && b.col <= a.col + a.colSpan - 1;
}

/**
 * 哪些格子**允许**贴：这一列里最后一格。
 * 返回放行的 area.key；`blocked` 给出拦住它的那个格子的 key（编辑界面用来解释原因）。
 */
export function resolvePinnable(areas: ReadonlyArray<{
  key: string;
  row: number;
  col: number;
  colSpan: number;
}>): { allowed: Set<string>; blockedBy: Map<string, string> } {
  const allowed = new Set<string>();
  const blockedBy = new Map<string, string>();

  for (const area of areas) {
    const below = areas.find(
      (other) => other.row > area.row && columnsOverlap(area, other),
    );
    if (below) {
      blockedBy.set(area.key, below.key);
    } else {
      allowed.add(area.key);
    }
  }
  return { allowed, blockedBy };
}

/**
 * 从业务数据里摘出「渲染一个格子需要什么」。
 *
 * - `skip`：**不进格点流**的模块（页脚运行时间 / 覆盖层模块 / App 里不渲染的模块）。
 *   三者的判定各有唯一口子，调用方给结论，这里只负责剔除 —— 关键是**必须在分组之前剔除**，
 *   留到最后 `return null` 会剩下一个空盒子（占位、还能接住点击，见 P-137 / P-154）。
 * - `row` / `col` / `colSpan` / `sort`：**当前视口**的分组几何（前台取桌面那套，
 *   后台画布取画框当前视口那套）。
 * - `mobileCol` / `mobileColSpan` / `mobileRow`：`--m-cell-*` 变量用，
 *   走手机套时格子靠它定位（桌面画框不会被用到）。
 */
export type GridPickSpec = {
  moduleId: number;
  builtinKey: string | null;
  /** 满宽出血（`builtinDefinition(key).bleed`） */
  bleed: boolean;
  /** 不进格点流 */
  skip: boolean;
  row: number;
  col: number;
  colSpan: number;
  sort: number;
  hPct: number;
  mobileHPct: number;
  mobileCol: number;
  mobileColSpan: number;
  mobileRow: number;
  /** 栏位（见 `GridPinMode`）；缺省 `auto` */
  pin?: GridPinMode;
};

export type GridCellModel<T> = {
  item: T;
  moduleId: number;
  hPct: number;
  mobileHPct: number;
  /** `home-grid__cell …`（含 `home-grid__cell--<key>` 与两个视口的固定高度标记） */
  className: string;
  /** `--cell-h` / `--m-cell-*`（P-036：位置与高度只走 CSS 变量，不写 inline `grid-column`） */
  style: CSSProperties;
};

export type GridAreaModel<T> = {
  key: string;
  row: number;
  col: number;
  colSpan: number;
  className: string;
  style: CSSProperties;
  /** 这一格实际是「侧面」（钉住） */
  side: boolean;
  /** 想钉但被下面同列的格子拦住了（编辑界面据此解释为什么不生效） */
  sideBlockedBy: string | null;
  cells: GridCellModel<T>[];
};

/**
 * 数据 → area/cell 模型。
 *
 * 门面只做三件事：剔除 `skip`、按 `(row, col, colSpan)` 分组（`toAreas` 负责同格堆叠与
 * 同行横向重叠的下移）、给出与前台逐字一致的类名与 CSS 变量。
 */
export function buildHomeAreas<T>(
  items: T[],
  pick: (item: T) => GridPickSpec,
): GridAreaModel<T>[] {
  const placed: Array<GridPickSpec & { item: T }> = [];
  for (const item of items) {
    const spec = pick(item);
    if (!spec.skip) {
      placed.push({ ...spec, item });
    }
  }

  const grouped = toAreas(placed);
  const { allowed, blockedBy } = resolvePinnable(
    grouped.map((area) => ({
      key: area.key,
      row: area.row,
      col: area.col,
      colSpan: area.colSpan,
    })),
  );

  return grouped.map((area) => {
    const bleed = area.items.some((entry) => entry.bleed);
    const stacked = area.items.length > 1;
    const wantsSide = isSideWanted(area.items, stacked, area.colSpan);
    const side = wantsSide && allowed.has(area.key);

    return {
      key: area.key,
      row: area.row,
      col: area.col,
      colSpan: area.colSpan,
      side,
      sideBlockedBy: wantsSide && !side ? (blockedBy.get(area.key) ?? null) : null,
      className: cn(
        "home-grid__area",
        bleed && "is-bleed",
        stacked && "is-stack",
        side && "is-sticky",
      ),
      style: areaStyle(area),
      cells: area.items.map((entry) => ({
        item: entry.item,
        moduleId: entry.moduleId,
        hPct: entry.hPct,
        mobileHPct: entry.mobileHPct,
        className: cn(
          "home-grid__cell",
          `home-grid__cell--${isBuiltinModuleKey(entry.builtinKey) ? entry.builtinKey : "custom"}`,
          // 高度口径见 lib/layout/viewport.ts：0 = 自适应，其余按像素。
          // 两个视口各有一个只读一次的高度，所以格子必须**分别**带两个标记：
          // 桌面 `is-hfixed` / 手机 `is-m-hfixed` —— 只有一个真的配了固定高度时，
          // 另一个视口才不会连出「高度 + 尺寸容器」两件套（P-139）。
          entry.hPct > 0 && "is-hfixed",
          entry.mobileHPct > 0 && "is-m-hfixed",
        ),
        style: moduleBoxStyle({
          hPct: entry.hPct,
          mobileCol: entry.mobileCol,
          mobileColSpan: entry.mobileColSpan,
          mobileRow: entry.mobileRow,
          mobileHPct: entry.mobileHPct,
        }),
      })),
    };
  });
}

/** 同格堆叠里第几格（0 起）：给后台画布的坐标提示用。 */
export function stackIndexOf<T>(cells: GridCellModel<T>[], moduleId: number): number {
  return cells.findIndex((cell) => cell.moduleId === moduleId);
}
