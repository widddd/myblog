import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNodeNotFoundError } from "@/lib/backup/errors";
import {
  backupPackageExists,
  getBackupFilePath,
  listBackups,
} from "@/lib/backup/files";
import { isManagedBackupFileName } from "@/lib/backup/filename";
import { getDriver, loadCosSettings } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

/**
 * 备份上云的**后台队列**。
 *
 * 为什么不是「备份请求里顺手传完」：一个 60–80MB 的包在这台机器上要传几十秒，而
 * 请求是挂在 nginx 后面的——进程一旦被重启（预约更新、发布、`pm2 restart`）或代理超时，
 * 用户看到的就是一句莫名其妙的网关 HTML，本地包留下了、云端却没有（2026-10-03 生产实测）。
 * 所以口径改成：**请求只负责把包落到本地并立刻返回**，上传交给这里在响应之后慢慢跑。
 *
 * 三条不变量：
 * 1. **一次请求绝不等上传**：`queueBackupCosUpload()` 落一次状态 + 起异步任务就返回；
 * 2. **状态先落盘再上传**：`data/backup-uploads.json` 是事实源，进程被打断后下一趟
 *    调度 tick（或下次启动）会从文件里把它捡回来接着传；
 * 3. **文件没了就清记录**：手动删包、按份数/体积轮转掉的包不该留下幽灵状态。
 *
 * 与 `lib/backup/backup.ts` 是**单向**依赖（backup.ts → 本文件），这里不许反过来 import
 * `isBackupRunning()` 之类，否则形成循环依赖。
 */

const COS_BACKUP_PREFIX = "backups/";

/** COS 上的对象 key。与 `lib/backup/backup.ts` 的历史口径保持一致。 */
export function cosBackupKey(name: string): string {
  return `${COS_BACKUP_PREFIX}${name}`;
}

export type BackupUploadStatus = "queued" | "uploading" | "failed";

export type BackupUploadEntry = {
  status: BackupUploadStatus;
  /** 已经试过几次（落状态即计数，成功才清零） */
  attempts: number;
  /** 最近一次状态变更时间（ISO），退避与展示都用它 */
  updatedAt: string;
  /** 上次失败原因（成功或未失败时不存在） */
  error?: string;
};

/** `queueBackupCosUpload()` 的结果：`skipped` = 没配 COS，只留本地。 */
export type BackupUploadQueueResult = "queued" | "skipped";

/** 单次真实上传的结果，供「上传到 COS」按钮与单测断言。 */
export type BackupUploadRunResult = "uploaded" | "skipped" | "failed";

/** 连续失败多少次后停手（余下交给管理员手动点「上传到 COS」）。 */
export const MAX_BACKUP_UPLOAD_ATTEMPTS = 5;

/**
 * 第 N 次失败后的退避：30s、1m、2m、4m、8m…封顶 10 分钟。纯函数。
 * 刚开始失败往往是网络抖动，等一会儿就好；真坏了也不该每分钟都去撞一次。
 */
export function backupUploadBackoffMs(attempts: number): number {
  const step = Math.min(Math.max(1, Math.floor(attempts)), 6);
  return Math.min(30_000 * 2 ** (step - 1), 10 * 60_000);
}

/**
 * 这条记录现在该不该重试。纯函数。
 * - `queued` / `uploading`：进程刚被打断或还没轮到，立刻算到期（启动补偿就靠这条）；
 * - `failed`：等退避时间到了再说；
 * - 次数用尽：不再自动重试（UI 上仍是「上云失败」，可手动重试）。
 */
export function isBackupUploadRetryDue(
  entry: BackupUploadEntry,
  nowMs: number = Date.now(),
  maxAttempts: number = MAX_BACKUP_UPLOAD_ATTEMPTS,
): boolean {
  if (entry.attempts >= maxAttempts) {
    return false;
  }
  if (entry.status !== "failed") {
    return true;
  }
  const at = Date.parse(entry.updatedAt);
  if (Number.isNaN(at)) {
    return true;
  }
  return nowMs >= at + backupUploadBackoffMs(entry.attempts);
}

/** 「等上传」的两种状态：清轮转时要放过这些包（它们是云端唯一的来源）。纯函数。 */
export function isBackupUploadPending(
  entry: BackupUploadEntry | null | undefined,
): boolean {
  return entry?.status === "queued" || entry?.status === "uploading";
}

