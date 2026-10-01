/**
 * 概览卡片显隐模型的守卫测试。
 *
 * 这个模块是「卡片 key / 默认值 / 面板文案」的单一事实源，被三处 import：
 * 概览页渲染、外观面板、Settings 校验。两个最容易悄悄坏掉的点：
 *   1. **「全部显示」≠「恢复默认」**：前者是「把叉掉的放出来」，后者是「回到出厂默认」。
 *      将来默认值改成"默认只开一部分"时，用 DEFAULT 顶替全开就会变成假按钮。
 *   2. **脏值不能让概览页白屏**：Setting 是 KV，写入端不可信。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countHiddenDashboardCards,
  DASHBOARD_CARD_KEYS,
  DEFAULT_DASHBOARD_CARDS,
  hasVisibleDashboardCard,
  isDashboardCardKey,
  resolveDashboardCards,
  showAllDashboardCards,
} from "./dashboard-cards";

test("showAllDashboardCards：每张都开，且每次都是新对象（不是 DEFAULT 的别名）", () => {
  const all = showAllDashboardCards();

  assert.deepEqual(
    DASHBOARD_CARD_KEYS.filter((key) => !all[key]),
    [],
  );
  assert.notEqual(all, DEFAULT_DASHBOARD_CARDS);

  // 别名的话，改返回值会污染默认值——这是最典型的坑
  all.kpiPosts = false;
  assert.equal(DEFAULT_DASHBOARD_CARDS.kpiPosts, true);
  assert.equal(showAllDashboardCards().kpiPosts, true);
});

test("countHiddenDashboardCards / hasVisibleDashboardCard 口径一致", () => {
  const all = showAllDashboardCards();
  assert.equal(countHiddenDashboardCards(all), 0);
  assert.equal(hasVisibleDashboardCard(all), true);

  // 只叉掉一张：还有可见卡片，但回头路要出现（countHidden > 0）
  assert.equal(countHiddenDashboardCards({ ...all, kpiViews: false }), 1);
  assert.equal(hasVisibleDashboardCard({ ...all, kpiViews: false }), true);

  const none = Object.fromEntries(
    DASHBOARD_CARD_KEYS.map((key) => [key, false]),
  ) as typeof all;
  assert.equal(countHiddenDashboardCards(none), DASHBOARD_CARD_KEYS.length);
  assert.equal(hasVisibleDashboardCard(none), false);
});

test("resolveDashboardCards：未知键丢弃、缺键补默认、非布尔按默认", () => {
  const parsed = resolveDashboardCards({
    kpiPosts: false,
    notACard: false,
    kpiComments: "yes",
  });

  assert.equal(parsed.kpiPosts, false, "写进去的布尔要生效");
  assert.deepEqual(
    Object.keys(parsed).sort(),
    [...DASHBOARD_CARD_KEYS].sort(),
    "未知键不能渗进来",
  );
  assert.equal(parsed.kpiComments, DEFAULT_DASHBOARD_CARDS.kpiComments, "非布尔回退默认");
  assert.equal(parsed.kpiViews, DEFAULT_DASHBOARD_CARDS.kpiViews, "缺键补默认");
});

test("resolveDashboardCards：脏值（null / 字符串 / 数组）不抛错，一律回退默认", () => {
  for (const dirty of [null, undefined, "nope", 42, []]) {
    assert.deepEqual(resolveDashboardCards(dirty), DEFAULT_DASHBOARD_CARDS);
  }
});

test("isDashboardCardKey 只认清单里的 key", () => {
  assert.equal(isDashboardCardKey("kpiPosts"), true);
  assert.equal(isDashboardCardKey("notACard"), false);
  assert.equal(isDashboardCardKey(1), false);
});
