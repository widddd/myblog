import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeBoxes,
  columnAt,
  describeDrop,
  effectivePlacement,
  mergeColumnBelow,
  normalizeRows,
  planDrop,
  resolveDropTarget,
  sameDropTarget,
  type DropEntry,
  type DropMeasureCell,
  type DropModel,
  type DropTarget,
} from "./drop";
import { toAreas } from "./types";

/**
 * 落点模型回归测试。
 *
 * 这里覆盖的是**根因**，不是表象：
 * - 落在两个模块中间必须插到它们之间（不是「附到某个模块上」）；
 * - 同格堆叠的任意位置都能插（含中间）；
 * - 落定后的数据必须**不再被 `toAreas` 搬动**（这才是「附着 + 重叠」的来源）；
 * - 手机档只做纵向插入（同格 = 同一 grid 区域 = 互相压住）。
 */

const GAP = 16;
const COL = 80;

type Spec = {
  moduleId: number;
  row: number;
  col: number;
  colSpan: number;
  height?: number;
  sort?: number;
};

/** 按「行带 + 同格纵向堆叠」造一份测量几何（与渲染侧的排法一致）。 */
function buildModel(specs: Spec[], mode: "grid" | "list" = "grid"): DropModel {
  const rows = [...new Set(specs.map((spec) => spec.row))].sort((a, b) => a - b);
  const cells: DropMeasureCell[] = [];
  let top = 0;

  for (const row of rows) {
    const inRow = specs
      .filter((spec) => spec.row === row)
      .sort((a, b) => a.col - b.col || (a.sort ?? a.moduleId) - (b.sort ?? b.moduleId));
    const stackBottom = new Map<string, number>();
    const bottoms: number[] = [];

    for (const spec of inRow) {
      const key = `${spec.col}:${spec.colSpan}`;
      const cellTop = stackBottom.get(key) ?? top;
      const cellBottom = cellTop + (spec.height ?? 200);
      stackBottom.set(key, cellBottom + GAP);
      bottoms.push(cellBottom);
      cells.push({
        moduleId: spec.moduleId,
        row,
        col: spec.col,
        colSpan: spec.colSpan,
        sort: spec.sort ?? spec.moduleId,
        top: cellTop,
        bottom: cellBottom,
        left: (spec.col - 1) * COL,
        right: (spec.col - 1) * COL + spec.colSpan * COL - 8,
      });
    }
    top = Math.max(...bottoms) + GAP;
  }

  return {
    mode,
    cells,
    columns: Array.from({ length: 12 }, (_, index) => ({
      left: index * COL,
      right: index * COL + COL - 8,
    })),
  };
}

/** 落在第 n 列中心、某个 y 上的指针。 */
function at(colCenter: number, y: number) {
  return { x: (colCenter - 0.5) * COL, y };
}

function entriesOf(specs: Spec[]): DropEntry[] {
  return specs.map((spec) => ({
    moduleId: spec.moduleId,
    row: spec.row,
    col: spec.col,
    colSpan: spec.colSpan,
    sort: spec.sort ?? spec.moduleId,
  }));
}

/**
 * 落定后 `toAreas` 是否**一个都不搬**。
 * 只要有人被下移，用户看到的就是「预览 = A，最终 = B」。
 */
function isStable(entries: DropEntry[]): boolean {
  const resolved = new Map<number, { row: number; col: number; colSpan: number }>();
  for (const area of toAreas(entries)) {
    for (const item of area.items) {
      resolved.set(item.moduleId, { row: area.row, col: area.col, colSpan: area.colSpan });
    }
  }
  return entries.every((entry) => {
    const box = resolved.get(entry.moduleId);
    return (
      Boolean(box) &&
      box!.row === entry.row &&
      box!.col === entry.col &&
      box!.colSpan === entry.colSpan
    );
  });
}

function rowOf(entries: DropEntry[], moduleId: number): number {
  return entries.find((entry) => entry.moduleId === moduleId)!.row;
}

function orderOf(entries: DropEntry[], row: number, col: number): number[] {
  return toAreas(entries)
    .find((area) => area.row === row && area.col === col)!
    .items.map((item) => item.moduleId);
}

