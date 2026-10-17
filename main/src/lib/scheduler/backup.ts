import { isBackupRunning, runBackup } from "@/lib/backup/backup";
import { resolveBackupEncrypt } from "@/lib/backup/encrypt-policy";
import {
  isBackupDue,
  normalizeBackupAtTime,
  resolvePeriodDays,
} from "@/lib/backup/schedule";
import { getSetting } from "@/lib/settings";
import { logger } from "@/lib/utils/logger";

/**
 * 失败后的重试间隔。tick 是分钟级的，而「到点」这个条件会一直成立到备份成功为止——
 * 不设闸门的话，磁盘满 / 权限错这类持续失败会**每分钟**写一条错误日志。
 */
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1_000;

const globalForSchedulerBackup = globalThis as typeof globalThis & {
  /** 上次自动备份失败后的下次可重试时间（ms）。成功后清空。 */
  myblogBackupRetryAfterMs?: number;
  /** 已经就「加密时不能自动备份」提醒过的那个到期窗口（同一个窗口只提醒一次）。 */
  myblogBackupSkipNotifiedFor?: string;
};

/**
 * 周期备份 = 备份页「每隔几天自动备份 + 备份时刻」。调度器**每分钟**调一次，启动时也调一次
 * （关机期间错过的到期窗口，开机后立刻补跑）。
 *
 * 到期口径见 `lib/backup/schedule.ts`：锚点是「上次备份那天 + N 天的本地 HH:MM」；
 * `lastBackupAt` 为空（新站装好还没备过）算立刻到期。
 *
 * ⚠️ **只对非加密备份生效**。加密备份要求管理员当场输入口令（口令不落盘，见
 * `api/admin/backup/passphrase` 的 410），定时任务拿不到口令——而 `runBackup()`
 * 在「已开启加密且无口令」时会直接抛错。所以开启加密时这里**明确跳过**，并在
 * 备份页与概览卡把这一点写出来（见 P-123）。
 */
export async function checkBackupDue(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const periodDays = resolvePeriodDays(
    await getSetting<number>("backupPeriodDays"),
  );
  const atTime = normalizeBackupAtTime(await getSetting<string>("backupAtTime"));
  const lastBackupAt = await getSetting<string | null>("lastBackupAt");

  // 绝大多数 tick 在这里就结束——没到点不打日志、不碰加密策略。
  if (!isBackupDue(lastBackupAt, periodDays, atTime)) {
    return;
  }

  if (isBackupRunning()) {
    logger.debug("跳过周期备份：已有备份任务在进行");
    return;
  }

  const retryAfterMs = globalForSchedulerBackup.myblogBackupRetryAfterMs;
  if (retryAfterMs && Date.now() < retryAfterMs) {
    return;
  }

  const policy = await resolveBackupEncrypt();
  if (policy.enabled) {
    // 同一个到期窗口只提醒一次：tick 是分钟级的，否则日志会被这一条刷满。
    const dueKey = `${lastBackupAt ?? ""}|${periodDays}|${atTime}`;
    if (globalForSchedulerBackup.myblogBackupSkipNotifiedFor !== dueKey) {
      globalForSchedulerBackup.myblogBackupSkipNotifiedFor = dueKey;
      logger.warn(
        "跳过周期备份：已开启加密，加密备份需要管理员在后台备份页输入口令",
        { periodDays, atTime, lastBackupAt },
      );
    }
    return;
  }

  logger.info("周期备份到期，开始执行", { periodDays, atTime, lastBackupAt });
  try {
    await runBackup();
    globalForSchedulerBackup.myblogBackupRetryAfterMs = undefined;
    globalForSchedulerBackup.myblogBackupSkipNotifiedFor = undefined;
  } catch (error) {
    globalForSchedulerBackup.myblogBackupRetryAfterMs =
      Date.now() + RETRY_AFTER_FAILURE_MS;
    throw error;
  }
}
