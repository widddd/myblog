import { isBackupRunning, runBackup } from "@/lib/backup/backup";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import { getSetting } from "@/lib/settings";
import { logger } from "@/lib/utils/logger";

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Setting 的默认值（`lib/settings.ts` 的 `backupPeriodDays`）。 */
export const DEFAULT_BACKUP_PERIOD_DAYS = 3;

/** 周期天数：非法、缺失或小于 1 一律回落默认值。纯函数，便于单测。 */
export function resolvePeriodDays(raw: unknown): number {
  const days = Number(raw);
  return Number.isFinite(days) && days >= 1
    ? Math.floor(days)
    : DEFAULT_BACKUP_PERIOD_DAYS;
}

/**
 * 是否到期。纯函数。
 * `lastBackupAt` 为空、空串或解析不出日期都算「从没备份过」→ 到期。
 */
export function isBackupDue(
  lastBackupAt: string | null | undefined,
  periodDays: number,
  nowMs: number = Date.now(),
): boolean {
  const lastMs = lastBackupAt ? Date.parse(lastBackupAt) : Number.NaN;
  if (!Number.isFinite(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= periodDays * MS_PER_DAY;
}

/**
 * 周期备份 = 设置页「每隔几天自动备份」。调度器在启动时与每小时各调一次。
 *
 * ⚠️ **只对非加密备份生效**。加密备份要求管理员当场输入口令（口令不落盘，见
 * `api/admin/backup/passphrase` 的 410），定时任务拿不到口令——而 `runBackup()`
 * 在「已开启加密且无口令」时会直接抛错。所以开启加密时这里**明确跳过并记日志**，
 * 后台设置页与概览卡也把这一点写出来，不再静默什么都不做（见 P-123）。
 */
export async function checkBackupDue(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  if (isBackupRunning()) {
    logger.info("跳过周期备份：已有备份任务在进行");
    return;
  }

  const policy = await resolveBackupEncrypt();
  if (policy.enabled) {
    logger.info(
      "跳过周期备份：已开启加密，加密备份需要管理员在后台备份页输入口令",
    );
    return;
  }

  const periodDays = resolvePeriodDays(await getSetting<number>("backupPeriodDays"));
  const lastBackupAt = await getSetting<string | null>("lastBackupAt");
  if (!isBackupDue(lastBackupAt, periodDays)) {
    return;
  }

  logger.info("周期备份到期，开始执行", { periodDays, lastBackupAt });
  await runBackup();
}