test("落在两个模块中间：插到它们之间，不是附到某一格上", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 12, height: 300 },
    { moduleId: 2, row: 2, col: 1, colSpan: 6, height: 220 },
    { moduleId: 3, row: 3, col: 1, colSpan: 12, height: 400 },
  ];
  const model = buildModel(specs);
  // 第 2 行带底 = 316+220 = 536，第 3 行带顶 = 552 → 中间那条 16px 缝
  const gapY = 536 + GAP / 2;
  const target = resolveDropTarget(model, at(3, gapY), { moduleId: 9, colSpan: 6 });
  assert.ok(target);
  assert.equal(target!.kind, "row");
  assert.equal(target!.row, 3);

  const planned = planDrop(
    [...entriesOf(specs), { moduleId: 9, row: 4, col: 1, colSpan: 6, sort: 9 }],
    9,
    target!,
  );
  assert.equal(rowOf(planned, 9), 3);
  assert.equal(rowOf(planned, 3), 4);
  assert.equal(isStable(planned), true);
  assert.equal(planned.find((entry) => entry.moduleId === 9)!.colSpan, 6);
});

test("落在模块的上下半区：并入同格的第 0 / 第 1 位", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 12, height: 300 },
    { moduleId: 2, row: 2, col: 1, colSpan: 12, height: 200 },
  ];
  const model = buildModel(specs);

  const upper = resolveDropTarget(model, at(6, 320 + 40), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(upper, {
    kind: "stack",
    row: 2,
    col: 1,
    colSpan: 12,
    index: 0,
    total: 2,
  });

  const lower = resolveDropTarget(model, at(6, 320 + 160), { moduleId: 9, colSpan: 12 });
  assert.equal(lower?.kind, "stack");
  assert.equal(lower && lower.kind === "stack" ? lower.index : -1, 1);
});

test("贴住模块的上下沿：算「插到这一行之前/之后」，不是「并进这一格」", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 12, height: 900 },
    { moduleId: 2, row: 2, col: 7, colSpan: 6, height: 380 },
    { moduleId: 3, row: 3, col: 1, colSpan: 9, height: 600 },
  ];
  const model = buildModel(specs);

  // 贴「相册卡片」上沿（12px 容差内）→ 插到第 2 行之前，且保留自己的 12 列
  const top = resolveDropTarget(model, at(9, 916 + 6), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(top, { kind: "row", row: 2, col: 1, colSpan: 12 });

  // 贴它下沿 → 插到第 3 行之前（= 紧接着这一格的下一行）
  const bottom = resolveDropTarget(model, at(9, 916 + 374), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(bottom, { kind: "row", row: 3, col: 1, colSpan: 12 });

  // 正中间仍然是并入同格
  const middle = resolveDropTarget(model, at(9, 916 + 190), { moduleId: 9, colSpan: 6 });
  assert.equal(middle?.kind, "stack");

  // 边界区外一点点就回到「并入」：两侧判定都在同一套坐标里，不会忽左忽右
  const justInside = resolveDropTarget(model, at(9, 916 + 20), { moduleId: 9, colSpan: 12 });
  assert.equal(justInside?.kind, "stack");
});

test("同格堆叠的中间位置可插入（第 2 / 3 位之间）", () => {
  const specs: Spec[] = [
    { moduleId: 0, row: 1, col: 1, colSpan: 12, height: 300 },
    { moduleId: 1, row: 3, col: 10, colSpan: 3, height: 160, sort: 1 },
    { moduleId: 2, row: 3, col: 10, colSpan: 3, height: 160, sort: 2 },
    { moduleId: 3, row: 3, col: 10, colSpan: 3, height: 160, sort: 3 },
  ];
  const model = buildModel(specs);
  // 第 1 行带 0–300，第 3 行带从 316 起：三块依次 316–476 / 492–652 / 668–828；
  // 指针落在第二块的下半区（中线 572）→ 插到第 2 位之后（index 2）
  const y = 492 + 120;
  const target = resolveDropTarget(model, at(11, y), { moduleId: 9, colSpan: 3 });
  assert.equal(target?.kind, "stack");
  assert.equal(target && target.kind === "stack" ? target.index : -1, 2);

  const planned = planDrop(
    [...entriesOf(specs), { moduleId: 9, row: 5, col: 1, colSpan: 12, sort: 9 }],
    9,
    target!,
  );
  // 行号会被收紧成正整数序列，所以用落定后的真实位置断言顺序
  const placement = effectivePlacement(planned, 9);
  assert.equal(placement?.total, 4);
  assert.equal(placement?.index, 2);
  assert.deepEqual(orderOf(planned, placement!.row, 10), [1, 2, 9, 3]);
  assert.equal(isStable(planned), true);
});

