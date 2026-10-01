import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BACKUP_PERIOD_DAYS,
  isBackupDue,
  resolvePeriodDays,
} from "./backup";

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.parse("2026-10-01T12:00:00.000Z");

test("周期天数：合规值取整，非法值回落默认", () => {
  assert.equal(resolvePeriodDays(3), 3);
  assert.equal(resolvePeriodDays(7), 7);
  assert.equal(resolvePeriodDays("5"), 5);
  assert.equal(resolvePeriodDays(2.7), 2, "小数向下取整");
  // 0 / 负数 / NaN / 空 / 非数字 都不能变成「每天都备份」这种疯狂行为
  for (const bad of [0, -1, Number.NaN, "", null, undefined, "abc", Infinity]) {
    assert.equal(
      resolvePeriodDays(bad),
      DEFAULT_BACKUP_PERIOD_DAYS,
      `${String(bad)} 应回落 ${DEFAULT_BACKUP_PERIOD_DAYS}`,
    );
  }
});

test("从没备份过 → 到期（装好就该备一次）", () => {
  for (const empty of [null, undefined, "", "not-a-date"]) {
    assert.equal(isBackupDue(empty, 3, NOW), true, `${String(empty)} 应算到期`);
  }
});

test("到没到期按天数算，边界取等号", () => {
  const at = (days: number) => new Date(NOW - days * DAY).toISOString();
  assert.equal(isBackupDue(at(4), 3, NOW), true, "4 天前 + 3 天周期 → 到期");
  assert.equal(isBackupDue(at(3), 3, NOW), true, "正好 3 天 → 到期");
  assert.equal(isBackupDue(at(1), 3, NOW), false, "1 天前 → 还没到");
  assert.equal(isBackupDue(at(0), 7, NOW), false, "刚备过 → 还没到");
});

test("周期不同，判定跟着变", () => {
  const at = (days: number) => new Date(NOW - days * DAY).toISOString();
  assert.equal(isBackupDue(at(2), 1, NOW), true);
  assert.equal(isBackupDue(at(2), 30, NOW), false);
});
