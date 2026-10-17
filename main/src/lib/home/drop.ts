/**
 * 首页拖拽落点模型（纯函数；后台画布与单测共用）。
 *
 * 旧实现以**整格**为单位判断落点（「并入这一格」或「按指针列号另落一格」），
 * 于是「落在两个模块中间」只能表达成"附到某个模块上"，落定后再由 `toAreas`
 * 把重叠的整体下移一行 —— 用户看到的就是「附着 + 重叠」。
 *
 * 这里把落点变成**三选一的显式结构**：
 *
 * | kind | 含义 |
 * |---|---|
 * | `stack`  | 并入某个已有格子的堆叠，落在第 `index` 位（同格中间插入就是它） |
 * | `column` | 放进某一行的空列区段（指针在格子左右的空档里） |
 * | `row`    | 新起一行带，插到第 `row` 行之前（首尾移动 / 跨行移动就是它） |
 *
 * 「手机档」走 `mode: "list"`：手机里 area 是 `display: contents`，同格 = 同一 grid 区域
 * = 两个格子互相压住，所以手机落点只产出 `row`（纵向插入），不产出 `stack`。
 */

import { clampInt } from "@/lib/layout/box";

import { HOME_GRID_COLUMNS, toAreas } from "./types";

export type DropEntry = {
  moduleId: number;
  row: number;
  col: number;
  colSpan: number;
  sort: number;
};

export type DropTarget =
  | {
      kind: "stack";
      row: number;
      col: number;
      colSpan: number;
      /** 落进该格堆叠的第几位（0 起，已排除被拖模块自己） */
      index: number;
      /** 落定后这一格共有几块（含被拖模块） */
      total: number;
    }
  | { kind: "column"; row: number; col: number; colSpan: number }
  | { kind: "row"; row: number; col: number; colSpan: number };

export type DropMode = "grid" | "list";