test("插到开头与末尾", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 12, height: 300 },
    { moduleId: 2, row: 2, col: 1, colSpan: 12, height: 200 },
  ];
  const model = buildModel(specs);
  const entries = [...entriesOf(specs), { moduleId: 9, row: 3, col: 1, colSpan: 6, sort: 9 }];

  const top = resolveDropTarget(model, at(3, -40), { moduleId: 9, colSpan: 6 });
  assert.equal(top?.kind, "row");
  assert.equal(top?.row, 1);
  const first = planDrop(entries, 9, top!);
  assert.equal(rowOf(first, 9), 1);
  assert.equal(rowOf(first, 1), 2);
  assert.equal(isStable(first), true);

  const bottom = resolveDropTarget(model, at(3, 9000), { moduleId: 9, colSpan: 6 });
  assert.equal(bottom?.kind, "row");
  const last = planDrop(entries, 9, bottom!);
  assert.equal(rowOf(last, 9), 3);
  assert.equal(isStable(last), true);
});

test("放进同一行的空列区段（并排，不推挤别人）", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 9, height: 240 },
    { moduleId: 2, row: 2, col: 1, colSpan: 12, height: 120 },
  ];
  const model = buildModel(specs);
  const target = resolveDropTarget(model, at(11, 120), { moduleId: 9, colSpan: 3 });
  assert.deepEqual(target, { kind: "column", row: 1, col: 10, colSpan: 3 });

  const planned = planDrop(
    [...entriesOf(specs), { moduleId: 9, row: 3, col: 1, colSpan: 3, sort: 9 }],
    9,
    target!,
  );
  assert.equal(rowOf(planned, 9), 1);
  assert.equal(rowOf(planned, 2), 2);
  assert.equal(isStable(planned), true);
});

test("与同行已有格子冲突时退成横向最近那一格的并入", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 9, height: 240 },
    { moduleId: 2, row: 1, col: 10, colSpan: 3, height: 200 },
  ];
  const model = buildModel(specs);
  // 指针在第 9/10 列之间的缝里，且被拖模块自己有 12 列宽 → 与两者都冲突
  const target = resolveDropTarget(model, { x: 9 * COL - 2, y: 80 }, {
    moduleId: 9,
    colSpan: 12,
  });
  assert.equal(target?.kind, "stack");
  assert.equal(target && target.kind === "stack" ? target.col : -1, 10);
});

