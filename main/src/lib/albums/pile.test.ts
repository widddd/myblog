import assert from "node:assert/strict";
import test from "node:test";

import {
  PILE_HOLD_MS,
  PILE_SPREAD_MS,
  PILE_STAGGER_MS,
  PILE_STACK_FRAME,
  pileLayer,
  pileSpread,
  pileStackWidth,
  pileStep,
} from "./pile";

/**
 * 相册封面「一叠照片」的几何：相册列表卡与首页「相册卡片」模块共用它。
 *
 * 不变量（改 pile.ts 前先看那儿的说明）：
 * 1. **首帧是叠放态**：每一张的 left 都是 0、不倾斜、延迟只影响"什么时候开始抽"；
 * 2. 第 0 张**全程不动**：`from` 与 `to` 的 left / rotate 都是 0 / 0，延迟 0；
 * 3. **整叠必须比画框窄**（`n ≥ 2` 时）：第 0 张铺满画框就会把后面几张全盖住，
 *    抽出成了看不见的动作（2026-10-05 逐帧实测）；铺开后最后一张的右缘正好落在 100%；
 * 4. 后面几张按 `index` **顺序**右移 `step`、按 `shrink^i` 收窄，z-index 逐层降低（第一张在最上面）。
 */

test("整叠比画框窄：第 0 张不铺满（否则抽出看不见），铺开后右缘正好落到 100%", () => {
  for (const visible of [1, 2, 3, 4, 6]) {
    for (const shrink of [1, 0.86]) {
      const stack = pileStackWidth(visible, shrink);
      if (visible < 2) {
        assert.equal(stack, 100, "只有一张：它就是画框本身（没有抽出这回事）");
      } else {
        assert.ok(stack < 100, `${visible} 张时整叠是 ${stack}%，铺满就不可能看见抽出`);
      }
      const last = pileLayer(visible - 1, visible, shrink, PILE_STAGGER_MS);
      assert.ok(
        Math.abs(last.left + last.width - 100) < 1e-9,
        `${visible} 张 / shrink=${shrink}：最后一张右缘在 ${last.left + last.width}%，应正好 100%`,
      );
    }
  }
});

test("首帧是叠放态：每一张同一个左缘、不倾斜", () => {
  for (const visible of [1, 2, 4]) {
    const flow = pileSpread(visible, 0.86, PILE_STAGGER_MS);
    assert.equal(flow.length, visible);
    for (const step of flow) {
      assert.equal(step.from.left, 0);
      assert.equal(step.from.rotate, 0);
      assert.equal(step.from, PILE_STACK_FRAME, "首帧只有一份事实（同一个常量对象）");
    }
  }
});

test("第一张全程不移动：left / rotate 都是 0，也不延迟（from 与 to 逐项相同）", () => {
  for (const visible of [2, 3, 4, 6]) {
    for (const shrink of [1, 0.86]) {
      const [first] = pileSpread(visible, shrink, PILE_STAGGER_MS);
      assert.equal(first.to.left, 0);
      assert.equal(first.to.rotate, 0);
      assert.equal(first.to.delayMs, 0);
      assert.equal(first.from.left, first.to.left);
      assert.equal(first.from.rotate, first.to.rotate);
      assert.equal(first.zIndex, visible, "第一张在最上面（z-index 最大）");
    }
  }
});

test("后面几张按 index 顺序右移 step（同一左缘起步、逐张到位）", () => {
  for (const visible of [2, 4, 6]) {
    const step = pileStep(visible);
    const flow = pileSpread(visible, 1, PILE_STAGGER_MS);
    for (const entry of flow) {
      assert.ok(
        Math.abs(entry.to.left - entry.index * step) < 1e-9,
        `${visible} 张时第 ${entry.index} 张 left 是 ${entry.to.left}`,
      );
      assert.equal(entry.from.left, 0, "都是从同一个左缘出发的");
      if (entry.index > 0) {
        assert.ok(
          entry.to.left > flow[entry.index - 1].to.left,
          "位置必须逐张递增（顺序不能乱）",
        );
        assert.equal(entry.zIndex, visible - entry.index, "层次逐层降低");
      }
    }
  }
});