/** 测量出来的一个格子（坐标是**设计视口坐标**，即相对画框左上角，不含缩放与滚动）。 */
export type DropMeasureCell = {
  moduleId: number;
  row: number;
  col: number;
  colSpan: number;
  sort: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type DropModel = {
  mode: DropMode;
  cells: DropMeasureCell[];
  /** 12 条列轨道（设计视口坐标），第 1 列是 `columns[0]` */
  columns: Array<{ left: number; right: number }>;
};

const MID = (top: number, bottom: number) => (top + bottom) / 2;

/**
 * 行带**上下沿**的容差：指针贴在某一格的顶部/底部这几像素里时，算「插到这一行之前 / 之后」，
 * 而不是「并进这一格」。
 *
 * 为什么需要它：两个行带之间的真空隙只有 `--grid-gap`（16px），一格 200px 高的模块
 * 想"插到它上面/下面"就得精确命中那 16px —— 用户报的「落在两个模块中间却附着上去」
 * 有一半是这么来的。贴边给 12px 容差后，边界区变成 ~40px，落点也仍然明确（HUD 会说
 * 「新起一行 · 插到第 N 行」）。同格堆叠**内部**的位置不受影响：那是按每块自己的中线算的。
 */
const BOUNDARY_TOL = 12;

/** 行带 → 它的纵向范围（同一行的多个格子取并集）。 */
function bandOf(
  cells: DropMeasureCell[],
): Map<number, { top: number; bottom: number }> {
  const bands = new Map<number, { top: number; bottom: number }>();
  for (const cell of cells) {
    const current = bands.get(cell.row);
    bands.set(cell.row, {
      top: current ? Math.min(current.top, cell.top) : cell.top,
      bottom: current ? Math.max(current.bottom, cell.bottom) : cell.bottom,
    });
  }
  return bands;
}

/** 同格（同一行同一列区间）的一组格子，按堆叠顺序排好。 */
function stacksOf(cells: DropMeasureCell[]): DropMeasureCell[][] {
  const groups = new Map<string, DropMeasureCell[]>();
  for (const cell of cells) {
    const key = `${cell.row}:${cell.col}:${cell.colSpan}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(cell);
    } else {
      groups.set(key, [cell]);
    }
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.sort - b.sort || a.moduleId - b.moduleId || a.top - b.top);
  }
  return [...groups.values()];
}

/** 指针 x → 列（1 起）。落在轨道外就取最近的一列。 */
export function columnAt(
  model: DropModel,
  x: number,
  colSpan: number,
): number {
  const span = clampInt(colSpan, 1, HOME_GRID_COLUMNS, HOME_GRID_COLUMNS);
  const max = HOME_GRID_COLUMNS - span + 1;
  let col = HOME_GRID_COLUMNS;

  if (model.columns.length > 0) {
    const hit = model.columns.findIndex(
      (track) => x >= track.left && x <= track.right,
    );
    if (hit >= 0) {
      col = hit + 1;
    } else {
      // 落在所有轨道之外（画框左右留白）：取最近的一条
      let best = Number.POSITIVE_INFINITY;
      model.columns.forEach((track, index) => {
        const distance = Math.min(Math.abs(x - track.left), Math.abs(x - track.right));
        if (distance < best) {
          best = distance;
          col = index + 1;
        }
      });
    }
  }

  return clampInt(col, 1, max, 1);
}

function contains(
  rect: { top: number; bottom: number; left: number; right: number },
  x: number,
  y: number,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function overlaps(
  a: { col: number; colSpan: number },
  b: { col: number; colSpan: number },
): boolean {
  const aEnd = a.col + a.colSpan - 1;
  const bEnd = b.col + b.colSpan - 1;
  return a.col <= bEnd && aEnd >= b.col;
}

/**
 * 指针位置 → 落点。
 *
 * `model` 是**按下时冻结**的几何快照：拖动过程中预览会重排，若边拖边量，
 * 落点会跟着预览来回跳（旧实现的「落点反复切换」）。冻结之后落点只跟指针有关，
 * 边缘自动滚动则是「指针没动、画框在滚」→ 设计视口坐标自然变化 → 落点跟着更新。
 */
export function resolveDropTarget(
  model: DropModel,
  pointer: { x: number; y: number },
  dragged: { moduleId: number; colSpan: number },
): DropTarget | null {
  if (model.cells.length === 0 && model.columns.length === 0) {
    return null;
  }
  const ownSpan = clampInt(dragged.colSpan, 1, HOME_GRID_COLUMNS, HOME_GRID_COLUMNS);
  const col = columnAt(model, pointer.x, ownSpan);

  return model.mode === "list"
    ? resolveList(model, pointer.y, col, ownSpan)
    : resolveGrid(model, pointer, col, ownSpan, dragged.moduleId);
}

/**
 * 手机档：纵向插入。按格子中线找「插到哪一格之前」，落点永远是新的行带。
 */
function resolveList(
  model: DropModel,
  y: number,
  col: number,
  ownSpan: number,
): DropTarget {
  const sorted = [...model.cells].sort(
    (a, b) => a.row - b.row || a.col - b.col || MID(a.top, a.bottom) - MID(b.top, b.bottom),
  );
  const below = sorted.find((cell) => y <= MID(cell.top, cell.bottom));
  const maxRow = model.cells.reduce((max, cell) => Math.max(max, cell.row), 0);
  return {
    kind: "row",
    row: below ? below.row : maxRow + 1,
    col,
    colSpan: ownSpan,
  };
}

function resolveGrid(
  model: DropModel,
  pointer: { x: number; y: number },
  col: number,
  ownSpan: number,
  draggedModuleId: number,
): DropTarget {
  const stacks = stacksOf(model.cells);
  const rowInsert = (row: number): DropTarget => ({
    kind: "row",
    row: Math.max(1, row),
    col,
    colSpan: ownSpan,
  });

  // ① 指针落在一个格子里（横纵都命中）
  const containing = stacks.find((cells) =>
    cells.some((cell) => contains(cell, pointer.x, pointer.y)),
  );
  if (containing) {
    // 贴这一格的上下沿 → 「插到这一行之前 / 之后」（边界区给 12px 容差，见 BOUNDARY_TOL）
    const top = Math.min(...containing.map((cell) => cell.top));
    const bottom = Math.max(...containing.map((cell) => cell.bottom));
    const row = containing[0].row;
    if (pointer.y < top + BOUNDARY_TOL) {
      return rowInsert(row);
    }
    if (pointer.y > bottom - BOUNDARY_TOL) {
      return rowInsert(row + 1);
    }
    return stackTarget(containing, pointer.y, draggedModuleId);
  }

  // ② 在同一行带里、但在格子的左右空档 → 放进这一行的空列区段
  const bands = bandOf(model.cells);
  const band = [...bands.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([, rect]) => pointer.y >= rect.top && pointer.y <= rect.bottom);
  if (band) {
    const [row] = band;
    const inRow = model.cells.filter((cell) => cell.row === row);
    const clash = inRow.some((cell) => overlaps({ col, colSpan: ownSpan }, cell));
    if (!clash) {
      return { kind: "column", row, col, colSpan: ownSpan };
    }
    // 与同行已有格子冲突：退成「横向最近的那一格并入」，不允许落点靠 toAreas 把谁推下去
    const nearest = inRow.reduce((best, cell) => {
      const distance = horizontalDistance(cell, pointer.x);
      return !best || distance < best.distance ? { cell, distance } : best;
    }, null as null | { cell: DropMeasureCell; distance: number });
    if (nearest) {
      const cells = model.cells.filter(
        (cell) =>
          cell.row === nearest.cell.row &&
          cell.col === nearest.cell.col &&
          cell.colSpan === nearest.cell.colSpan,
      );
      return stackTarget(
        [...cells].sort((a, b) => a.sort - b.sort || a.top - b.top),
        pointer.y,
        draggedModuleId,
      );
    }
    return { kind: "column", row, col, colSpan: ownSpan };
  }

  // ③ 行与行之间、最上或最下 → 新起一行，插到下一行带之前
  const rows = [...new Set(model.cells.map((cell) => cell.row))].sort((a, b) => a - b);
  const below = rows.find((row) => (bands.get(row)?.top ?? Number.POSITIVE_INFINITY) > pointer.y);
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : 0;
  return rowInsert(below ?? lastRow + 1);
}

function horizontalDistance(cell: DropMeasureCell, x: number): number {
  if (x < cell.left) {
    return cell.left - x;
  }
  if (x > cell.right) {
    return x - cell.right;
  }
  return 0;
}

function stackTarget(
  cells: DropMeasureCell[],
  y: number,
  draggedModuleId: number,
): DropTarget {
  const first = cells[0];
  let index = 0;
  for (const cell of cells) {
    if (cell.moduleId === draggedModuleId) {
      continue;
    }
    if (y > MID(cell.top, cell.bottom)) {
      index += 1;
    }
  }
  const others = cells.filter((cell) => cell.moduleId !== draggedModuleId).length;
  return {
    kind: "stack",
    row: first.row,
    col: first.col,
    colSpan: first.colSpan,
    index,
    total: others + 1,
  };
}

export function sameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.row !== b.row || a.col !== b.col || a.colSpan !== b.colSpan) {
    return false;
  }
  if (a.kind === "stack" && b.kind === "stack") {
    return a.index === b.index;
  }
  return true;
}

/** 行号收紧：把空洞收掉（CSS Grid 里空轨道会白白多出一份 gap）。 */
export function normalizeRows<T extends { row: number }>(
  entries: T[],
  extraRows: number[] = [],
): T[] {
  const rows = [...new Set([...entries.map((entry) => entry.row), ...extraRows])].sort(
    (a, b) => a - b,
  );
  const rank = new Map(rows.map((row, index) => [row, index + 1]));
  return entries.map((entry) => ({ ...entry, row: rank.get(entry.row) ?? 1 }));
}

/**
 * 落点 → 落定后的 entries。
 *
 * 顺序：行插入先整体下移 → 放好被拖模块 → 重排该格堆叠顺序 → 按文档序重编 `sort` →
 * 收紧行号。返回的是一份新数组，调用方（预览 / 落定 / 保存）吃同一份数据，
 * 所以「预览 = 松手结果 = 保存刷新结果」是同一件事。
 */
export function planDrop<T extends DropEntry>(
  entries: T[],
  moduleId: number,
  target: DropTarget,
): T[] {
  const dragged = entries.find((entry) => entry.moduleId === moduleId);
  if (!dragged) {
    return entries;
  }

  const shifted: T[] =
    target.kind === "row"
      ? entries.map((entry) =>
          entry.row >= target.row ? { ...entry, row: entry.row + 1 } : { ...entry },
        )
      : entries.map((entry) => ({ ...entry }));

  const placed = shifted.map((entry) =>
    entry.moduleId === moduleId
      ? { ...entry, row: target.row, col: target.col, colSpan: target.colSpan }
      : entry,
  );

  const ordered = orderByDocument(placed, {
    moduleId,
    row: target.row,
    col: target.col,
    colSpan: target.colSpan,
    index: target.kind === "stack" ? target.index : null,
  });

  return normalizeRows(ordered, [target.row]);
}

/**
 * 把「库里存的位置」收敛成「真正渲染出来的位置」。
 *
 * `toAreas()` 会在**同一行横向重叠**时把被压住的格子整体下移一行 —— 那是渲染时算的，
 * 库里存的还是原值。两者不一致时，拖拽的「第 N 行」在渲染坐标系与存储坐标系里指的不是同一行：
 * 落点提示说第 4 行，写回的却是存储的第 4 行，松手/保存/刷新各说各话。
 *
 * 收敛只动**启用中**的模块（未启用的不渲染，行号无意义，也由「勾选入格」重新指派），
 * 并把渲染行号收紧成 1…n（`toAreas` 保留最小行号，留着空洞会白白多出轨道间距）。
 * 收敛后的渲染结果与原数据**逐像素一致**（用的就是同一个 `toAreas`）。
 */
export function canonicalizeBoxes<T extends DropEntry & { enabled: boolean }>(
  entries: T[],
): T[] {
  const enabled = entries.filter((entry) => entry.enabled);
  if (enabled.length === 0) {
    return normalizeOrder(entries);
  }

  const boxes = new Map<number, { row: number; col: number; colSpan: number }>();
  for (const area of toAreas(enabled)) {
    for (const item of area.items) {
      boxes.set(item.moduleId, { row: area.row, col: area.col, colSpan: area.colSpan });
    }
  }
  const rows = [...new Set([...boxes.values()].map((box) => box.row))].sort((a, b) => a - b);
  const rank = new Map(rows.map((row, index) => [row, index + 1]));

  const patched = entries.map((entry) => {
    const box = boxes.get(entry.moduleId);
    return box
      ? { ...entry, row: rank.get(box.row) ?? 1, col: box.col, colSpan: box.colSpan }
      : { ...entry };
  });

  return normalizeOrder(patched);
}

/** 按文档序（行 → 列 → 堆叠位）重排并重编号 `sort`。 */
export function normalizeOrder<T extends DropEntry>(entries: T[]): T[] {
  return orderByDocument(entries, {
    moduleId: -1,
    row: -1,
    col: -1,
    colSpan: -1,
    index: null,
  });
}

/**
 * 按文档序（行 → 列 → 堆叠位）重排并重编号 `sort`。
 * `splice` 指定目标格里被拖模块要插到第几位。
 */
function orderByDocument<T extends DropEntry>(
  entries: T[],
  splice: {
    moduleId: number;
    row: number;
    col: number;
    colSpan: number;
    index: number | null;
  },
): T[] {
  const rows = [...new Set(entries.map((entry) => entry.row))].sort((a, b) => a - b);
  const out: T[] = [];
  let sort = 0;

  for (const row of rows) {
    const inRow = entries.filter((entry) => entry.row === row);
    const groups = new Map<string, T[]>();
    for (const entry of inRow) {
      const key = `${entry.col}:${entry.colSpan}`;
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    const keys = [...groups.keys()].sort((a, b) => {
      const [aCol, aSpan] = a.split(":").map(Number);
      const [bCol, bSpan] = b.split(":").map(Number);
      return aCol - bCol || aSpan - bSpan;
    });

    for (const key of keys) {
      const bucket = [...(groups.get(key) ?? [])].sort(
        (a, b) => a.sort - b.sort || a.moduleId - b.moduleId,
      );
      const isTarget =
        splice.index !== null &&
        splice.row === row &&
        key === `${splice.col}:${splice.colSpan}`;

      const ordered = isTarget ? spliceIn(bucket, splice.moduleId, splice.index ?? 0) : bucket;
      for (const entry of ordered) {
        out.push({ ...entry, sort: sort++ });
      }
    }
  }

  return out;
}

function spliceIn<T extends DropEntry>(bucket: T[], moduleId: number, index: number): T[] {
  const moved = bucket.find((entry) => entry.moduleId === moduleId);
  if (!moved) {
    return bucket;
  }
  const rest = bucket.filter((entry) => entry.moduleId !== moduleId);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** 两格占的列有交集。 */
function columnsOverlap(
  a: { col: number; colSpan: number },
  b: { col: number; colSpan: number },
): boolean {
  return a.col <= b.col + b.colSpan - 1 && b.col <= a.col + a.colSpan - 1;
}

/**
 * 「把下面的并进来」：把这一格**下面**所有占着同样列的模块挪进这一格（追加到堆叠末尾）。
 *
 * 为什么需要它：栏位想设成「侧面（钉住）」的前提是**它必须是这些列里的最后一格**
 * —— 否则下面那些同列的格子会一路滚上来压在它身上（P-168）。与其让用户一个个拖，
 * 不如给一个动作：一次把这列里的后续格子收进来，成为一整条侧面栏。
 */
export function mergeColumnBelow<T extends DropEntry>(
  entries: T[],
  moduleId: number,
): T[] {
  const target = entries.find((entry) => entry.moduleId === moduleId);
  if (!target) {
    return entries;
  }
  const below = entries.filter(
    (entry) => entry.row > target.row && columnsOverlap(target, entry),
  );
  if (below.length === 0) {
    return entries;
  }

  const moved = new Set(below.map((entry) => entry.moduleId));
  const patched = entries.map((entry) =>
    moved.has(entry.moduleId)
      ? { ...entry, row: target.row, col: target.col, colSpan: target.colSpan }
      : { ...entry },
  );

  // 目标格里的顺序：原来就在的按原 sort 在前，后并进来的按原文档序追加在后
  const orderOf = (a: T, b: T) => a.sort - b.sort || a.moduleId - b.moduleId;
  const original = entries
    .filter(
      (entry) =>
        !moved.has(entry.moduleId) &&
        entry.row === target.row &&
        entry.col === target.col &&
        entry.colSpan === target.colSpan,
    )
    .sort(orderOf);
  const appended = below.sort(orderOf);
  const localOrder = new Map<number, number>();
  [...original, ...appended].forEach((entry, index) => localOrder.set(entry.moduleId, index));

  return normalizeRows(
    normalizeOrder(
      patched.map((entry) =>
        localOrder.has(entry.moduleId)
          ? { ...entry, sort: localOrder.get(entry.moduleId) ?? entry.sort }
          : entry,
      ),
    ),
    [],
  );
}

/** 落定后这一块**实际**在哪：给落点提示 / HUD 文案用（吃的是落定后的数据，不是落点声明）。 */export type EffectivePlacement = {
  row: number;
  col: number;
  colSpan: number;
  /** 同格堆叠里的第几位（0 起；独占一格时为 0） */
  index: number;
  /** 这一格共有几块 */
  total: number;
};

export function effectivePlacement<T extends DropEntry>(
  entries: T[],
  moduleId: number,
): EffectivePlacement | null {
  const target = entries.find((entry) => entry.moduleId === moduleId);
  if (!target) {
    return null;
  }
  const stack = entries
    .filter(
      (entry) =>
        entry.row === target.row &&
        entry.col === target.col &&
        entry.colSpan === target.colSpan,
    )
    .sort((a, b) => a.sort - b.sort || a.moduleId - b.moduleId);
  return {
    row: target.row,
    col: target.col,
    colSpan: target.colSpan,
    index: Math.max(0, stack.findIndex((entry) => entry.moduleId === moduleId)),
    total: stack.length,
  };
}

/** 落点 → 一行的中文说明（画布 HUD 与状态提示共用一份口径）。 */
export function describeDrop(
  target: DropTarget,
  placement: EffectivePlacement | null,
): string {
  const place = placement ?? {
    row: target.row,
    col: target.col,
    colSpan: target.colSpan,
    index: target.kind === "stack" ? target.index : 0,
    total: target.kind === "stack" ? target.total : 1,
  };
  const range = `${place.col}–${place.col + place.colSpan - 1} 列`;

  if (target.kind === "stack") {
    return place.total > 1
      ? `并入第 ${place.row} 行 · ${range} 的同格堆叠 · 第 ${place.index + 1} 位（共 ${place.total} 块）`
      : `并入第 ${place.row} 行 · ${range}`;
  }
  if (target.kind === "column") {
    return `放进第 ${place.row} 行 · ${range}（与已有模块并排）`;
  }
  return `新起一行 · 插到第 ${place.row} 行 · ${range}`;
}
