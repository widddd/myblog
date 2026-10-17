import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizePlacement,
  samePlacement,
  toAreas,
  type PlacedLike,
} from "./types";

function placed(
  moduleId: number,
  row: number,
  col: number,
  colSpan: number,
  sort = moduleId,
): PlacedLike {
  return { moduleId, row, col, colSpan, sort };
}

test("同一格的多个模块合并成一个堆叠", () => {
  const areas = toAreas([
    placed(1, 3, 1, 9),
    placed(2, 3, 10, 3, 0),
    placed(3, 3, 10, 3, 1),
    placed(4, 3, 10, 3, 2),
  ]);

  assert.equal(areas.length, 2);
  const stack = areas.find((area) => area.col === 10);
  assert.ok(stack);
  assert.deepEqual(
    stack.items.map((item) => item.moduleId),
    [2, 3, 4],
  );
});

test("默认布局解析出 4 个格子且顺序为行优先", () => {
  const areas = toAreas([
    placed(1, 1, 1, 12),
    placed(2, 2, 1, 6),
    placed(3, 2, 7, 6),
    placed(4, 3, 1, 9),
    placed(5, 3, 10, 3),
  ]);

  assert.deepEqual(
    areas.map((area) => `${area.row}:${area.col}-${area.colSpan}`),
    ["1:1-12", "2:1-6", "2:7-6", "3:1-9", "3:10-3"],
  );
});

test("同一行横向重叠时后面的格子整体下移一行", () => {
  const areas = toAreas([placed(1, 1, 1, 8), placed(2, 1, 5, 8)]);

  assert.equal(areas.length, 2);
  assert.equal(areas[0].row, 1);
  assert.equal(areas[0].col, 1);
  assert.equal(areas[1].row, 2);
  assert.equal(areas[1].col, 5);
});

test("重叠下移会级联，不会互相覆盖", () => {
  const areas = toAreas([
    placed(1, 1, 1, 12),
    placed(2, 1, 1, 6),
    placed(3, 2, 3, 6),
  ]);

  const rows = areas.map((area) => area.row).sort((a, b) => a - b);
  assert.deepEqual(new Set(rows).size, rows.length);
});

test("格点越界会被收进 12 列内，rowSpan 恒为 1", () => {
  assert.deepEqual(normalizePlacement({ col: 11, colSpan: 6, row: 2 }), {
    col: 7,
    colSpan: 6,
    row: 2,
    rowSpan: 1,
    hPct: 0,
  });
  assert.deepEqual(normalizePlacement({ col: 0, colSpan: 99, row: -3, hPct: 40 }), {
    col: 1,
    colSpan: 12,
    row: 1,
    rowSpan: 1,
    hPct: 40,
  });
});

test("空布局不会抛错", () => {
  assert.deepEqual(toAreas([]), []);
});

test("同一个格子的判定只看行列跨度", () => {
  assert.equal(
    samePlacement(
      { row: 2, col: 1, colSpan: 6 },
      { row: 2, col: 1, colSpan: 6 },
    ),
    true,
  );
  assert.equal(
    samePlacement(
      { row: 2, col: 1, colSpan: 6 },
      { row: 2, col: 1, colSpan: 3 },
    ),
    false,
  );
});