test("shrink = 1（列表卡）：各张等宽，正好排满画框", () => {
  for (const visible of [2, 3, 4, 5]) {
    const flow = pileSpread(visible, 1, PILE_STAGGER_MS);
    const stack = pileStackWidth(visible, 1);
    for (const entry of flow) {
      assert.ok(Math.abs(entry.to.width - stack) < 1e-9);
    }
  }
});

test("shrink < 1（首页小卡片）：宽度按等比递减，且都不超过整叠", () => {
  const visible = 4;
  const flow = pileSpread(visible, 0.86, PILE_STAGGER_MS);
  const stack = pileStackWidth(visible, 0.86);
  const widths = flow.map((entry) => entry.to.width);
  assert.ok(Math.abs(widths[0] - stack) < 1e-9, "第 0 张就是整叠那一张");
  assert.ok(Math.abs(widths[1] - stack * 0.86) < 1e-9);
  assert.ok(Math.abs(widths[2] - stack * 0.86 ** 2) < 1e-9);
  for (let index = 1; index < widths.length; index += 1) {
    assert.ok(widths[index] < widths[index - 1], "必须逐张变窄");
    assert.ok(widths[index] <= stack, "后面的张不能比整叠还宽");
  }
  // 窄卡片也要留住一张大封面：0.86 的等比收窄让整叠比"等宽铺开"时更宽
  assert.ok(stack > pileStackWidth(visible, 1), "收窄的那几张把省下的宽度还给了整叠");
});

test("倾斜正负交替，越靠后越明显（第一张永远不歪）", () => {
  const first = pileLayer(0, 4, 1, PILE_STAGGER_MS).rotate;
  const one = pileLayer(1, 4, 1, PILE_STAGGER_MS).rotate;
  const two = pileLayer(2, 4, 1, PILE_STAGGER_MS).rotate;
  assert.equal(first, 0);
  assert.ok(one < 0 && two > 0, "相邻两张往相反方向倒");
  assert.ok(Math.abs(two) > Math.abs(one));
});

test("节奏：停 1s 才开始抽、错峰逐张递增、单张 420ms 走完", () => {
  assert.equal(PILE_HOLD_MS, 1000);
  assert.equal(PILE_STAGGER_MS, 70);
  assert.equal(PILE_SPREAD_MS, 420);
  const flow = pileSpread(4, 1, PILE_STAGGER_MS);
  assert.equal(flow[0].to.delayMs, 0);
  assert.equal(flow[3].to.delayMs, 3 * PILE_STAGGER_MS);
  for (let index = 1; index < flow.length; index += 1) {
    assert.ok(flow[index].to.delayMs > flow[index - 1].to.delayMs);
  }
});

test("退化输入不产生 NaN 也不出负数宽度（1 张 / 0 张 / 越界 / 小数 / NaN）", () => {
  for (const visible of [1, 0, -2, 2.4, Number.NaN, 999]) {
    for (const shrink of [1, 0.86, 0, -1, Number.NaN]) {
      const flow = pileSpread(visible, shrink, PILE_STAGGER_MS);
      assert.ok(flow.length >= 1, `visible=${visible} 至少要有一层`);
      for (const entry of flow) {
        assert.ok(
          Number.isFinite(entry.to.left) && Number.isFinite(entry.to.width),
          `visible=${visible} shrink=${shrink} 算出了 NaN`,
        );
        assert.ok(entry.to.width > 0, `visible=${visible} shrink=${shrink} 宽度是 ${entry.to.width}`);
        assert.ok(Number.isFinite(entry.to.rotate) && Number.isFinite(entry.to.delayMs));
      }
    }
  }
  // 越界的 index 会被收进最后一层，不会用负数宽度让图层静默消失
  const beyond = pileLayer(9, 3, 1, PILE_STAGGER_MS);
  assert.ok(beyond.width > 0);
  assert.equal(beyond.left, pileLayer(2, 3, 1, PILE_STAGGER_MS).left);
});
