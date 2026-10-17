import assert from "node:assert/strict";
import { test } from "node:test";
import type { CSSProperties } from "react";

import { buildHomeAreas, type GridPickSpec } from "./grid-model";

/** CSS 变量取值：`CSSProperties` 没有索引签名，测试里显式取一次。 */
function cssVar(style: CSSProperties, name: string): unknown {
  return (style as Record<string, unknown>)[name];
}

/**
 * 共用格点模型的回归测试。
 *
 * 这一层是「预览 = 前台」的**唯一保证**：两边都照它给的类名与 CSS 变量渲染。
 * 所以断言的重点是：谁进格点流、固定高度标记是否按视口分开、CSS 变量口径是否正确。
 */

type Item = { id: number; label: string };

function spec(item: Item, patch: Partial<GridPickSpec> = {}): GridPickSpec {
  return {
    moduleId: item.id,
    builtinKey: null,
    bleed: false,
    skip: false,
    row: 1,
    col: 1,
    colSpan: 12,
    sort: item.id,
    hPct: 0,
    mobileHPct: 0,
    mobileCol: 1,
    mobileColSpan: 12,
    mobileRow: 1,
    pin: undefined,
    ...patch,
  };
}

function build(items: Item[], patchOf: (item: Item) => Partial<GridPickSpec>) {
  return buildHomeAreas(items, (item) => spec(item, patchOf(item)));
}

test("不进格点流的模块在分组之前就被摘掉（不留空格子）", () => {
  const items: Item[] = [
    { id: 1, label: "banner" },
    { id: 2, label: "uptime" },
    { id: 3, label: "popup" },
    { id: 4, label: "app-promo" },
  ];

  const areas = build(items, (item) => ({
    row: item.id,
    skip: item.id !== 1,
  }));

  assert.equal(areas.length, 1);
  assert.deepEqual(
    areas[0].cells.map((cell) => cell.moduleId),
    [1],
  );
});

test("固定高度标记按视口分开：只有一边配了高度时另一边不跟着变", () => {
  const items: Item[] = [
    { id: 1, label: "desktop-fixed" },
    { id: 2, label: "mobile-fixed" },
    { id: 3, label: "auto" },
  ];

  const areas = build(items, (item) => ({
    row: item.id,
    hPct: item.id === 1 ? 380 : 0,
    mobileHPct: item.id === 2 ? 340 : 0,
  }));

  const byId = new Map(
    areas.flatMap((area) => area.cells).map((cell) => [cell.moduleId, cell]),
  );

  assert.match(byId.get(1)!.className, /is-hfixed/);
  assert.doesNotMatch(byId.get(1)!.className, /is-m-hfixed/);
  assert.doesNotMatch(byId.get(2)!.className, /is-hfixed/);
  assert.match(byId.get(2)!.className, /is-m-hfixed/);
  assert.doesNotMatch(byId.get(3)!.className, /is-(h|m-h)fixed/);

  // 高度口径：0 = auto，其余按像素（P-139）
  assert.equal(cssVar(byId.get(1)!.style, "--cell-h"), "380px");
  assert.equal(cssVar(byId.get(1)!.style, "--m-cell-h"), "auto");
  assert.equal(cssVar(byId.get(2)!.style, "--cell-h"), "auto");
  assert.equal(cssVar(byId.get(2)!.style, "--m-cell-h"), "340px");
  assert.equal(cssVar(byId.get(3)!.style, "--cell-h"), "auto");
});

test("格点只输出 CSS 变量，不写 inline grid-column（P-036）", () => {
  const items: Item[] = [{ id: 1, label: "moments" }];
  const areas = build(items, () => ({
    row: 2,
    col: 7,
    colSpan: 6,
    mobileCol: 3,
    mobileColSpan: 8,
    mobileRow: 5,
  }));

  assert.equal(areas.length, 1);
  const area = areas[0];
  // 桌面左侧留白是第 1 条轨道，所以内容列 +1
  assert.equal(cssVar(area.style, "--cell-col"), 8);
  assert.equal(cssVar(area.style, "--cell-col-span"), 6);
  assert.equal(cssVar(area.style, "--cell-row"), 2);
  assert.equal("gridColumn" in area.style, false);

  const cell = area.cells[0];
  assert.equal(cssVar(cell.style, "--m-cell-col"), 3);
  assert.equal(cssVar(cell.style, "--m-cell-col-span"), 8);
  assert.equal(cssVar(cell.style, "--m-cell-row"), 5);
  assert.equal("gridColumn" in cell.style, false);
});

