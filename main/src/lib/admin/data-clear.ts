import { randomBytes } from "node:crypto";

import { clearBackupManifests } from "@/lib/backup/manifests";
import { clearPlainBackups } from "@/lib/backup/plain";
import { deleteBackupFile, listBackups } from "@/lib/backup/files";
import { clearRestoreArtifacts } from "@/lib/backup/restore";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { prisma } from "@/lib/db";
import { clearUpdatePackages } from "@/lib/update/files";
import { cancelPendingUpdate, clearUpdateState } from "@/lib/update/pending";
import { clearUpdateSidecars } from "@/lib/update/sidecar";
import { DataClearError } from "@/lib/admin/errors";
import {
  getDriver,
  loadCosSettings,
  normalizeStorageKey,
  type StorageDriver,
} from "@/lib/storage";
import { keysForDelete } from "@/lib/uploads/locations";
import {
  DATA_CLEAR_TARGETS,
  DATA_CLEAR_WAIT_MS,
  normalizeDataClearTargets,
  type DataClearTarget,
} from "@/lib/data-clear/contract";
import { logger } from "@/lib/utils/logger";

const OPERATION_TTL_MS = 10 * 60 * 1000;
const DELETE_BATCH_SIZE = 16;

export type PendingDataClear = {
  operationId: string;
  adminId: number;
  targets: DataClearTarget[];
  issuedAt: number;
  executeAt: number;
  expiresAt: number;
};

export type DataClearResult = {
  targets: DataClearTarget[];
  requiresSetup: boolean;
  storage: {
    local: number;
    cos: number;
  };
  backups: number;
  updates: number;
  deleted: {
    posts: number;
    categories: number;
    tags: number;
    postTags: number;
    moments: number;
    momentLikes: number;
    comments: number;
    uploads: number;
    backupSecrets: number;
    admins: number;
  };
};

type DataClearState = {
  pending: Map<string, PendingDataClear>;
  running: boolean;
};

const globalForDataClear = globalThis as typeof globalThis & {
  myblogDataClearState?: DataClearState;
};

function getState(): DataClearState {
  const existing = globalForDataClear.myblogDataClearState;
  if (existing) {
    return existing;
  }
  const created: DataClearState = {
    pending: new Map(),
    running: false,
  };
  globalForDataClear.myblogDataClearState = created;
  return created;
}

function pruneExpired(now = Date.now()): void {
  const state = getState();
  for (const [operationId, operation] of state.pending) {
    if (operation.expiresAt <= now) {
      state.pending.delete(operationId);
    }
  }
}

function assertTargets(targets: readonly DataClearTarget[]): DataClearTarget[] {
  const normalized = normalizeDataClearTargets(targets);
  if (
    normalized.length < 1 ||
    normalized.length !== targets.length ||
    new Set(targets).size !== targets.length
  ) {
    throw new DataClearError("VALIDATION_ERROR", "清理范围不合法", 400);
  }
  return normalized;
}

export function createPendingDataClear(
  adminId: number,
  targets: readonly DataClearTarget[],
  now = Date.now(),
): PendingDataClear {
  if (!Number.isInteger(adminId) || adminId < 1) {
    throw new DataClearError("UNAUTHORIZED", "当前管理员无效", 401);
  }
  const normalized = assertTargets(targets);
  const state = getState();
  pruneExpired(now);
  if (state.running) {
    throw new DataClearError("CLEAR_BUSY", "已有数据清理任务在执行", 409);
  }

  for (const [operationId, operation] of state.pending) {
    if (operation.adminId === adminId) {
      state.pending.delete(operationId);
    }
  }

  const issuedAt = now;
  const operation: PendingDataClear = {
    operationId: randomBytes(32).toString("hex"),
    adminId,
    targets: [...normalized],
    issuedAt,
    executeAt: issuedAt + DATA_CLEAR_WAIT_MS,
    expiresAt: issuedAt + OPERATION_TTL_MS,
  };
  state.pending.set(operation.operationId, operation);
  logger.warn("已创建数据清理待确认操作", {
    adminId,
    targets: normalized.join(","),
    executeAt: new Date(operation.executeAt).toISOString(),
  });
  return operation;
}

