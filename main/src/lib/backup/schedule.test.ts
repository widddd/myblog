import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_LIMITS,
  DEFAULT_BACKUP_AT_TIME,
  DEFAULT_BACKUP_PERIOD_DAYS,
  isBackupAtTime,
  isBackupDue,
  nextBackupDueMs,
  normalizeBackupAtTime,
  parseBackupAtTime,
  resolvePeriodDays,
  validateBackupSchedule,
} from "./schedule";

/** 本地时间的某一刻 → ISO 串（当 `lastBackupAt` 用）。全程用本地构造，换时区也不假失败。 */
const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();

const ms = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

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

test("备份时刻：归一成 HH:MM，脏值回落默认", () => {
  assert.deepEqual(parseBackupAtTime("03:05"), { hour: 3, minute: 5 });
  assert.equal(normalizeBackupAtTime("3:05"), "03:05", "不补零的写法也认");
  assert.equal(normalizeBackupAtTime("23:59"), "23:59");
  assert.equal(normalizeBackupAtTime(" 04:30 "), "04:30", "两边空白容忍");
  for (const bad of ["", "24:00", "03:60", "3", "abc", null, undefined, 300, {}, true]) {
    assert.equal(
      normalizeBackupAtTime(bad),
      DEFAULT_BACKUP_AT_TIME,
      `${String(bad)} 应回落 ${DEFAULT_BACKUP_AT_TIME}`,
    );
  }
});

test("从没备份过 → 到期（装好就该备一次）", () => {
  for (const empty of [null, undefined, "", "not-a-date"]) {
    assert.equal(isBackupDue(empty, 3, "03:00", ms(2026, 10, 1, 12)), true);
    assert.equal(nextBackupDueMs(empty, 3, "03:00"), null, "没有上次备份就没有「下次」");
  }
});

test("到点才算到期：时刻参与判定，不是「满 N 天」", () => {
  const last = at(2026, 10, 1, 10, 0);
  // 上次 10-01 10:00、周期 3 天、时刻 03:00 → 目标 10-04 03:00
  assert.equal(nextBackupDueMs(last, 3, "03:00"), ms(2026, 10, 4, 3));
  assert.equal(isBackupDue(last, 3, "03:00", ms(2026, 10, 3, 23, 59)), false);
  assert.equal(isBackupDue(last, 3, "03:00", ms(2026, 10, 4, 2, 59)), false, "差一分钟不算");
  assert.equal(isBackupDue(last, 3, "03:00", ms(2026, 10, 4, 3, 0)), true, "正好到点算");
  assert.equal(isBackupDue(last, 3, "03:00", ms(2026, 10, 4, 9, 30)), true, "错过的补跑");
});

test("时刻改到更早/更晚，下次时间跟着变", () => {
  const last = at(2026, 10, 1, 10, 0);
  assert.equal(nextBackupDueMs(last, 3, "09:30"), ms(2026, 10, 4, 9, 30));
  assert.equal(nextBackupDueMs(last, 3, "23:45"), ms(2026, 10, 4, 23, 45));
  assert.equal(
    isBackupDue(last, 3, "23:45", ms(2026, 10, 4, 9, 30)),
    false,
    "同一天更晚的时刻还没到",
  );
});

test("时刻比上次备份时刻早时，落在「N 天后的那个时刻」", () => {
  // 上次 10-08 23:00、周期 1 天、时刻 03:00 → 下次 10-09 03:00（而不是 10-09 23:00）
  const last = at(2026, 10, 8, 23, 0);
  assert.equal(nextBackupDueMs(last, 1, "03:00"), ms(2026, 10, 9, 3));
  assert.equal(isBackupDue(last, 1, "03:00", ms(2026, 10, 9, 2, 30)), false);
  assert.equal(isBackupDue(last, 1, "03:00", ms(2026, 10, 9, 3, 0)), true);
});

test("跨月、跨年由本地日历算，不做 86400 秒硬加", () => {
  assert.equal(
    nextBackupDueMs(at(2026, 1, 30, 22, 0), 3, "03:00"),
    ms(2026, 2, 2, 3),
    "1-30 + 3 天 = 2-2",
  );
  assert.equal(
    nextBackupDueMs(at(2026, 12, 30, 20, 0), 3, "03:00"),
    ms(2027, 1, 2, 3),
    "跨年同样按日历走",
  );
});