test("Banner 走出血，窄的堆叠格子跟随滚动", () => {
  const items: Item[] = [
    { id: 1, label: "banner" },
    { id: 2, label: "a" },
    { id: 3, label: "b" },
  ];

  const areas = build(items, (item) => ({
    row: item.id === 1 ? 1 : 3,
    col: item.id === 1 ? 1 : 10,
    colSpan: item.id === 1 ? 12 : 3,
    bleed: item.id === 1,
  }));

  const banner = areas.find((area) => area.row === 1)!;
  assert.match(banner.className, /is-bleed/);

  const stack = areas.find((area) => area.row === 3)!;
  assert.match(stack.className, /is-stack/);
  assert.match(stack.className, /is-sticky/);
  assert.deepEqual(
    stack.cells.map((cell) => cell.moduleId),
    [2, 3],
  );
});

test("宽格子的堆叠不跟随滚动（sticky 只给窄列）", () => {
  const items: Item[] = [
    { id: 1, label: "wide" },
    { id: 2, label: "wide-2" },
  ];

  const areas = build(items, () => ({ row: 2, col: 1, colSpan: 9 }));
  assert.equal(areas.length, 1);
  assert.match(areas[0].className, /is-stack/);
  assert.doesNotMatch(areas[0].className, /is-sticky/);
});

test("同行横向重叠的格子会被下移一行（与前台同一份 toAreas）", () => {
  const items: Item[] = [
    { id: 1, label: "left" },
    { id: 2, label: "right" },
    { id: 3, label: "overlap" },
  ];

  const areas = build(items, (item) => ({
    row: 3,
    col: item.id === 1 ? 1 : item.id === 2 ? 7 : 8,
    colSpan: item.id === 1 ? 6 : item.id === 2 ? 6 : 3,
  }));

  const third = areas.find((area) =>
    area.cells.some((cell) => cell.moduleId === 3),
  )!;
  assert.equal(third.row, 4);
  assert.equal(third.col, 8);
});

/**
 * 栏位（侧面 / 固定）：核心不是「能不能贴」，而是**下面还有同样列的时候不许贴** ——
 * 贴住的格子停在视口里，而下面同列的格子会一路滚上来压在它身上（P-168）。
 */
test("窄堆叠默认是侧面；下面还有同列格子时降级成固定并给出原因", () => {
  const items: Item[] = [
    { id: 1, label: "posts" },
    { id: 2, label: "categories" },
    { id: 3, label: "tags" },
    { id: 4, label: "announcement" },
  ];

  // 文章卡片(1-9) + 右侧窄堆叠(10-12)，下面（第 4 行）还有一个占 8-10 的公告 → 与堆叠的列相交
  const areas = build(items, (item) => ({
    row: item.id === 4 ? 4 : 3,
    col: item.id === 1 ? 1 : item.id === 4 ? 8 : 10,
    colSpan: item.id === 1 ? 9 : 3,
  }));

  const stack = areas.find((area) => area.col === 10)!;
  assert.equal(stack.side, false, "下面还有同列格子，不能贴");
  assert.equal(stack.sideBlockedBy, "4:8:3");
  assert.doesNotMatch(stack.className, /is-sticky/);
});

test("把同列后续格子并进同一格之后，这一列就能当侧面了", () => {
  const items: Item[] = [
    { id: 1, label: "posts" },
    { id: 2, label: "categories" },
    { id: 3, label: "site" },
  ];

  // 两格都在 10-12 列：10 行 3 与行 4（同一列，行 4 在下面）
  const blocked = build(items, (item) => ({
    row: item.id === 3 ? 4 : 3,
    col: item.id === 1 ? 1 : 10,
    colSpan: item.id === 1 ? 9 : 3,
    pin: item.id === 2 ? "side" : undefined,
  }));
  assert.equal(blocked.find((area) => area.col === 10)!.side, false);

  // 并进同一格（row/col/colSpan 一致）之后：它成了这一列里唯一的格子 → 侧面生效
  const merged = build(items, (item) => ({
    row: 3,
    col: item.id === 1 ? 1 : 10,
    colSpan: item.id === 1 ? 9 : 3,
    pin: item.id === 2 ? "side" : undefined,
  }));
  const stack = merged.find((area) => area.col === 10)!;
  assert.equal(stack.side, true);
  assert.match(stack.className, /is-sticky/);
  assert.match(stack.className, /is-stack/);
});

test("显式选「固定」时，再窄的堆叠也不贴", () => {
  const items: Item[] = [
    { id: 1, label: "a" },
    { id: 2, label: "b" },
  ];
  const areas = build(items, (item) => ({
    row: 3,
    col: 10,
    colSpan: 3,
    pin: item.id === 1 ? "flow" : undefined,
  }));
  assert.equal(areas[0].side, false);
  assert.doesNotMatch(areas[0].className, /is-sticky/);
});
