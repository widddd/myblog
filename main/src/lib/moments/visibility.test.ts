import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMomentVisibilityFilter,
  describeMomentVisibility,
  formatMomentExpiry,
  momentVisibilityCutoff,
  momentVisibilityDaysLabel,
  momentVisibilityPhrase,
  normalizeVisibilityDays,
  resolveMomentVisibility,
  resolveMomentVisibilityDays,
} from "./visibility";

const DAY = 86_400_000;
const NOW = new Date("2026-09-27T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

test("normalizeVisibilityDays：非法值回退 0，负数归零，上限截断", () => {
  assert.equal(normalizeVisibilityDays(undefined), 0);
  assert.equal(normalizeVisibilityDays(null), 0);
  assert.equal(normalizeVisibilityDays("7"), 0);
  assert.equal(normalizeVisibilityDays(Number.NaN), 0);
  assert.equal(normalizeVisibilityDays(-5), 0);
  assert.equal(normalizeVisibilityDays(0), 0);
  assert.equal(normalizeVisibilityDays(7.4), 7);
  assert.equal(normalizeVisibilityDays(99999), 3650);
});

test("resolveMomentVisibilityDays：分组只能在全局天花板内收紧", () => {
  // 全局不限制 → 看组
  assert.equal(resolveMomentVisibilityDays({ globalDays: 0, groupDays: 7 }), 7);
  // 全局限制、没组 → 看全局
  assert.equal(resolveMomentVisibilityDays({ globalDays: 30, groupDays: null }), 30);
  // 组比全局短 → 取组
  assert.equal(resolveMomentVisibilityDays({ globalDays: 30, groupDays: 3 }), 3);
  // 组比全局长 → 仍取全局（关键：组不能放宽全局）
  assert.equal(resolveMomentVisibilityDays({ globalDays: 7, groupDays: 365 }), 7);
  // 两侧都不限制
  assert.equal(resolveMomentVisibilityDays({ globalDays: 0, groupDays: 0 }), 0);
  // 脏数据
  assert.equal(resolveMomentVisibilityDays({ globalDays: 30, groupDays: -1 }), 30);
});

test("resolveMomentVisibility：limitedBy 说清是谁在起作用", () => {
  assert.equal(
    resolveMomentVisibility({ globalDays: 0, groupId: null }).limitedBy,
    "none",
  );
  assert.equal(
    resolveMomentVisibility({ globalDays: 30, groupId: null }).limitedBy,
    "global",
  );
  assert.equal(
    resolveMomentVisibility({ globalDays: 30, groupId: 1, groupDays: 3 }).limitedBy,
    "group",
  );
  // 组更长时被全局收紧：仍然要如实说"全局在起作用"
  assert.equal(
    resolveMomentVisibility({ globalDays: 7, groupId: 1, groupDays: 365 }).limitedBy,
    "global",
  );
  assert.equal(
    resolveMomentVisibility({ globalDays: 0, groupId: 1, groupDays: 3 }).limitedBy,
    "group",
  );
});

test("momentVisibilityCutoff：永久公开没有截止时刻", () => {
  assert.equal(momentVisibilityCutoff(new Date("2026-01-01T00:00:00Z"), 0), null);
  assert.equal(
    momentVisibilityCutoff(new Date("2026-01-01T00:00:00Z"), 1)?.toISOString(),
    "2026-01-02T00:00:00.000Z",
  );
});

test("describeMomentVisibility：到期时刻挂在发布时间上，过期判定可复现", () => {
  const globalOnly = describeMomentVisibility(
    { createdAt: daysAgo(5), globalDays: 7, groupId: null },
    NOW,
  );
  assert.equal(globalOnly.expired, false);
  assert.equal(globalOnly.expiresAt?.getTime(), daysAgo(5).getTime() + 7 * DAY);

  const expiredByGroup = describeMomentVisibility(
    { createdAt: daysAgo(5), globalDays: 0, groupId: 1, groupName: "三天可见组", groupDays: 3 },
    NOW,
  );
  assert.equal(expiredByGroup.expired, true);
  assert.equal(expiredByGroup.groupName, "三天可见组");
  assert.equal(expiredByGroup.effectiveDays, 3);

  const expiredByGlobal = describeMomentVisibility(
    { createdAt: daysAgo(40), globalDays: 30, groupId: 1, groupName: "一年可见组", groupDays: 365 },
    NOW,
  );
  assert.equal(expiredByGlobal.expired, true);
  assert.equal(expiredByGlobal.effectiveDays, 30);
  assert.equal(expiredByGlobal.limitedBy, "global");

  const forever = describeMomentVisibility(
    { createdAt: daysAgo(9999), globalDays: 0, groupId: null },
    NOW,
  );
  assert.equal(forever.expired, false);
  assert.equal(forever.expiresAt, null);

  // 边界：刚好到期当天算过期（createdAt + 天 <= now）
  const exactlyNow = describeMomentVisibility(
    { createdAt: daysAgo(7), globalDays: 7, groupId: null },
    NOW,
  );
  assert.equal(exactlyNow.expired, true);
});

test("文案：天数说人话，短语说清是谁收紧的", () => {
  assert.equal(momentVisibilityDaysLabel(0), "永久公开");
  assert.equal(momentVisibilityDaysLabel(1), "1 天");
  assert.equal(momentVisibilityDaysLabel(30), "1 个月");
  assert.equal(momentVisibilityDaysLabel(90), "3 个月");
  assert.equal(momentVisibilityDaysLabel(365), "1 年");
  assert.equal(momentVisibilityDaysLabel(45), "45 天");

  const groupWins = describeMomentVisibility(
    { createdAt: daysAgo(1), globalDays: 30, groupId: 1, groupName: "三天可见组", groupDays: 3 },
    NOW,
  );
  assert.equal(momentVisibilityPhrase(groupWins), "3 天（三天可见组）");

  const globalWins = describeMomentVisibility(
    { createdAt: daysAgo(1), globalDays: 7, groupId: 1, groupName: "一年可见组", groupDays: 365 },
    NOW,
  );
  assert.equal(momentVisibilityPhrase(globalWins), "7 天（全局收紧，组为 1 年）");

  assert.equal(
    momentVisibilityPhrase(
      describeMomentVisibility({ createdAt: daysAgo(1), globalDays: 0, groupId: null }, NOW),
    ),
    "永久公开",
  );
});

test("formatMomentExpiry：给绝对时间，不退回相对时间", () => {
  const text = formatMomentExpiry(new Date(2026, 8, 30, 12, 5));
  assert.match(text, /^2026-09-30 12:05/);
});

test("buildMomentVisibilityFilter：没有组时只剩全局条件", () => {
  const filter = buildMomentVisibilityFilter({ globalDays: 7, groups: [], now: NOW });
  assert.deepEqual(filter, {
    OR: [{ createdAt: { gte: new Date(NOW.getTime() - 7 * DAY) } }],
  });

  // 全局不限制 + 没有组 = 不设条件（返回 undefined，等于旧行为全表可见）
  const unfiltered = buildMomentVisibilityFilter({ globalDays: 0, groups: [], now: NOW });
  assert.equal(unfiltered, undefined);
});

test("buildMomentVisibilityFilter：分组各自用自己的天数，未分组只吃全局", () => {
  const filter = buildMomentVisibilityFilter({
    globalDays: 30,
    groups: [
      { id: 1, days: 3 },
      { id: 2, days: 0 },
    ],
    now: NOW,
  });

  // 只有两支以上的 OR：未分组（吃全局）+ 每个有效组一支，绝不能有 notIn 兜底支
  assert.equal(filter?.OR.length, 3);
  assert.deepEqual(filter?.OR[0], {
    visibilityGroupId: null,
    createdAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
  });
  // 3 天组比全局短 → 按 3 天算
  assert.deepEqual(filter?.OR[1], {
    visibilityGroupId: 1,
    createdAt: { gte: new Date(NOW.getTime() - 3 * DAY) },
  });
  // 组不限制 → 仍然只受全局 30 天约束（全局是天花板）
  assert.deepEqual(filter?.OR[2], {
    visibilityGroupId: 2,
    createdAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
  });
});

test("buildMomentVisibilityFilter：组比全局长时必须乘上全局上限", () => {
  // 全局 7 天 + 一年组 → 生效 7 天，不能按 365 天放行
  const shortGlobal = buildMomentVisibilityFilter({
    globalDays: 7,
    groups: [{ id: 3, days: 365 }],
    now: NOW,
  });
  assert.deepEqual(shortGlobal?.OR[1], {
    visibilityGroupId: 3,
    createdAt: { gte: new Date(NOW.getTime() - 7 * DAY) },
  });

  // 全局不限制 + 一年组 → 按 365 天
  const longGlobal = buildMomentVisibilityFilter({
    globalDays: 0,
    groups: [{ id: 3, days: 365 }],
    now: NOW,
  });
  assert.deepEqual(longGlobal?.OR[1], {
    visibilityGroupId: 3,
    createdAt: { gte: new Date(NOW.getTime() - 365 * DAY) },
  });

  // 组比全局短 → 取组的 3 天
  const shortGroup = buildMomentVisibilityFilter({
    globalDays: 365,
    groups: [{ id: 4, days: 3 }],
    now: NOW,
  });
  assert.deepEqual(shortGroup?.OR[1], {
    visibilityGroupId: 4,
    createdAt: { gte: new Date(NOW.getTime() - 3 * DAY) },
  });
});

test("buildMomentVisibilityFilter：绝不输出 notIn（Prisma OR 组合会算错）", () => {
  const filter = buildMomentVisibilityFilter({
    globalDays: 7,
    groups: [
      { id: 5, days: 3 },
      { id: 9, days: 365 },
    ],
    now: NOW,
  });
  assert.equal(JSON.stringify(filter).includes("notIn"), false);
});

test("buildMomentVisibilityFilter：脏组被丢掉，不会把瞬间误判成不可见", () => {
  const filter = buildMomentVisibilityFilter({
    globalDays: 0,
    groups: [
      { id: 0, days: 3 },
      { id: -2, days: 3 },
    ],
    now: NOW,
  });
  // 没有有效组 + 全局不限制 → 不设条件（全可见）
  assert.equal(filter, undefined);
});
