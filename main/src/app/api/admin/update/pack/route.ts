import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning } from "@/lib/backup/backup";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { packCurrentApp } from "@/lib/update/pack";

export const runtime = "nodejs";
export const maxDuration = 120;

const globalForUpdate = globalThis as typeof globalThis & {
  myblogUpdatePacking?: boolean;
};

export async function POST() {
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }
    if (globalForUpdate.myblogUpdatePacking) {
      throw new AdminHttpError("UPDATE_BUSY", "已有打包任务在进行", 409);
    }
    globalForUpdate.myblogUpdatePacking = true;
    try {
      const packed = await packCurrentApp();
      return jsonData({
        name: packed.name,
        size: packed.size,
        fileCount: packed.fileCount,
        createdAt: packed.createdAt,
      });
    } finally {
      globalForUpdate.myblogUpdatePacking = false;
    }
  } catch (error) {
    return handleAdminError(error, "打包当前程序失败");
  }
}
