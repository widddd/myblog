import { logger } from "@/lib/utils/logger";

const globalForScheduler = globalThis as typeof globalThis & {
  myblogSchedulerRegistered?: boolean;
  myblogPublishTimer?: ReturnType<typeof setInterval>;
  myblogBackupTimer?: ReturnType<typeof setInterval>;
};

const PUBLISH_INTERVAL_MS = 60_000;
const BACKUP_INTERVAL_MS = 60 * 60 * 1_000;

async function runSafe(name: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error(`定时任务失败：${name}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
    })();
  }, PUBLISH_INTERVAL_MS);

  void (async () => {
    const { checkBackupDue } = await import("@/lib/scheduler/backup");
    await runSafe("backup-boot", checkBackupDue);
  })();

  globalForScheduler.myblogBackupTimer = setInterval(() => {
    void (async () => {
      const { checkBackupDue } = await import("@/lib/scheduler/backup");
      await runSafe("backup", checkBackupDue);
    })();
  }, BACKUP_INTERVAL_MS);

  logger.info("定时任务调度器已注册");
}