test("周期不同，判定跟着变", () => {
  const last = at(2026, 10, 1, 0, 30);
  assert.equal(isBackupDue(last, 1, "03:00", ms(2026, 10, 2, 3, 0)), true);
  assert.equal(isBackupDue(last, 30, "03:00", ms(2026, 10, 2, 3, 0)), false);
  // 周期脏值回落 3 天：10-01 00:30 → 10-04 03:00
  assert.equal(isBackupDue(last, 0, "03:00", ms(2026, 10, 4, 2, 0)), false);
  assert.equal(isBackupDue(last, 0, "03:00", ms(2026, 10, 4, 3, 0)), true);
});

test("时刻是脏值时按默认 03:00 判到期", () => {
  const last = at(2026, 10, 1, 10, 0);
  for (const bad of ["", "99:99", null, undefined]) {
    assert.equal(isBackupDue(last, 3, bad, ms(2026, 10, 4, 3, 0)), true);
    assert.equal(isBackupDue(last, 3, bad, ms(2026, 10, 4, 2, 0)), false);
  }
});

test("严格时刻格式：补零 HH:MM 才算合法", () => {
  for (const good of ["00:00", "03:05", "12:00", "23:59"]) {
    assert.equal(isBackupAtTime(good), true, `${good} 应合法`);
  }
  for (const bad of ["3:05", "24:00", "03:60", "", " 03:05x", "0305", null, undefined, 305]) {
    assert.equal(isBackupAtTime(bad), false, `${String(bad)} 应不合法`);
  }
});

test("提交前校验：范围与格式拦在本地，提示是中文", () => {
  const good = {
    backupPeriodDays: 3,
    backupAtTime: "03:00",
    backupKeep: 5,
    backupLocalMaxMB: 512,
  };
  assert.equal(validateBackupSchedule(good), null);
  // 数字字符串也认（表单 value 取值常见形态）
  assert.equal(
    validateBackupSchedule({ ...good, backupPeriodDays: "7", backupKeep: "2" }),
    null,
  );
  assert.equal(
    validateBackupSchedule({ ...good, backupPeriodDays: 0 }),
    `备份周期须为 ${BACKUP_LIMITS.periodDays.min}–${BACKUP_LIMITS.periodDays.max} 的整数天`,
  );
  assert.equal(
    validateBackupSchedule({ ...good, backupPeriodDays: BACKUP_LIMITS.periodDays.max + 1 }),
    `备份周期须为 ${BACKUP_LIMITS.periodDays.min}–${BACKUP_LIMITS.periodDays.max} 的整数天`,
  );
  assert.equal(validateBackupSchedule({ ...good, backupPeriodDays: 2.5 })?.includes("整数"), true);
  // 清空输入框 → Number("") = 0，必须被拦（否则会走接口拿英文 Zod 报错）
  assert.equal(validateBackupSchedule({ ...good, backupPeriodDays: "" }) !== null, true);
  assert.equal(
    validateBackupSchedule({ ...good, backupAtTime: "" }),
    "备份时刻须为 HH:MM，例如 03:30",
  );
  assert.equal(
    validateBackupSchedule({ ...good, backupAtTime: "24:00" }),
    "备份时刻须为 HH:MM，例如 03:30",
  );
  assert.equal(validateBackupSchedule({ ...good, backupKeep: 0 })?.includes("保留份数"), true);
  assert.equal(
    validateBackupSchedule({ ...good, backupLocalMaxMB: 63 })?.includes("本地备份上限"),
    true,
  );
  // 边界值本身要放过
  assert.equal(
    validateBackupSchedule({
      backupPeriodDays: BACKUP_LIMITS.periodDays.min,
      backupAtTime: "00:00",
      backupKeep: BACKUP_LIMITS.keep.max,
      backupLocalMaxMB: BACKUP_LIMITS.localMaxMB.max,
    }),
    null,
  );
});
