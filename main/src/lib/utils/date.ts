const DAY_MS = 86_400_000;

export function formatPostDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (days <= 0) {
    return "最近";
  }
  if (days <= 30) {
    return `${days} 天前`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatArchiveMonth(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year} 年 ${month} 月`;
}
