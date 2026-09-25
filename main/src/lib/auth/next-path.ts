export const ADMIN_HOME_PATH = "/admin";

const MAX_LENGTH = 512;

function hasDotDotSegment(value: string): boolean {
  let decoded = value;

  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 解码不了就当作不可信（%2e%2e 这类编码穿越就挡在这里）
    return true;
  }

  return decoded.split(/[/?#\\]/).includes("..");
}

/**
 * 登录成功后要跳的地址：只认本站 `/admin` 下的路径，其余一律回落 `/admin`。
 *
 * 未登录访问后台时 `proxy.ts` 会把原地址写进 `?next=...`；这个值来自 URL，
 * 必须当成不可信输入：协议相对地址（`//evil.com`）、反斜杠变体（浏览器把 `\` 当 `/`）、
 * 编码过的目录穿越以及 `?next=/admin/login` 自环都要挡掉，否则就是开放重定向。
 */
export function adminNextPath(
  raw: string | string[] | undefined | null,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== "string") {
    return ADMIN_HOME_PATH;
  }

  const trimmed = value.trim();

  if (
    !trimmed ||
    trimmed.length > MAX_LENGTH ||
    !/^\/admin(?:$|[/?#])/.test(trimmed) ||
    /[\\\s]/.test(trimmed) ||
    trimmed === "/admin/login" ||
    trimmed.startsWith("/admin/login/") ||
    trimmed.startsWith("/admin/login?") ||
    hasDotDotSegment(trimmed)
  ) {
    return ADMIN_HOME_PATH;
  }

  return trimmed;
}
