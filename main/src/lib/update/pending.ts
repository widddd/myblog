import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import { resolveDatabasePath } from "@/lib/db-path";
import { UpdateError } from "@/lib/update/errors";
import { isManagedUpdateFileName } from "@/lib/update/filename";
import { updatePackageExists } from "@/lib/update/files";
import { logger } from "@/lib/utils/logger";

export type PendingUpdate = {
  name: string;
  requestedAt: string;
  restartAt: string | null;
};

export type UpdateApplyState = {
  status: "ok" | "failed" | "skipped";
  name?: string;
  appliedAt?: string;
  error?: string;
  copied?: number;
  removed?: number;
  installed?: boolean;
  migrated?: boolean;
  built?: boolean;
};

function pendingUpdatePath(databasePath = resolveDatabasePath()): string {
  return path.join(path.dirname(databasePath), "update-pending.json");
}

function updateStatePath(databasePath = resolveDatabasePath()): string {
  return path.join(path.dirname(databasePath), "update-state.json");
}

function parseRestartAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  if (Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

export async function readPendingUpdate(
  databasePath = resolveDatabasePath(),
): Promise<PendingUpdate | null> {
  const filePath = pendingUpdatePath(databasePath);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PendingUpdate>;
    if (!parsed.name || !isManagedUpdateFileName(parsed.name) || !parsed.requestedAt) {
      throw new UpdateError("INVALID_PENDING", "预约更新文件损坏，已忽略", 400);
    }
    return {
      name: parsed.name,
      requestedAt: parsed.requestedAt,
      restartAt: parseRestartAt(parsed.restartAt),
    };
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return null;
    }
    if (error instanceof UpdateError) {
      await unlink(filePath).catch(() => undefined);
      logger.warn(error.message);
      return null;
    }
    if (error instanceof SyntaxError) {
      await unlink(filePath).catch(() => undefined);
      logger.warn("预约更新文件不是合法 JSON，已删除");
      return null;
    }
    throw error;
  }
}

async function writePendingUpdate(
  pending: PendingUpdate,
  databasePath = resolveDatabasePath(),
): Promise<void> {
  const filePath = pendingUpdatePath(databasePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
}

export async function requestPendingUpdate(
  name: string,
  databasePath = resolveDatabasePath(),
): Promise<PendingUpdate> {
  if (!isManagedUpdateFileName(name)) {
    throw new UpdateError("VALIDATION_ERROR", "更新包文件名不合法", 400);
  }
  if (!(await updatePackageExists(name))) {
    throw new UpdateError("NOT_FOUND", "更新包不存在", 404);
  }
  const pending: PendingUpdate = {
    name,
    requestedAt: new Date().toISOString(),
    restartAt: null,
  };
  await writePendingUpdate(pending, databasePath);
  logger.info("已预约程序更新，站点可继续使用", { name });
  return pending;
}

export function isPendingUpdateDue(
  pending: PendingUpdate | null,
  now = Date.now(),
): boolean {
  if (!pending?.restartAt) {
    return false;
  }
  const at = Date.parse(pending.restartAt);
  return !Number.isNaN(at) && at <= now;
}

export async function updatePendingUpdateRestart(
  input: { restartNow: true } | { restartAt: string },
  databasePath = resolveDatabasePath(),
): Promise<PendingUpdate> {
  const current = await readPendingUpdate(databasePath);
  if (!current) {
    throw new UpdateError("NOT_FOUND", "当前没有预约更新", 404);
  }
  const restartAt =
    "restartNow" in input ? new Date().toISOString() : input.restartAt;
  if (!parseRestartAt(restartAt)) {
    throw new UpdateError("VALIDATION_ERROR", "重启时间不合法", 400);
  }
  if (!("restartNow" in input) && Date.parse(restartAt) <= Date.now()) {
    throw new UpdateError("VALIDATION_ERROR", "预约重启时间必须晚于现在", 400);
  }
  const pending: PendingUpdate = { ...current, restartAt };
  await writePendingUpdate(pending, databasePath);
  logger.info(
    "restartNow" in input ? "已选择立刻重启并更新" : "已设定预约更新重启时间",
    { name: pending.name, restartAt },
  );
  return pending;
}

export async function cancelPendingUpdate(
  databasePath = resolveDatabasePath(),
): Promise<void> {
  const filePath = pendingUpdatePath(databasePath);
  await unlink(filePath).catch((error) => {
    if (!isNodeNotFoundError(error)) {
      throw error;
    }
  });
}

export async function readUpdateState(
  databasePath = resolveDatabasePath(),
): Promise<UpdateApplyState | null> {
  try {
    const raw = await readFile(updateStatePath(databasePath), "utf8");
    return JSON.parse(raw) as UpdateApplyState;
  } catch (error) {
    if (isNodeNotFoundError(error)) {
      return null;
    }
    return null;
  }
}

export async function writeUpdateState(
  state: UpdateApplyState,
  databasePath = resolveDatabasePath(),
): Promise<void> {
  const filePath = updateStatePath(databasePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
