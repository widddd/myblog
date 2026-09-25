import { destroySession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning } from "@/lib/backup/backup";
import {
  DataClearError,
  cancelPendingDataClear,
  createPendingDataClear,
  executePendingDataClear,
  DATA_CLEAR_WAIT_MS,
} from "@/lib/admin/data-clear";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import {
  dataClearCancelSchema,
  dataClearExecuteSchema,
  dataClearPostSchema,
} from "@/lib/validation/data-clear";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    if (isBackupRunning()) {
      throw new DataClearError("BACKUP_BUSY", "已有备份任务在进行，请稍后重试", 409);
    }
    const parsed = dataClearPostSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "请完整确认清理范围",
        400,
      );
    }

    const serverNow = Date.now();
    const operation = createPendingDataClear(
      session.adminId,
      parsed.data.targets,
      serverNow,
    );
    return jsonData({
      operationId: operation.operationId,
      executeAt: new Date(operation.executeAt).toISOString(),
      serverNow: new Date(serverNow).toISOString(),
      waitMs: DATA_CLEAR_WAIT_MS,
      targets: operation.targets,
    });
  } catch (error) {
    return handleAdminError(error, "创建数据清理确认失败");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdmin();
    if (isBackupRunning()) {
      throw new DataClearError("BACKUP_BUSY", "已有备份任务在进行，请稍后重试", 409);
    }
    const parsed = dataClearExecuteSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "清理令牌不合法", 400);
    }

    const result = await executePendingDataClear(
      parsed.data.operationId,
      session.adminId,
    );
    if (result.requiresSetup) {
      try {
        await destroySession();
      } catch (error) {
        logger.error("清理管理员后销毁会话失败", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return jsonData({ completed: true, ...result });
  } catch (error) {
    return handleAdminError(error, "执行数据清理失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdmin();
    const parsed = dataClearCancelSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AdminHttpError("VALIDATION_ERROR", "清理令牌不合法", 400);
    }
    cancelPendingDataClear(parsed.data.operationId, session.adminId);
    return jsonData({ cancelled: true });
  } catch (error) {
    return handleAdminError(error, "取消数据清理失败");
  }
}
