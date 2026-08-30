import { isBackupRunning, runBackup } from "@/lib/backup/backup";
import { getSetting } from "@/lib/settings";
import { logger } from "@/lib/utils/logger";

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export async function checkBackupDue(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  if (isBackupRunning()) {
    logger.info("跳过周期备份：已有任务在进行");
    return;
  }

  const periodDays = Number(await getSetting<number>("backupPeriodDays")) || 3;
  const lastBackupAt = await getSetting<string | null>("lastBackupAt");
  const lastMs = lastBackupAt ? Date.parse(lastBackupAt) : Number.NaN;
  const due =
    !Number.isFinite(lastMs) || Date.now() - lastMs >= periodDays * MS_PER_DAY;

  if (!due) {
    return;
  }

  await runBackup();
}
