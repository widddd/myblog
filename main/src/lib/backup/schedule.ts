/**
 * 周期备份的「什么时候该跑」全部收在这里。
 *
 * ⚠️ 本模块是**纯函数 + 无 IO**：后台备份页（客户端组件）也要 import 它算「下次自动备份」，
 * 所以**禁止**在这里 import 任何 `node:` / 服务端模块（如 `lib/backup/backup.ts`、`lib/db`）。
 * 调度器 `lib/scheduler/backup.ts` 只负责读 Setting、判断能不能跑、调 `runBackup()`。
 *
 * 时间口径：`backupAtTime` 是**服务器本地时间**的 `HH:MM`（与 `siteStartedAt` 同一口径）。
 */

/** 默认周期：3 天。Setting `backupPeriodDays` 的默认值单一事实源。 */
export const DEFAULT_BACKUP_PERIOD_DAYS = 3;

/** 默认时刻：03:00。Setting `backupAtTime` 的默认值单一事实源。 */
export const DEFAULT_BACKUP_AT_TIME = "03:00";

/**
 * 几个数字字段的合法区间。**单一事实源**：接口校验（`validation/settings.ts`）、
 * 备份页输入框的 min/max、提交前的本地校验都从这里取，别再各写一份（P-004 家族）。
 */
export const BACKUP_LIMITS = {
  periodDays: { min: 1, max: 365 },
  keep: { min: 1, max: 30 },
  localMaxMB: { min: 64, max: 10240 },
} as const;

const AT_TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const AT_TIME_STRICT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 严格格式（补零 HH:MM）：表单与接口用。宽松解析留给 `parseBackupAtTime` 兜历史脏值。 */
export function isBackupAtTime(raw: unknown): boolean {
  return typeof raw === "string" && AT_TIME_STRICT_PATTERN.test(raw.trim());
}

function integerInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max ? num : null;
}

/**
 * 「每隔几天自动备份」四个字段的范围与格式检查，返回中文提示，`null` = 通过。
 * 客户端提交前与单测共用；接口侧另有 Zod（同区间），这里管的是「别把 Zod 的英文默认报错端给用户」（P-122）。
 */
export function validateBackupSchedule(input: {
  backupPeriodDays: unknown;
  backupAtTime: unknown;
  backupKeep: unknown;
  backupLocalMaxMB: unknown;
}): string | null {
  if (
    integerInRange(
      input.backupPeriodDays,
      BACKUP_LIMITS.periodDays.min,
      BACKUP_LIMITS.periodDays.max,
    ) === null
  ) {
    return `备份周期须为 ${BACKUP_LIMITS.periodDays.min}–${BACKUP_LIMITS.periodDays.max} 的整数天`;
  }
  if (!isBackupAtTime(input.backupAtTime)) {
    return "备份时刻须为 HH:MM，例如 03:30";
  }
  if (
    integerInRange(input.backupKeep, BACKUP_LIMITS.keep.min, BACKUP_LIMITS.keep.max) ===
    null
  ) {
    return `保留份数须为 ${BACKUP_LIMITS.keep.min}–${BACKUP_LIMITS.keep.max} 的整数`;
  }
  if (
    integerInRange(
      input.backupLocalMaxMB,
      BACKUP_LIMITS.localMaxMB.min,
      BACKUP_LIMITS.localMaxMB.max,
    ) === null
  ) {
    return `本地备份上限须为 ${BACKUP_LIMITS.localMaxMB.min}–${BACKUP_LIMITS.localMaxMB.max} MB 的整数`;
  }
  return null;
}

/**
 * 解析 `HH:MM`（容忍 `3:05` 这种不补零写法）；缺失、越界、非字符串一律回落默认时刻。
 * 纯函数，不抛错——脏值不该让调度器炸掉。
 */
export function parseBackupAtTime(raw: unknown): { hour: number; minute: number } {
  const match = typeof raw === "string" ? AT_TIME_PATTERN.exec(raw.trim()) : null;
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour <= 23 && minute <= 59) {
      return { hour, minute };
    }
  }
  const [fallbackHour, fallbackMinute] = DEFAULT_BACKUP_AT_TIME.split(":").map(Number);
  return { hour: fallbackHour, minute: fallbackMinute };
}

/** 归一成落库/展示用的 `HH:MM`（补零）；非法值回落默认时刻。 */
export function normalizeBackupAtTime(raw: unknown): string {
  const { hour, minute } = parseBackupAtTime(raw);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 周期天数：非法、缺失或小于 1 一律回落默认值。纯函数，便于单测。 */
export function resolvePeriodDays(raw: unknown): number {
  const days = Number(raw);
  return Number.isFinite(days) && days >= 1
    ? Math.floor(days)
    : DEFAULT_BACKUP_PERIOD_DAYS;
}

/**
 * 下一次应备份的时刻（ms）。
 *
 * 锚点是「**上次备份那天的本地日期 + N 天**」，时刻取设置的 `HH:MM`：
 * 上次 10-01 10:00 备过、周期 3 天、时刻 03:00 → 下次 10-04 03:00。
 * 用 `new Date(年, 月, 日 + N, 时, 分)` 而不是 `lastMs + N*86400_000`：跨月与本地日历偏移交给 Date。
 *
 * 返回 `null` = `lastBackupAt` 为空/解析不出 → **从没备份过**（装好就先备一份，不让新站裸奔）。
 */
export function nextBackupDueMs(
  lastBackupAt: string | null | undefined,
  periodDays: unknown,
  atTime: unknown,
): number | null {
  const lastMs =
    typeof lastBackupAt === "string" && lastBackupAt.trim()
      ? Date.parse(lastBackupAt)
      : Number.NaN;
  if (!Number.isFinite(lastMs)) {
    return null;
  }
  const days = resolvePeriodDays(periodDays);
  const { hour, minute } = parseBackupAtTime(atTime);
  const last = new Date(lastMs);
  return new Date(
    last.getFullYear(),
    last.getMonth(),
    last.getDate() + days,
    hour,
    minute,
    0,
    0,
  ).getTime();
}

/**
 * 是否到期。纯函数。
 * `lastBackupAt` 为空、空串或解析不出日期都算「从没备份过」→ 到期（装好就该备一次）。
 * 到点判定取等号：`now === 目标时刻` 就算到期，调度 tick 落在这个点上不会漏。
 */
export function isBackupDue(
  lastBackupAt: string | null | undefined,
  periodDays: unknown,
  atTime: unknown,
  nowMs: number = Date.now(),
): boolean {
  const dueMs = nextBackupDueMs(lastBackupAt, periodDays, atTime);
  return dueMs === null ? true : nowMs >= dueMs;
}
