import { isBackupRunning } from "@/lib/backup/backup";
import { logger } from "@/lib/utils/logger";

const globalForScheduler = globalThis as typeof globalThis & {
  myblogSchedulerRegistered?: boolean;
  myblogPublishTimer?: ReturnType<typeof setInterval>;
};

/**
 * 每分钟一趟：定时发文、补传备份到 COS、清理过期明文包、到点重启、周期备份（备份时刻精确到分钟）。
 */
const PUBLISH_INTERVAL_MS = 60_000;

async function runSafe(name: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error(`定时任务失败：${name}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runBackupUploadRetry(): Promise<void> {
  // 正在打包时别抢带宽与 COS 连接：那份新包出队后自己会传
  if (isBackupRunning()) {
    return;
  }
  const { retryPendingBackupUploads } = await import("@/lib/backup/uploads");
  await retryPendingBackupUploads();
}

export function registerScheduler(): void {
  if (globalForScheduler.myblogSchedulerRegistered) {
    return;
  }

  globalForScheduler.myblogSchedulerRegistered = true;

  void (async () => {
    const { scanScheduledPosts } = await import("@/lib/scheduler/publish");
    await runSafe("publish-boot", scanScheduledPosts);
  })();

  globalForScheduler.myblogPublishTimer = setInterval(() => {
    void (async () => {
      const { scanScheduledPosts } = await import("@/lib/scheduler/publish");
      await runSafe("publish", scanScheduledPosts);
      // 备份上云是后台上传：进程被打断（重启 / 崩）后靠状态文件在这里接着传
      await runSafe("backup-upload-retry", runBackupUploadRetry);
      const { purgeExpiredPlainBackups } = await import("@/lib/backup/plain");
      await runSafe("plain-backup-purge", purgeExpiredPlainBackups);
      await runSafe("restore-due", checkDueRestoreRestart);
      await runSafe("update-due", checkDueUpdateRestart);
      // 周期备份也走这一趟：备份时刻要精确到分钟，不能靠小时级定时器（见 lib/backup/schedule.ts）
      const { checkBackupDue } = await import("@/lib/scheduler/backup");
      await runSafe("backup", checkBackupDue);
    })();
  }, PUBLISH_INTERVAL_MS);

  // 启动就查一次：关机期间错过的到期窗口，开机后立刻补跑；首次安装没备份过也算到期
  void (async () => {
    const { checkBackupDue } = await import("@/lib/scheduler/backup");
    await runSafe("backup-boot", checkBackupDue);
  })();

  // 启动也补一次上传：上次进程退出时可能正有一份包没传完（不用等满一分钟）
  void (async () => {
    await runSafe("backup-upload-boot", runBackupUploadRetry);
  })();

  logger.info("定时任务调度器已注册");
}

async function checkDueUpdateRestart(): Promise<void> {
  const {
    abandonPendingUpdateRestart,
    decidePendingUpdateRestart,
    notePendingUpdateRestart,
    readPendingUpdate,
  } = await import("@/lib/update/pending");
  const pending = await readPendingUpdate();
  const decision = decidePendingUpdateRestart(pending);
  if (decision === "idle" || !pending) {
    return;
  }
  if (decision === "abandon") {
    // 排了 N 次重启还是没人应用 → 停手、写失败原因、取消预约。**不许再排第 N+1 次**：
    // 生产上就是这么每分钟重启一次，把备份/导入/迁移这类长请求全腰斩的（P-133 家族）。
    await abandonPendingUpdateRestart(pending);
    return;
  }
  const attempts = await notePendingUpdateRestart(pending);
  logger.info("预约更新到点，准备重启进程", {
    name: pending.name,
    attempts,
  });
  const { scheduleAppRestart } = await import("@/lib/backup/restart");
  scheduleAppRestart();
}

async function checkDueRestoreRestart(): Promise<void> {
  const { decidePendingRestoreRestart, notePendingRestoreRestart, cancelPendingRestore, readPendingRestore } =
    await import("@/lib/backup/restore");
  const pending = await readPendingRestore();
  const decision = decidePendingRestoreRestart(pending);
  if (decision === "idle" || !pending) {
    return;
  }
  if (decision === "abandon") {
    // 恢复是在启动时应用的（instrumentation），连试 N 次都失败说明这份包/口令有问题，
    // 再重启也只是每分钟把站点打断一次。取消预约，让用户修好再重新预约。
    await cancelPendingRestore();
    logger.error("预约恢复多次重启仍未成功，已取消预约", {
      name: pending.name,
      attempts: pending.restartAttempts ?? 0,
    });
    return;
  }
  const attempts = await notePendingRestoreRestart(pending);
  logger.info("预约恢复到点，准备重启进程", { name: pending.name, attempts });
  const { scheduleAppRestart } = await import("@/lib/backup/restart");
  scheduleAppRestart();
}
