import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { requireAdmin } from "@/lib/auth/guard";
import { isBackupRunning } from "@/lib/backup/backup";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { MAX_UPDATE_PACKAGE_BYTES } from "@/lib/update/files";
import { stageImportedUpdate } from "@/lib/update/import";
import { UpdateError } from "@/lib/update/errors";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const tempPath = path.join(os.tmpdir(), `myblog-update-import-${randomUUID()}.tar.gz`);
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请上传更新包", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AdminHttpError("VALIDATION_ERROR", "请选择要导入的更新包", 400);
    }
    if (file.size <= 0 || file.size > MAX_UPDATE_PACKAGE_BYTES) {
      throw new UpdateError(
        "VALIDATION_ERROR",
        `更新包不能超过 ${Math.floor(MAX_UPDATE_PACKAGE_BYTES / (1024 * 1024))} MB`,
        400,
      );
    }
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".tar.gz")) {
      throw new UpdateError("VALIDATION_ERROR", "请上传 .tar.gz 更新包", 400);
    }

    await pipeline(
      Readable.fromWeb(file.stream() as never),
      createWriteStream(tempPath),
    );

    const imported = await stageImportedUpdate(tempPath);
    return jsonData(imported);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    return handleAdminError(error, "导入更新包失败");
  }
}
