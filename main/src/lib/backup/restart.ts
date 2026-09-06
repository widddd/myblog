import { after } from "next/server";

import { disconnectDatabase } from "@/lib/db";
import {
  isExternallySupervised,
  relaunchScriptPath,
  serializeRelaunchArgv,
  spawnDetachedProcess,
} from "@/lib/backup/relaunch";
import { logger } from "@/lib/utils/logger";

export const APP_RESTART_DELAY_MS = 800;

let restartScheduled = false;

export function queueAppRestart(): void {
  try {
    after(() => {
      scheduleAppRestart();
    });
  } catch (error) {
    logger.warn("无法挂到响应之后重启，改为延迟重启", {
      error: error instanceof Error ? error.message : String(error),
    });
    scheduleAppRestart();
  }
}

/** @deprecated use queueAppRestart — restore and update share the same restart */
export function queueRestoreRestart(): void {
  queueAppRestart();
}

export function scheduleAppRestart(
  delayMs = APP_RESTART_DELAY_MS,
): void {
  if (restartScheduled) {
    return;
  }
  restartScheduled = true;
  logger.info("即将重启进程", {
    supervised: isExternallySupervised(),
    pid: process.pid,
    delayMs,
  });
  setTimeout(() => {
    void beginRestart();
  }, delayMs);
}

async function beginRestart(): Promise<void> {
  try {
    await disconnectDatabase();
  } catch (error) {
    logger.warn("重启前断开数据库失败，仍将退出进程", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isExternallySupervised()) {
    spawnRelauncher();
  }
  process.exit(0);
}

function spawnRelauncher(): void {
  const script = relaunchScriptPath();
  spawnDetachedProcess(
    process.execPath,
    [script, String(process.pid), serializeRelaunchArgv(process.argv)],
  );
  logger.info("已拉起进程监护，父进程退出后会再拉起应用", { script });
}
