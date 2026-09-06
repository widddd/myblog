import { UpdateError } from "@/lib/update/errors";
import { inspectUpdatePackage } from "@/lib/update/inspect";
import { writeUpdateSidecar } from "@/lib/update/sidecar";
import { readPendingRestore } from "@/lib/backup/restore";
import {
  copyUpdateFile,
  ensureUpdateDir,
  MAX_UPDATE_PACKAGE_BYTES,
  moveUpdateFile,
  updatePackageExists,
} from "@/lib/update/files";
import {
  requestPendingUpdate,
  updatePendingUpdateRestart,
} from "@/lib/update/pending";
import { importUpdateFileName } from "@/lib/update/filename";
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";

export async function stageImportedUpdate(
  sourcePath: string,
  options: { keepSource?: boolean } = {},
) {
  const inspected = await inspectUpdatePackage(sourcePath);
  const metadata = await stat(sourcePath);
  if (metadata.size > MAX_UPDATE_PACKAGE_BYTES) {
    throw new UpdateError(
      "VALIDATION_ERROR",
      `更新包不能超过 ${Math.floor(MAX_UPDATE_PACKAGE_BYTES / (1024 * 1024))} MB`,
      400,
    );
  }
  await ensureUpdateDir();
  let name = importUpdateFileName(randomBytes(4).toString("hex"));
  while (await updatePackageExists(name)) {
    name = importUpdateFileName(randomBytes(4).toString("hex"));
  }
  if (options.keepSource) {
    await copyUpdateFile(sourcePath, name);
  } else {
    await moveUpdateFile(sourcePath, name);
  }
  const view = {
    ...inspected.manifest,
    fileCount: inspected.files.length,
  };
  await writeUpdateSidecar(name, view);
  return {
    name,
    ...view,
    size: metadata.size,
  };
}

/** 入库并预约立刻重启。站点仍在跑时不要在本进程覆盖 src/，交给 pm2 restart / boot.cjs。 */
export async function stageAndQueueUpdate(sourcePath: string) {
  if (await readPendingRestore()) {
    throw new UpdateError(
      "RESTORE_PENDING",
      "已有预约恢复，请先取消恢复再预约更新",
      409,
    );
  }
  const staged = await stageImportedUpdate(sourcePath, { keepSource: true });
  await requestPendingUpdate(staged.name);
  await updatePendingUpdateRestart({ restartNow: true });
  return staged;
}
