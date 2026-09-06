import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning, runBackup } from "@/lib/backup/backup";
import { readPendingRestore } from "@/lib/backup/restore";
import { queueAppRestart } from "@/lib/backup/restart";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { UpdateError } from "@/lib/update/errors";
import { updatePackageExists } from "@/lib/update/files";
import {
  cancelPendingUpdate,
  requestPendingUpdate,
  updatePendingUpdateRestart,
} from "@/lib/update/pending";
import {
  updateApplyPostSchema,
  updateApplyPutSchema,
} from "@/lib/update/validation";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }
    if (await readPendingRestore()) {
      throw new UpdateError(
        "RESTORE_PENDING",
        "已有预约恢复，请先取消恢复再预约更新",
        409,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    const parsed = updateApplyPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "请确认要应用的更新包", 400);
    }
    if (!(await updatePackageExists(parsed.data.name))) {
      throw new UpdateError("NOT_FOUND", "更新包不存在", 404);
    }

    const pending = await requestPendingUpdate(parsed.data.name);
    let safetyBackup = null;
    try {
      safetyBackup = await runBackup();
    } catch (error) {
      logger.warn("预约更新前的数据备份失败，仍保留预约", {
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
    return handleAdminError(error, "预约更新失败");
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
    const parsed = updateApplyPutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "请选择立刻重启或预约重启时间", 400);
    }
    const pending = await updatePendingUpdateRestart(parsed.data);
    const restarting = "restartNow" in parsed.data;
    if (restarting) {
      queueAppRestart();
    }
    return jsonData({
      pending: true,
      restarting,
      name: pending.name,
      requestedAt: pending.requestedAt,
      restartAt: pending.restartAt,
    });
  } catch (error) {
    return handleAdminError(error, "更新预约失败");
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await cancelPendingUpdate();
    return jsonData({ ok: true });
  } catch (error) {
    return handleAdminError(error, "取消预约更新失败");
  }
}
