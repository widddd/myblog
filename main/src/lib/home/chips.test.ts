import assert from "node:assert/strict";
import test from "node:test";

import {
  CHIP_MAX,
  chipRailList,
  chipRailMetrics,
  chipRailStyle,
  DEFAULT_CHIP_VISIBLE,
  normalizeChipLabels,
  normalizeChipVisible,
  shuffleChips,
} from "./chips";

test("泡泡文字：trim、截断到 8 字、去空、最多 24 条", () => {
  assert.deepEqual(normalizeChipLabels([" NX ", "TS", "  "]), ["NX", "TS"]);
  assert.deepEqual(normalizeChipLabels(["12345678901"]), ["12345678"]);
  assert.deepEqual(normalizeChipLabels(undefined), []);
  assert.deepEqual(normalizeChipLabels("NX"), []);
  const many = Array.from({ length: 40 }, (_, index) => `c${index}`);
  assert.equal(normalizeChipLabels(many).length, CHIP_MAX);
  assert.equal(CHIP_MAX, 24);
});

test("一屏几颗：脏值回默认、超区间夹回", () => {
  assert.equal(normalizeChipVisible(undefined), DEFAULT_CHIP_VISIBLE);
  assert.equal(normalizeChipVisible("12"), 12);
  assert.equal(normalizeChipVisible(0), 3);
  assert.equal(normalizeChipVisible(999), 16);
  assert.equal(normalizeChipVisible(Number.NaN), DEFAULT_CHIP_VISIBLE);
  assert.equal(normalizeChipVisible(6.4), 6);
});

test("打散：同一个集合、顺序会被打乱（用可复现的伪随机源）", () => {
  const labels = ["a", "b", "c", "d", "e", "f"];
  // 固定随机源：线性同余，序列可复现 —— 不能拿常量做随机源（常量会让交换退化成恒等）
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const shuffled = shuffleChips(labels, random);
  assert.deepEqual([...shuffled].sort(), [...labels].sort(), "只换顺序，不多不少");
  assert.notDeepEqual(shuffled, labels, "顺序确实变了");
  // 同一个随机源 → 同一个结果（组件里用的是 Math.random，这里只为可复现）
  const again = shuffleChips(labels, (() => {
    let next = 42;
    return () => {
      next = (next * 1664525 + 1013904223) % 4294967296;
      return next / 4294967296;
    };
  })());
  assert.deepEqual(again, shuffled);
  // 原数组不被就地改动（组件里是 props）
  assert.deepEqual(labels, ["a", "b", "c", "d", "e", "f"]);
});

test("滚动列表：整份复制两份（上移 50% 才能接回开头）", () => {
  assert.deepEqual(chipRailList(["a", "b"]), ["a", "b", "a", "b"]);
  assert.equal(chipRailList([]).length, 0);
  const list = Array.from({ length: CHIP_MAX }, (_, index) => `c${index}`);
  assert.equal(chipRailList(list).length, CHIP_MAX * 2);
});

test("密度：高度 / 一屏几颗，密到看不清时有下限兜底", () => {
  const sparse = chipRailMetrics({ railHeight: 380, visible: 4 });
  assert.ok(sparse);
  // 380 * 0.72 / 4 ≈ 68
  assert.equal(sparse?.chipHeight, 68);
  assert.ok(sparse && sparse.gap >= 4);
  assert.ok(sparse && sparse.offset >= 18);

  const dense = chipRailMetrics({ railHeight: 380, visible: 16 });
  assert.ok(dense);
  assert.ok(dense.chipHeight < (sparse?.chipHeight ?? 0), "一屏越多颗，单颗越小");
  assert.equal(dense.chipHeight, Math.max(24, Math.round((380 * 0.72) / 16)));

  // 极密：不低于下限
  const tiny = chipRailMetrics({ railHeight: 120, visible: 16, minChipHeight: 30 });
  assert.equal(tiny?.chipHeight, 30);
});

test("密度：量不到高度时返回 null，交给 CSS 默认值", () => {
  assert.equal(chipRailMetrics({ railHeight: 0, visible: 6 }), null);
  assert.deepEqual(chipRailStyle(null), {});
});

test("密度 → CSS 变量", () => {
  const style = chipRailStyle({
    chipHeight: 62,
    gap: 9,
    offset: 31,
    durationSeconds: 31,
  });
  assert.deepEqual(style, {
    "--chip-h": "62px",
    "--chip-gap": "9px",
    "--chip-offset": "31px",
    "--chip-duration": "31s",
  });
});

test("滚动时长夹在 18–90s：太快像抖、太慢像停", () => {
  const many = Array.from({ length: 24 }, (_, index) => `c${index}`);
  const fast = chipRailMetrics({ railHeight: 200, visible: 16 });
  const slow = chipRailMetrics({ railHeight: 700, visible: 3 });
  assert.ok(fast && fast.durationSeconds >= 18);
  assert.ok(slow && slow.durationSeconds <= 90);
  assert.equal(many.length, CHIP_MAX);
});