test("手机档只做纵向插入，不产出同格堆叠", () => {
  const specs: Spec[] = [
    { moduleId: 1, row: 1, col: 1, colSpan: 12, height: 300 },
    { moduleId: 2, row: 2, col: 1, colSpan: 12, height: 200 },
    { moduleId: 3, row: 3, col: 1, colSpan: 12, height: 200 },
  ];
  const model = buildModel(specs, "list");

  // 第 2 块中线以上 → 插到第 2 行之前
  const top = resolveDropTarget(model, at(6, 380), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(top, { kind: "row", row: 2, col: 1, colSpan: 12 });

  // 第 2 块中线以下 → 插到第 3 行之前
  const down = resolveDropTarget(model, at(6, 460), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(down, { kind: "row", row: 3, col: 1, colSpan: 12 });

  // 低于全部 → 追加到最后
  const end = resolveDropTarget(model, at(6, 9000), { moduleId: 9, colSpan: 12 });
  assert.deepEqual(end, { kind: "row", row: 4, col: 1, colSpan: 12 });

  const planned = planDrop(
    [...entriesOf(specs), { moduleId: 9, row: 4, col: 1, colSpan: 12, sort: 9 }],
    9,
    down!,
  );
  assert.deepEqual(
    planned.map((entry) => `${entry.moduleId}@${entry.row}`),
    ["1@1", "2@2", "9@3", "3@4"],
  );
});

test("落点收成 12 列：宽模块落在右边会被拉回可容纳的列", () => {
  const specs: Spec[] = [{ moduleId: 1, row: 1, col: 1, colSpan: 12, height: 200 }];
  const model = buildModel(specs);
  const target = resolveDropTarget(model, at(12, -30), { moduleId: 9, colSpan: 6 });
  assert.equal(target?.kind, "row");
  assert.equal(target?.col, 7);
  assert.equal(columnAt(model, 99999, 6), 7);
  assert.equal(columnAt(model, -50, 3), 1);
});

test("行号会收紧，不留下空洞", () => {
  const entries = entriesOf([
    { moduleId: 1, row: 3, col: 1, colSpan: 12 },
    { moduleId: 2, row: 7, col: 1, colSpan: 12 },
  ]);
  assert.deepEqual(
    normalizeRows(entries).map((entry) => entry.row),
    [1, 2],
  );
});

test("收敛：把「存在库里但渲染时被下移」的格子摆回真实位置", () => {
  // 存量数据：公告(2,8,3) 与相册卡片(2,7,6) 在同一行横向重叠
  const raw = [
    { moduleId: 1, enabled: true, row: 1, col: 1, colSpan: 12, sort: 0 },
    { moduleId: 2, enabled: true, row: 2, col: 1, colSpan: 6, sort: 1 },
    { moduleId: 3, enabled: true, row: 2, col: 7, colSpan: 6, sort: 2 },
    { moduleId: 4, enabled: true, row: 2, col: 8, colSpan: 3, sort: 3 },
    { moduleId: 5, enabled: false, row: 9, col: 1, colSpan: 12, sort: 4 },
  ];
  const before = toAreas(raw.filter((entry) => entry.enabled)).map(
    (area) => `${area.row}:${area.col}-${area.colSpan}`,
  );
  const fixed = canonicalizeBoxes(raw);
  const after = toAreas(fixed.filter((entry) => entry.enabled)).map(
    (area) => `${area.row}:${area.col}-${area.colSpan}`,
  );

  assert.deepEqual(after, before);
  assert.equal(isStable(fixed), true);
  assert.equal(rowOf(fixed, 4), 3);
  assert.deepEqual(
    fixed.map((entry) => entry.sort),
    [0, 1, 2, 3, 4],
  );
});

test("落点文案区分「并入同格」与「插入前后」", () => {
  const stack: DropTarget = {
    kind: "stack",
    row: 3,
    col: 10,
    colSpan: 3,
    index: 1,
    total: 3,
  };
  const column: DropTarget = { kind: "column", row: 2, col: 10, colSpan: 3 };
  const row: DropTarget = { kind: "row", row: 4, col: 1, colSpan: 6 };

  assert.match(describeDrop(stack, null), /同格堆叠/);
  assert.match(describeDrop(column, null), /并排/);
  assert.match(describeDrop(row, null), /新起一行/);
  assert.match(
    describeDrop(stack, { row: 3, col: 10, colSpan: 3, index: 0, total: 3 }),
    /第 1 位（共 3 块）/,
  );
});

test("同一个落点判定稳定（避免落点反复切换）", () => {
  const a: DropTarget = { kind: "stack", row: 2, col: 1, colSpan: 6, index: 1, total: 2 };
  const b: DropTarget = { kind: "stack", row: 2, col: 1, colSpan: 6, index: 1, total: 2 };
  const c: DropTarget = { kind: "stack", row: 2, col: 1, colSpan: 6, index: 0, total: 2 };
  assert.equal(sameDropTarget(a, b), true);
  assert.equal(sameDropTarget(a, c), false);
  assert.equal(sameDropTarget(a, null), false);
  assert.equal(sameDropTarget(null, null), true);
});

test("把同列后续格子并进同一格（侧面栏的前提），顺序与原守则", () => {
  const entries: DropEntry[] = [
    { moduleId: 1, row: 3, col: 1, colSpan: 9, sort: 0 },
    { moduleId: 2, row: 3, col: 10, colSpan: 3, sort: 1 },
    { moduleId: 3, row: 3, col: 10, colSpan: 3, sort: 2 },
    { moduleId: 4, row: 4, col: 8, colSpan: 3, sort: 3 },
    { moduleId: 5, row: 4, col: 10, colSpan: 3, sort: 4 },
  ];

  const merged = mergeColumnBelow(entries, 2);
  // 同列（10-12 有交集）的 3 / 4 / 5 都并进同一格（行号会被收紧成 1…n，所以按成员找）
  const stack = toAreas(merged).find((area) =>
    area.items.some((item) => item.moduleId === 2),
  );
  assert.ok(stack);
  assert.equal(stack.col, 10);
  assert.equal(stack.colSpan, 3);
  assert.deepEqual(
    stack.items.map((item) => item.moduleId),
    [2, 3, 4, 5],
  );
  assert.equal(
    merged.filter((entry) => entry.moduleId !== 1).every((entry) => entry.row === stack.row),
    true,
  );
  assert.deepEqual(
    merged.find((entry) => entry.moduleId === 1),
    { moduleId: 1, row: stack.row, col: 1, colSpan: 9, sort: 0 },
  );
  assert.equal(isStable(merged), true);
});

test("同列下面没东西时，并进来是空动作", () => {
  const entries: DropEntry[] = [
    { moduleId: 1, row: 2, col: 1, colSpan: 6, sort: 0 },
    { moduleId: 2, row: 2, col: 7, colSpan: 6, sort: 1 },
  ];
  assert.deepEqual(mergeColumnBelow(entries, 1), entries);
});
