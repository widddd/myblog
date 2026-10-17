import assert from "node:assert/strict";
import test from "node:test";

import { BACKUP_LIMITS } from "@/lib/backup/schedule";
import {
  isWritableSettingKey,
  settingsPutSchema,
} from "@/lib/validation/settings";

/**
 * 「自动备份」从设置页搬到备份页时，最容易漏的就是**写入侧白名单**：表单能填、
 * 接口悄悄丢掉，用户看到「已保存」但值没落库（P-004 的经典形态）。
 * 这几条盯的就是那条链：白名单 → Zod → 归一化。
 */

test("backupAtTime 在白名单里（漏了就是「保存成功但没落库」）", () => {
  assert.equal(isWritableSettingKey("backupAtTime"), true);
  assert.equal(isWritableSettingKey("backupPeriodDays"), true);
  assert.equal(isWritableSettingKey("backupKeep"), true);
  assert.equal(isWritableSettingKey("backupLocalMaxMB"), true);
  // lastBackupAt 由备份流程自己写，永远不给接口改
  assert.equal(isWritableSettingKey("lastBackupAt"), false);
});

test("备份时刻：合规值通过并去空白，非法值给中文提示", () => {
  const parsed = settingsPutSchema.safeParse({ backupAtTime: " 03:30 " });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? parsed.data : null, { backupAtTime: "03:30" });

  for (const bad of ["", "25:00", "3:30", "03:60", "abc"]) {
    const result = settingsPutSchema.safeParse({ backupAtTime: bad });
    assert.equal(result.success, false, `${bad} 应被拒绝`);
    assert.equal(
      result.error?.issues[0]?.message,
      "备份时刻须为 HH:MM，例如 03:30",
      `${bad} 的提示必须是中文口径`,
    );
  }
});

test("备份周期与保留份数：区间与 lib/backup/schedule.ts 的 BACKUP_LIMITS 一致", () => {
  const { periodDays, keep, localMaxMB } = BACKUP_LIMITS;
  const body = {
    backupPeriodDays: periodDays.min,
    backupAtTime: "00:00",
    backupKeep: keep.min,
    backupLocalMaxMB: localMaxMB.min,
  };
  assert.equal(settingsPutSchema.safeParse(body).success, true, "下边界应通过");
  assert.equal(
    settingsPutSchema.safeParse({
      ...body,
      backupPeriodDays: periodDays.max,
      backupKeep: keep.max,
      backupLocalMaxMB: localMaxMB.max,
    }).success,
    true,
    "上边界应通过",
  );
  assert.equal(
    settingsPutSchema.safeParse({ ...body, backupPeriodDays: periodDays.min - 1 }).success,
    false,
  );
  assert.equal(
    settingsPutSchema.safeParse({ ...body, backupPeriodDays: periodDays.max + 1 }).success,
    false,
  );
  assert.equal(
    settingsPutSchema.safeParse({ ...body, backupKeep: keep.max + 1 }).success,
    false,
  );
  assert.equal(
    settingsPutSchema.safeParse({ ...body, backupLocalMaxMB: localMaxMB.min - 1 }).success,
    false,
  );
});

test("备份页只提交这四个键，其余键不许被顺手带进去", () => {
  const parsed = settingsPutSchema.safeParse({
    backupPeriodDays: 7,
    backupAtTime: "04:15",
    backupKeep: 3,
    backupLocalMaxMB: 1024,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success ? Object.keys(parsed.data).sort() : [], [
    "backupAtTime",
    "backupKeep",
    "backupLocalMaxMB",
    "backupPeriodDays",
  ]);
});
