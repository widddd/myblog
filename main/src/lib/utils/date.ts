const DAY_MS = 86_400_000;

/**
 * 文章页的「超过三天」界线：三天以内仍说相对时间（最近 / X 天前），
 * 再久就给精确到秒的日期。卡片不适用这条（卡片只给相对时间，见 `formatRelativeDate`）。
 */
export const POST_DETAIL_RELATIVE_DAYS = 3;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function absoluteDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function absoluteSecond(date: Date): string {
  return `${absoluteDay(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function elapsedDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / DAY_MS);
}

export function formatPostDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }

  const days = elapsedDays(date);
  if (days <= 0) {
    return "最近";
  }
  if (days <= 30) {
    return `${days} 天前`;
  }

  return absoluteDay(date);
}

/**
 * 卡片右下角的时间：只给相对时间（最近 / X 天前 / X 个月前 / X 年前），
 * 有封面与无封面的卡片走同一条，不显示精确日期。
 */
export function formatRelativeDate(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }

  const days = elapsedDays(date);
  if (days <= 0) {
    return "最近";
  }
  if (days < 30) {
    return `${days} 天前`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} 个月前`;
  }
  return `${Math.floor(months / 12)} 年前`;
}

/**
 * 文章页（PostHero）的发布时间：三天以内说「最近 / X 天前」，
 * 超过三天给精确到秒的日期，避免读者把很久以前的文章看成"最近"。
 */
export function formatPostDateDetail(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }

  const days = elapsedDays(date);
  if (days <= 0) {
    return "最近";
  }
  if (days <= POST_DETAIL_RELATIVE_DAYS) {
    return `${days} 天前`;
  }

  return absoluteSecond(date);
}

/** 精确到秒的日期时间：文章页「已修改」用这条（不随天数退回相对时间） */
export function formatDateTimeSeconds(value: Date | string | null | undefined): string {
  const date = toDate(value);
  return date ? absoluteSecond(date) : "";
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return `${absoluteDay(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatClockDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(rest)}`;
  }
  return `${minutes}:${pad2(rest)}`;
}

export function formatArchiveMonth(value: Date | string): string {
  const date = toDate(value);
  if (!date) {
    return "未注明日期";
  }
  return `${date.getFullYear()} 年 ${pad2(date.getMonth() + 1)} 月`;
}
