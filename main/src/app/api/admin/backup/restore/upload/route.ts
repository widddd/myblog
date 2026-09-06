import { createWriteStream } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { requireAdmin } from "@/lib/auth/guard";
import { deleteBackup, isBackupRunning, replicateBackupToCos } from "@/lib/backup/backup";
import { readBackupPackageDek } from "@/lib/backup/container";
import { getBackupFilePath, MAX_BACKUP_PACKAGE_BYTES } from "@/lib/backup/files";
import { stageImportedBackup } from "@/lib/backup/restore";
import { saveBackupKeyHash } from "@/lib/backup/secrets";
import {
  AdminHttpError,
  handleAdminError,
  jsonData,
} from "@/lib/admin/http";
import { BackupError } from "@/lib/backup/errors";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const tempPath = path.join(os.tmpdir(), `myblog-import-${randomUUID()}.tar.gz`);
  let importedName: string | undefined;
  try {
    await requireAdmin();
    if (isBackupRunning()) {
      throw new AdminHttpError("BACKUP_BUSY", "已有备份任务在进行", 409);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请上传备份包", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AdminHttpError("VALIDATION_ERROR", "请选择要上传的备份包", 400);
    }
    if (file.size <= 0 || file.size > MAX_BACKUP_PACKAGE_BYTES) {
      throw new BackupError(
        "VALIDATION_ERROR",
        `备份包不能超过 ${Math.floor(MAX_BACKUP_PACKAGE_BYTES / (1024 * 1024))} MB`,
        400,
      );
    }
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".tar.gz")) {
      throw new BackupError("VALIDATION_ERROR", "请上传 .tar.gz 备份包", 400);
    }

    await pipeline(
      Readable.fromWeb(file.stream() as never),
      createWriteStream(tempPath),
    );

    const imported = await stageImportedBackup(tempPath);
    importedName = imported.name;
    const storedPath = getBackupFilePath(imported.name);

    const peekDir = path.join(os.tmpdir(), `myblog-import-key-${randomUUID()}`);
    try {
      const resolved = await readBackupPackageDek(storedPath, peekDir);
      if (resolved) {
        await saveBackupKeyHash(imported.name, resolved.dek);
      }
    } finally {
      await rm(peekDir, { recursive: true, force: true }).catch(() => undefined);
    }

    const cosUploaded = await replicateBackupToCos(imported.name, storedPath);
    if (cosUploaded) {
      logger.info("已把上传的备份同步到 COS", { name: imported.name });
    }

    return jsonData({
      name: imported.name,
      format: imported.format,
      encrypted: imported.encrypted,
      releaseLabel: imported.releaseLabel,
      cosUploaded,
    });
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (importedName) {
      await deleteBackup(importedName).catch(() => undefined);
    }
    return handleAdminError(error, "上传备份包失败");
  }
}