/** 丢掉落在本地的包已经不在磁盘上的记录。纯函数，便于单测。 */
export function pruneBackupUploadStore(
  store: Record<string, BackupUploadEntry>,
  existingNames: Iterable<string>,
): { store: Record<string, BackupUploadEntry>; changed: boolean } {
  const names = new Set(existingNames);
  const next: Record<string, BackupUploadEntry> = {};
  let changed = false;
  for (const [name, entry] of Object.entries(store)) {
    if (!isManagedBackupFileName(name) || !names.has(name)) {
      changed = true;
      continue;
    }
    next[name] = entry;
  }
  return { store: next, changed };
}

type UploadGlobal = typeof globalThis & {
  /** 正在上传的包名（一次只传一个：1GB 机器上别开并发） */
  myblogBackupUploads?: Set<string>;
  /** 状态文件的读改写串行锁（防两个异步任务互相覆盖对方写的记录） */
  myblogBackupUploadLock?: Promise<unknown>;
};

const globalForUploads = globalThis as UploadGlobal;

const UPLOAD_STATE_PATH = path.resolve(
  process.cwd(),
  "data",
  "backup-uploads.json",
);

function inFlight(): Set<string> {
  globalForUploads.myblogBackupUploads ??= new Set<string>();
  return globalForUploads.myblogBackupUploads;
}

export function isBackupUploading(name?: string): boolean {
  const set = inFlight();
  return name ? set.has(name) : set.size > 0;
}

