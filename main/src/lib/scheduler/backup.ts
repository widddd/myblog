import { logger } from "@/lib/utils/logger";

/** Backups are explicitly started by an administrator and never run on a timer. */
export async function checkBackupDue(): Promise<void> {
  logger.debug("跳过周期备份：备份改为管理员手动执行");
}
