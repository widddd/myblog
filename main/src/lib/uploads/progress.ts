/**
 * finalize（`生成缩略图` → `上传到云存储`）的**服务端进度登记表**。
 *
 * 为什么需要它：上云这一步是**服务端**在传（浏览器把文件交给 `/api/upload` 就结束了），
 * 客户端拿不到这次上传的字节进度，于是进度条只能"发请求前 55% → 回包后 100%"，
 * 中间那一大段（几 MB 的原图 + 缩略图）完全静止——实测就是用户报的「卡在 55%」。
 *
 * 做法：`finalizeUpload()` 把每一步的进度写进这张表（上云那一步来自 COS SDK 的
 * onProgress，是真实字节数），客户端在 finalize 请求还没返回时轮询
 * `GET /api/admin/uploads/finalize/progress?hash=…` 把它读出来画进度条。
 *
 * 口径约束（1GB 内存的项目红线，见 AGENTS.md 硬性资源约束）：
 * - 只放**正在处理**的 hash，完成即删；表本身有上限，超出按最旧淘汰，不会随上传次数涨。
 * - 内存里只有几个数字，不缓存文件内容。
 * - 进程内状态 = 单实例部署（pm2 fork）才成立；这也是本项目既有的前提。
 */
import type { MediaStep } from "@/lib/uploads/steps";

/** 与 finalize 的两步同名（`derivatives` / `replicate`），不在中间再造一套词汇 */
export type FinalizeStage = MediaStep;

export type FinalizeProgressSnapshot = {
  hash: string;
  stage: FinalizeStage;
  /** 整段 finalize 的百分比：0–100（不是当前这一步的） */
  percent: number;
  /** 当前对象的已传字节（上云时才有意义，给「原图 2.1/4.0 MB」这种小字用） */
  loadedBytes: number;
  /** 当前对象的字节数：0 = 还不知道 */
  totalBytes: number;
  updatedAt: number;
};

/** 生成缩略图做完时的整体百分比 */
export const FINALIZE_DERIVATIVES_END = 35;
/**
 * 上云做完时的整体百分比。刻意留 1% 给"回包"：
 * 服务端说 100% 时客户端其实还在等响应，进度条该停在 99 直到请求真的返回。
 */
export const FINALIZE_COS_END = 99;

/** 读原图阶段的进度（sharp 之前） */
export function finalizeReadPercent(): number {
  return 8;
}

/** 缩略图算完、已落本地阶段的进度 */
export function finalizeThumbsPercent(): number {
  return FINALIZE_DERIVATIVES_END;
}

/**
 * 上云进度：`loadedBytes / totalBytes`（本次 finalize 要传的**全部**对象之和）
 * 映射到 [FINALIZE_DERIVATIVES_END, FINALIZE_COS_END]。
 * 纯函数，越界与 total=0（COS 没报 Content-Length）都夹得住。
 */
export function finalizeCosPercent(
  loadedBytes: number,
  totalBytes: number,
): number {
  const span = FINALIZE_COS_END - FINALIZE_DERIVATIVES_END;
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return FINALIZE_DERIVATIVES_END;
  }
  const loaded = Number.isFinite(loadedBytes) ? loadedBytes : 0;
  const ratio = Math.min(1, Math.max(0, loaded / totalBytes));
  return FINALIZE_DERIVATIVES_END + Math.round(ratio * span);
}

/** 进度只许往前走：轮询抖动、回调乱序都不该让进度条倒退 */
export function forwardPercent(current: number, next: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeNext = Number.isFinite(next) ? next : safeCurrent;
  return Math.min(100, Math.max(safeCurrent, Math.round(safeNext)));
}

/** 一条进度记录多久算过期（客户端停止轮询后不该一直留在内存里） */
const PROGRESS_TTL_MS = 120_000;
/** 同时最多留几条（同时发布多条瞬间会连着跑，但也不该无限涨） */
const MAX_ENTRIES = 32;

const entries = new Map<string, FinalizeProgressSnapshot>();

function prune(now: number) {
  for (const [hash, entry] of entries) {
    if (now - entry.updatedAt > PROGRESS_TTL_MS) {
      entries.delete(hash);
    }
  }
  while (entries.size > MAX_ENTRIES) {
    const oldest = [...entries.entries()].sort(
      (left, right) => left[1].updatedAt - right[1].updatedAt,
    )[0];
    if (!oldest) {
      break;
    }
    entries.delete(oldest[0]);
  }
}

export function beginFinalizeProgress(
  hash: string,
  stage: FinalizeStage = "derivatives",
): void {
  const now = Date.now();
  prune(now);
  const previous = entries.get(hash);
  entries.set(hash, {
    hash,
    stage,
    percent: previous ? previous.percent : 0,
    loadedBytes: 0,
    totalBytes: 0,
    updatedAt: now,
  });
}

export function reportFinalizeProgress(
  hash: string,
  patch: Partial<Omit<FinalizeProgressSnapshot, "hash" | "updatedAt">>,
): void {
  const current = entries.get(hash);
  if (!current) {
    // 没有 start 就来的报告（理论上不会有）：直接忽略，别在内存里凭空造记录
    return;
  }
  entries.set(hash, {
    ...current,
    stage: patch.stage ?? current.stage,
    percent: forwardPercent(current.percent, patch.percent ?? current.percent),
    loadedBytes: patch.loadedBytes ?? current.loadedBytes,
    totalBytes: patch.totalBytes ?? current.totalBytes,
    updatedAt: Date.now(),
  });
}

export function endFinalizeProgress(hash: string): void {
  entries.delete(hash);
}

export function readFinalizeProgress(
  hash: string,
): FinalizeProgressSnapshot | null {
  const entry = entries.get(hash);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.updatedAt > PROGRESS_TTL_MS) {
    entries.delete(hash);
    return null;
  }
  return { ...entry };
}
