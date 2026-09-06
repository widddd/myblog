import { requireAdmin } from "@/lib/auth/guard";
import { pullBackupFromCos } from "@/lib/backup/backup";
import { isManagedBackupFileName } from "@/lib/backup/filename";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }
    const name =
      body && typeof body === "object" && "name" in body
        ? String((body as { name: unknown }).name)
        : "";
    if (!isManagedBackupFileName(name)) {
      throw new AdminHttpError("VALIDATION_ERROR", "备份文件名不合法", 400);
    }
    return jsonData(await pullBackupFromCos(name));
  } catch (error) {
    return handleAdminError(error, "从 COS 拉回备份失败");
  }
}
