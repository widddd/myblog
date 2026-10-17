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
  /**
   * 为了这份预约已经排过几次重启。**必须落盘**：进程重启是这条链路本身要做的事，
   * 计数放内存里就永远归零，兜不住死循环（P-133 的生产事故：`restartAt` 长期过期，
   * 每分钟 tick 都排一次重启，而应用更新的只有 `scripts/boot.cjs`——部署改成
   * pm2 直起 `next start` 后没人消费它，于是永远重启下去）。
   */
  restartAttempts?: number;
};

/**
 * 排重启的次数上限。正常情况一次就够（重启 → boot 应用 → 清 pending）；
 * 到了上限说明**重启这条链路根本没人应用更新**（或包本身有问题），
 * 这时必须停手并把原因写进 `update-state.json`，而不是每分钟重来一次。
 */
export const MAX_PENDING_UPDATE_RESTARTS = 3;

export type UpdateRestartDecision = "idle" | "restart" | "abandon";

export type UpdateApplyState = {
  status: "ok" | "failed" | "skipped";
  name?: string;
  appliedAt?: string;
  error?: string;
  copied?: number;
  removed?: number;
  installed?: boolean;
  migrated?: boolean;
  /** 是否按新 schema 重建过 Prisma 客户端（加模型的版本靠它，见 P-124） */
  generated?: boolean;
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

/** 重启计数：只认非负整数，脏值按 0 算（旧版本的 pending 里没有这个键）。 */
function parseRestartAttempts(value: unknown): number {
  const attempts = Number(value);
  return Number.isInteger(attempts) && attempts > 0 ? attempts : 0;
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
      restartAttempts: parseRestartAttempts(parsed.restartAttempts),
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
    restartAttempts: 0,
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

/**
 * 「到点了该怎么办」的**唯一裁决点**（纯函数，单测直接打它）：
 * - `idle`：没预约、没到点 → 什么都不做；
 * - `restart`：到点了且还有额度 → 排重启（重启后由 boot / CLI 应用并清 pending）；
 * - `abandon`：到点了但额度用尽 → **不再重启**，写失败状态并清 pending。
 *
 * 这一条是 2026-10-03 生产事故的正解：`restartAt` 过期后每分钟都会重排一次重启，
 * 而没有任何人应用更新时就是永久的 61 秒重启循环（长请求全被腰斩）。
 */
export function decidePendingUpdateRestart(
  pending: PendingUpdate | null,
  now: number = Date.now(),
  maxAttempts: number = MAX_PENDING_UPDATE_RESTARTS,
): UpdateRestartDecision {
  if (!isPendingUpdateDue(pending, now)) {
    return "idle";
  }
  return (pending?.restartAttempts ?? 0) >= maxAttempts ? "abandon" : "restart";
}

/** 记一次「已排重启」，落盘后再返回。返回累计次数。 */
export async function notePendingUpdateRestart(
  pending: PendingUpdate,
  databasePath = resolveDatabasePath(),
): Promise<number> {
  const attempts = (pending.restartAttempts ?? 0) + 1;
  await writePendingUpdate({ ...pending, restartAttempts: attempts }, databasePath);
  return attempts;
}

/**
 * 额度用尽：把「为什么没应用成功」写进 `update-state.json`（更新页会显示「上次失败：…」），
 * 并取消预约——**留下 pending 就是留下死循环**。更新包本身不动，还在更新包列表里。
 */
export async function abandonPendingUpdateRestart(
  pending: PendingUpdate,
  databasePath = resolveDatabasePath(),
): Promise<UpdateApplyState> {
  const state: UpdateApplyState = {
    status: "failed",
    name: pending.name,
    appliedAt: new Date().toISOString(),
    error: `预约更新连续 ${MAX_PENDING_UPDATE_RESTARTS} 次重启都没有被应用，已停止重试并取消预约。常见原因：这台机器的启动流程不应用预约更新（例如 pm2 直接起 next start，没有经过 scripts/boot.cjs），或更新包本身有问题。更新包还在列表里，可停服后用 pnpm apply-update --file 手动应用。`,
  };
  await writeUpdateState(state, databasePath);
  await cancelPendingUpdate(databasePath);
  logger.error("预约更新多次重启仍未应用，已停止重试", {
    name: pending.name,
    attempts: pending.restartAttempts ?? 0,
  });
  return state;
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
  // 重新设定重启时间 = 重新给一次额度，否则「停手」之后手动再试也永远不重启
  const pending: PendingUpdate = { ...current, restartAt, restartAttempts: 0 };
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

export async function clearUpdateState(
  databasePath = resolveDatabasePath(),
): Promise<void> {
  await unlink(updateStatePath(databasePath)).catch((error) => {
    if (!isNodeNotFoundError(error)) {
      throw error;
    }
  });
}