/** 状态文件的读改写一律走这里，避免两个任务各读一份再各写一份。 */
function withUploadLock<T>(run: () => Promise<T>): Promise<T> {
  const previous = globalForUploads.myblogBackupUploadLock ?? Promise.resolve();
  const next = previous.then(run, run);
  globalForUploads.myblogBackupUploadLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readStore(): Promise<Record<string, BackupUploadEntry>> {
  try {
    const raw = await readFile(UPLOAD_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, BackupUploadEntry>;
  } catch (error) {
    if (!isNodeNotFoundError(error)) {
      logger.warn("读取备份上传状态失败，按空处理", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {};
  }
}

async function writeStore(store: Record<string, BackupUploadEntry>): Promise<void> {
  // 空 = 没有待办：把文件删掉，别留一个 {} 空壳（列表页与测试都按「文件在 = 有队列」读）
  if (Object.keys(store).length === 0) {
    await unlink(UPLOAD_STATE_PATH).catch((error) => {
      if (!isNodeNotFoundError(error)) {
        throw error;
      }
    });
    return;
  }
  await mkdir(path.dirname(UPLOAD_STATE_PATH), { recursive: true });
  await writeFile(
    UPLOAD_STATE_PATH,
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
}

async function patchEntry(
  name: string,
  patch: Partial<BackupUploadEntry> & { status: BackupUploadStatus },
): Promise<void> {
  if (!isManagedBackupFileName(name)) {
    return;
  }
  await withUploadLock(async () => {
    const store = await readStore();
    store[name] = {
      ...(store[name] ?? { attempts: 0, updatedAt: "" }),
      ...patch,
      status: patch.status,
    };
    await writeStore(store);
  });
}

/** 读全部上传状态；给了 `existingNames` 就顺手把幽灵记录清掉（列表页与调度器都这么用）。 */
export async function getBackupUploads(
  existingNames?: Iterable<string>,
): Promise<Record<string, BackupUploadEntry>> {
  const store = await readStore();
  if (!existingNames) {
    return store;
  }
  const { store: next, changed } = pruneBackupUploadStore(store, existingNames);
  if (changed) {
    await withUploadLock(() => writeStore(next));
  }
  return next;
}

export async function clearBackupUpload(name: string): Promise<void> {
  await withUploadLock(async () => {
    const store = await readStore();
    if (!(name in store)) {
      return;
    }
    delete store[name];
    await writeStore(store);
  });
}

/** 数据清理用：备份连同上传状态一起清空。 */
export async function clearAllBackupUploads(): Promise<void> {
  inFlight().clear();
  await withUploadLock(async () => {
    await unlink(UPLOAD_STATE_PATH).catch((error) => {
      if (!isNodeNotFoundError(error)) {
        throw error;
      }
    });
  });
}

/**
 * 真去传一次。**不抛错**：失败写进状态文件，交给下一趟 tick 退避重试。
 * 成功 / 本地文件已被删 → 清掉记录。
 */
async function runUpload(
  name: string,
  filePath: string,
  previousAttempts: number,
): Promise<BackupUploadRunResult> {
  const attempts = previousAttempts + 1;
  await patchEntry(name, {
    status: "uploading",
    attempts,
    error: undefined,
    updatedAt: new Date().toISOString(),
  });

  try {
    const cos = await loadCosSettings();
    if (!cos) {
      // 上传途中被人关掉了 COS：没什么可传的，别留幽灵。
      await clearBackupUpload(name);
      return "skipped";
    }
    if (!(await backupPackageExists(name))) {
      await clearBackupUpload(name);
      return "skipped";
    }
    await getDriver("cos").putFile(cosBackupKey(name), filePath);
    await clearBackupUpload(name);
    logger.info("备份已上传 COS", { name, attempts });
    return "uploaded";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 传的过程中被删了（手动删包 / 数据清理）：记录跟着删，别报一条假失败。
    if (!(await backupPackageExists(name))) {
      await clearBackupUpload(name);
      return "skipped";
    }
    await patchEntry(name, {
      status: "failed",
      attempts,
      error: message,
      updatedAt: new Date().toISOString(),
    });
    if (attempts >= MAX_BACKUP_UPLOAD_ATTEMPTS) {
      logger.error("备份上传 COS 连续失败，已停止自动重试", {
        name,
        attempts,
        error: message,
      });
    } else {
      logger.warn("备份上传 COS 失败，之后会重试", {
        name,
        attempts,
        error: message,
      });
    }
    return "failed";
  }
}

function startUpload(name: string, filePath: string): void {
  const set = inFlight();
  if (set.has(name)) {
    return;
  }
  set.add(name);
  void (async () => {
    const store = await readStore();
    const previousAttempts = store[name]?.attempts ?? 0;
    try {
      await runUpload(name, filePath, previousAttempts);
    } catch (error) {
      // runUpload 自己吞错；这里只兜住状态文件写失败这种极小概率
      logger.error("备份上传任务异常", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      set.delete(name);
    }
  })();
}

/**
 * 把一份本地备份排进后台上传队列。**不等待上传**，落完状态就返回。
 * 没配 COS 时返回 `skipped`（纯本地站点一切照旧，见 P-145）。
 */
export async function queueBackupCosUpload(
  name: string,
  filePath: string = getBackupFilePath(name),
): Promise<BackupUploadQueueResult> {
  if (!isManagedBackupFileName(name)) {
    return "skipped";
  }
  const cos = await loadCosSettings();
  if (!cos) {
    return "skipped";
  }
  await patchEntry(name, {
    status: "queued",
    attempts: 0,
    error: undefined,
    updatedAt: new Date().toISOString(),
  });
  startUpload(name, filePath);
  return "queued";
}

/**
 * 调度器每趟（以及每次启动）调一次：把 `queued` / 退避到点的 `failed` 捡起来接着传。
 * 一次只起一个（`inFlight` 非空就直接返回），返回被捡起来的包名便于日志与单测。
 */
export async function retryPendingBackupUploads(
  nowMs: number = Date.now(),
): Promise<string | null> {
  const files = await listBackups();
  const names = new Set(files.map((file) => file.name));
  const store = await getBackupUploads(names);
  if (Object.keys(store).length === 0) {
    return null;
  }
  const cos = await loadCosSettings();
  if (!cos) {
    // COS 被关掉了：这些记录再也不会成功，清掉，UI 上就只剩「本地」。
    for (const name of Object.keys(store)) {
      await clearBackupUpload(name);
    }
    return null;
  }
  if (inFlight().size > 0) {
    return null;
  }
  const due = Object.entries(store).find(
    ([name, entry]) => names.has(name) && isBackupUploadRetryDue(entry, nowMs),
  );
  if (!due) {
    return null;
  }
  const [name, entry] = due;
  startUpload(name, getBackupFilePath(name));
  logger.info("补传备份到 COS", { name, attempts: entry.attempts });
  return name;
}