function getOwnedOperation(
  operationId: string,
  adminId: number,
  now = Date.now(),
): PendingDataClear {
  pruneExpired(now);
  const operation = getState().pending.get(operationId);
  if (!operation) {
    throw new DataClearError("CLEAR_NOT_FOUND", "清理确认已失效，请重新开始", 404);
  }
  if (operation.adminId !== adminId) {
    throw new DataClearError("FORBIDDEN", "不能操作其他管理员的清理确认", 403);
  }
  return operation;
}

export function cancelPendingDataClear(
  operationId: string,
  adminId: number,
  now = Date.now(),
): void {
  const operation = getOwnedOperation(operationId, adminId, now);
  getState().pending.delete(operation.operationId);
  logger.info("已取消数据清理待确认操作", { adminId });
}

function consumePendingDataClear(
  operationId: string,
  adminId: number,
  now = Date.now(),
): PendingDataClear {
  const operation = getOwnedOperation(operationId, adminId, now);
  if (now < operation.executeAt) {
    const seconds = Math.ceil((operation.executeAt - now) / 1000);
    throw new DataClearError(
      "WAIT_REQUIRED",
      `请至少等待 ${seconds} 秒后再执行清理`,
      409,
    );
  }
  getState().pending.delete(operation.operationId);
  return operation;
}

function safeStorageKey(value: string): string | null {
  try {
    return normalizeStorageKey(value);
  } catch {
    return null;
  }
}

async function deleteStorageKeys(
  driver: StorageDriver,
  keys: readonly string[],
): Promise<number> {
  let deleted = 0;
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    const batch = keys.slice(index, index + DELETE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (key) => {
        await driver.delete(key);
        deleted += 1;
      }),
    );
  }
  return deleted;
}

async function clearStorage(): Promise<{
  local: number;
  cos: number;
}> {
  const rows = await prisma.upload.findMany({
    select: { hash: true, key: true, mime: true, variants: true, driver: true },
  });
  const knownKeys = new Set<string>();
  for (const row of rows) {
    for (const key of keysForDelete(row)) {
      const normalized = safeStorageKey(key);
      if (normalized) {
        knownKeys.add(normalized);
      }
    }
  }

  try {
    const cosConfig = await loadCosSettings();
    if (
      !cosConfig &&
      rows.some((row) => {
        const driver = row.driver.trim().toLowerCase();
        return driver === "cos" || driver === "oss";
      })
    ) {
      throw new DataClearError(
        "COS_NOT_CONFIGURED",
        "媒体记录包含 COS 文件，但当前没有完整的 COS 配置；请补全配置后重试",
        503,
      );
    }

    const local = getDriver("local");
    const localKeys = new Set(
      (await local.listKeys()).map(safeStorageKey).filter(
        (key): key is string => Boolean(key),
      ),
    );
    for (const key of knownKeys) {
      localKeys.add(key);
    }
    const localDeleted = await deleteStorageKeys(local, [...localKeys]);

    if (!cosConfig) {
      return { local: localDeleted, cos: 0 };
    }

    const cos = getDriver("cos");
    const cosKeys = new Set(
      (await cos.listKeys()).map(safeStorageKey).filter(
        (key): key is string => Boolean(key),
      ),
    );
    for (const key of knownKeys) {
      cosKeys.add(key);
    }
    const cosDeleted = await deleteStorageKeys(cos, [...cosKeys]);
    return { local: localDeleted, cos: cosDeleted };
  } catch (error) {
    if (error instanceof DataClearError) {
      throw error;
    }
    logger.error("清理媒体或 COS 对象失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DataClearError(
      "STORAGE_CLEAR_FAILED",
      "媒体或云端文件清理失败，数据库尚未清空，请检查存储配置后重试",
      503,
    );
  }
}

async function clearFileArtifacts(): Promise<{
  backups: number;
  updates: number;
}> {
  try {
    await clearRestoreArtifacts();
    await cancelPendingUpdate();

    const backupFiles = await listBackups();
    for (const file of backupFiles) {
      await deleteBackupFile(file.name);
    }
    const ephemeral = await clearPlainBackups();
    await clearBackupManifests();

    const updatePackages = await clearUpdatePackages();
    const updateSidecars = await clearUpdateSidecars();
    await clearUpdateState();

    return {
      backups: backupFiles.length + ephemeral.length,
      updates: updatePackages.length + updateSidecars.length,
    };
  } catch (error) {
    logger.error("清理备份或更新暂存失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DataClearError(
      "FILE_CLEAR_FAILED",
      "备份或更新暂存清理失败，数据库尚未清空，请重试",
      500,
    );
  }
}

