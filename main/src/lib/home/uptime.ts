/** Site uptime helpers. No prisma. */

const LOCAL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseSiteStartedAt(raw: string | null | undefined): Date | null {
  const value = raw?.trim() ?? "";
  if (!value) {
    return null;
  }
  const local = LOCAL_DATETIME.exec(value);
  if (local) {
    const date = new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6] ?? 0),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUptime(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} 天`);
  }
  if (days > 0 || hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (days > 0 || hours > 0 || minutes > 0) {
    parts.push(`${minutes} 分`);
  }
  parts.push(`${seconds} 秒`);
  return parts.join(" ");
}

export function toDatetimeLocalValue(raw: string): string {
  const date = parseSiteStartedAt(raw);
  if (!date) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
