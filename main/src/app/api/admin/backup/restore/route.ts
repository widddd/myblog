import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { requireAdmin } from "@/lib/auth/guard";
import { ensureLocalBackup, isBackupRunning, runBackup } from "@/lib/backup/backup";
import { readBackupPackageDek } from "@/lib/backup/container";
import { assertBackupKeyMatches } from "@/lib/backup/crypto";
import { queueRestoreRestart } from "@/lib/backup/restart";
import {
  cancelPendingRestore,
  requestPendingRestore,
  updatePendingRestart,
} from "@/lib/backup/restore";
import { getBackupKeyHash } from "@/lib/backup/secrets";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { BackupError } from "@/lib/backup/errors";
import { restorePostSchema, restorePutSchema } from "@/lib/validation/backup";
import { readPendingUpdate } from "@/lib/update/pending";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }
    if (await readPendingUpdate()) {
      throw new BackupError(
        "UPDATE_PENDING",
        "已有预约程序更新，请先取消更新再预约恢复",
        409,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }

    const parsed = restorePostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "请确认备份文件和恢复口令", 400);
    }

    const workDir = path.join(os.tmpdir(), `myblog-restore-key-${randomUUID()}`);
    try {
      const filePath = await ensureLocalBackup(parsed.data.name);
      const resolved = await readBackupPackageDek(filePath, workDir, {
        passphrase: parsed.data.passphrase,
      });
      if (resolved) {
        const storedHash = await getBackupKeyHash(parsed.data.name);
        if (!storedHash) {
          throw new BackupError(
            "KEY_MISMATCH",
            "后台没有这份备份的密钥记录，已拒绝恢复",
            403,
          );
        }
        assertBackupKeyMatches(resolved.dek, storedHash);
      }
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }

    const pending = await requestPendingRestore(
      parsed.data.name,
      undefined,
      parsed.data.passphrase,
    );
    let safetyBackup = null;
    try {
      safetyBackup = await runBackup(parsed.data.passphrase);
    } catch (error) {
      logger.warn("预约恢复前的安全备份失败，仍保留预约", {
        name: pending.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return jsonData({
      pending: true,
      restarting: false,
      name: pending.name,
      requestedAt: pending.requestedAt,
      restartAt: pending.restartAt,
      safetyBackup,
    });
  } catch (error) {
    return handleAdminError(error, "预约恢复失败");
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    const parsed = restorePutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "请选择立刻重启或预约重启时间", 400);
    }

    const pending = await updatePendingRestart(parsed.data);
    const restarting = "restartNow" in parsed.data;
    if (restarting) {
      queueRestoreRestart();
    }
    return jsonData({
      pending: true,
      restarting,
      name: pending.name,
      requestedAt: pending.requestedAt,
      restartAt: pending.restartAt,
    });
  } catch (error) {
    return handleAdminError(error, "更新预约恢复失败");
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await cancelPendingRestore();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "取消预约恢复失败");
  }
}