async function clearDatabase(
  deleteData: boolean,
  deleteAdmin: boolean,
): Promise<DataClearResult["deleted"]> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (!deleteData) {
        const admins = deleteAdmin ? await tx.adminUser.deleteMany() : { count: 0 };
        return {
          posts: 0,
          categories: 0,
          tags: 0,
          postTags: 0,
          moments: 0,
          momentLikes: 0,
          comments: 0,
          uploads: 0,
          backupSecrets: 0,
          admins: admins.count,
        };
      }

      const postTags = await tx.postTag.deleteMany();
      const momentLikes = await tx.momentLike.deleteMany();
      const commentReplies = await tx.comment.deleteMany({
        where: { parentId: { not: null } },
      });
      const topLevelComments = await tx.comment.deleteMany();
      const posts = await tx.post.deleteMany();
      const moments = await tx.moment.deleteMany();
      const categories = await tx.category.deleteMany();
      const tags = await tx.tag.deleteMany();
      const uploads = await tx.upload.deleteMany();
      const backupSecrets = await tx.backupSecret.deleteMany();
      const admins = deleteAdmin ? await tx.adminUser.deleteMany() : { count: 0 };

      return {
        posts: posts.count,
        categories: categories.count,
        tags: tags.count,
        postTags: postTags.count,
        moments: moments.count,
        momentLikes: momentLikes.count,
        comments: commentReplies.count + topLevelComments.count,
        uploads: uploads.count,
        backupSecrets: backupSecrets.count,
        admins: admins.count,
      };
    });
  } catch (error) {
    logger.error("清理数据库内容失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DataClearError(
      "DATABASE_CLEAR_FAILED",
      "数据库清理失败，部分文件可能已清理，请重新确认后重试",
      500,
    );
  }
}

async function executeClear(targets: readonly DataClearTarget[]): Promise<DataClearResult> {
  const deleteData = targets.includes("data");
  const deleteAdmin = targets.includes("admin");

  const storage = deleteData ? await clearStorage() : { local: 0, cos: 0 };
  const files = deleteData ? await clearFileArtifacts() : { backups: 0, updates: 0 };
  const deleted = await clearDatabase(deleteData, deleteAdmin);

  if (deleteData) {
    try {
      revalidatePublicContent();
    } catch (error) {
      logger.warn("清理后刷新公开缓存失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.warn("数据清理已完成", {
    targets: targets.join(","),
    posts: deleted.posts,
    moments: deleted.moments,
    comments: deleted.comments,
    localObjects: storage.local,
    cosObjects: storage.cos,
    admins: deleted.admins,
  });

  return {
    targets: [...targets],
    requiresSetup: deleteAdmin,
    storage,
    backups: files.backups,
    updates: files.updates,
    deleted,
  };
}

export async function executePendingDataClear(
  operationId: string,
  adminId: number,
  now = Date.now(),
): Promise<DataClearResult> {
  const operation = consumePendingDataClear(operationId, adminId, now);
  const state = getState();
  if (state.running) {
    throw new DataClearError("CLEAR_BUSY", "已有数据清理任务在执行", 409);
  }
  state.running = true;
  try {
    return await executeClear(operation.targets);
  } finally {
    state.running = false;
  }
}

export function isDataClearRunning(): boolean {
  return getState().running;
}

/**
 * A pending data deletion reserves the maintenance window. Backup creation
 * must not start after the confirmation has been issued, otherwise it could
 * race the cleanup and leave a newly-created backup behind.
 */
export function hasPendingDataClear(
  target: DataClearTarget | undefined = undefined,
  now = Date.now(),
): boolean {
  pruneExpired(now);
  for (const operation of getState().pending.values()) {
    if (!target || operation.targets.includes(target)) {
      return true;
    }
  }
  return false;
}

export { DataClearError };
export { DATA_CLEAR_TARGETS, DATA_CLEAR_WAIT_MS };
