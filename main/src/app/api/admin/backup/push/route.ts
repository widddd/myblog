import { requireAdmin } from "@/lib/auth/guard";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { BackupError } from "@/lib/backup/errors";
import { backupPackageExists, getBackupFilePath } from "@/lib/backup/files";
import { queueBackupCosUpload } from "@/lib/backup/uploads";
import { loadCosSettings } from "@/lib/storage";
import { backupPushPostSchema } from "@/lib/validation/backup";

export const runtime = "nodejs";

/**
 * 把一份**本地已有**的备份补传到 COS。
 *
 * 备份页平时不需要它：手动/周期备份完成后会自动排进后台上传队列。这个入口是给
 * 「上传失败」或「上次进程被打断没传完」的包留的手动重试口——否则那份包只能靠
 * 删掉重备一次才能上云。
 *
 * 只排队，不等上传（几十秒的活不该挂在请求上）；进度看 `/api/admin/backup/list`
 * 的 `cosUpload`，或备份页的「位置」列。
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体不是合法 JSON", 400);
    }
    const parsed = backupPushPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "备份文件名不合法",
        400,
      );
    }
    const { name } = parsed.data;
    if (!(await backupPackageExists(name))) {
      throw new BackupError("NOT_FOUND", "本地没有这份备份", 404);
    }
    // 这是**显式要求上云**的动作：没配 COS 就该 503 说清楚（P-145）
    if (!(await loadCosSettings())) {
      throw new BackupError("COS_NOT_CONFIGURED", "腾讯云 COS 尚未配置", 503);
    }
    const cosUpload = await queueBackupCosUpload(name, getBackupFilePath(name));
    return jsonData({ name, cosUpload });
  } catch (error) {
    return handleAdminError(error, "排队上传备份失败");
  }
}
