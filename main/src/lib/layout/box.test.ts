import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeBox,
  normalizeBox,
  pickBox,
  type DualLayoutBox,
} from "./box";

test("格点越界收进 12 列，hPct 收进 0–100", () => {
  assert.deepEqual(normalizeBox({ col: 11, colSpan: 6, row: 2, hPct: 37 }), {
    col: 7,
    colSpan: 6,
    row: 2,
    hPct: 37,
  });
  assert.deepEqual(normalizeBox({ col: 0, colSpan: 99, row: -3, hPct: 800 }), {
    col: 1,
    colSpan: 12,
    row: 1,
    hPct: 100,
  });
});

test("hPct 缺省为 0（hug）", () => {
  assert.equal(normalizeBox({ col: 1, colSpan: 6, row: 2 }).hPct, 0);
});

test("pick/merge 按视口读写互不覆盖", () => {
  const dual: DualLayoutBox = {
    col: 1,
    colSpan: 6,
    row: 2,
    hPct: 37,
    mobileCol: 1,
    mobileColSpan: 12,
    mobileRow: 3,
    mobileHPct: 36,
  };
  assert.deepEqual(pickBox(dual, "desktop"), {
    col: 1,
    colSpan: 6,
    row: 2,
    hPct: 37,
  });
  assert.deepEqual(pickBox(dual, "mobile"), {
    col: 1,
    colSpan: 12,
    row: 3,
    hPct: 36,
  });
  assert.deepEqual(mergeBox("mobile", { col: 1, colSpan: 8, row: 4, hPct: 20 }), {
    mobileCol: 1,
    mobileColSpan: 8,
    mobileRow: 4,
    mobileHPct: 20,
  });
});
