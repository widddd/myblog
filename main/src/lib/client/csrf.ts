import { CSRF_COOKIE_NAME } from "@/lib/auth/csrf-cookie";
import { readJsonResponse } from "@/lib/client/http";

type CsrfResponse = {
  token?: string;
  message?: string;
};

type FetchCsrfOptions = {
  /**
   * 强制重新签发（先发 `GET /api/auth/csrf` 再返回）。
   *
   * 用在两个地方：登录/创建页（可能还留着上一个会话的 cookie），
   * 以及任何一次 `CSRF_INVALID` 之后的自动重试。
   */
  refresh?: boolean;
};

let cachedToken: string | null = null;
let mustRefresh = false;

/**
 * 丢掉本地令牌缓存，并且**下一次必须走服务端重新签发**。
 *
 * 只清缓存是不够的：cookie 还在浏览器里，重新"读一次 cookie"会把同一个过期令牌再拿回来
 * （会话被换掉 / csrfSecret 轮换后，那个令牌的签名已经对不上了）。
 */
export function resetCsrfToken(): void {
  cachedToken = null;
  mustRefresh = true;
}

/** 从 `document.cookie` 直接取令牌（该 cookie 非 HttpOnly，服务端就是拿它比对请求头）。 */
function readCookieToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const pattern = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME.replace(/\./g, "\\.")}=([^;]*)`);
  const match = document.cookie.match(pattern);
  if (!match || !match[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * 拿一个可用的 CSRF 令牌。
 *
 * 优先复用 cookie 里的那个（同一会话内一直有效，见 `verifyCsrfRequest`：只校验
 * 「请求头 == cookie」加上「HMAC 对得上当前会话的 csrfSecret」）。
 * 只有当 cookie 缺失、或明确要求 refresh 时才发请求——少一跳，后台改设置这类
 * 「点一下立刻要生效」的操作体感差别很明显。
 */
export async function fetchCsrfToken(
  options: FetchCsrfOptions = {},
): Promise<string> {
  if (!options.refresh && !mustRefresh && cachedToken) {
    return cachedToken;
  }

  if (!options.refresh && !mustRefresh) {
    const fromCookie = readCookieToken();
    if (fromCookie) {
      cachedToken = fromCookie;
      return fromCookie;
    }
  }

  const url = "/api/auth/csrf";
  const response = await fetch(url, { cache: "no-store" });
  // 这里也会撞上网关 HTML（应用刚重启时），同样走统一的诊断口径
  const body = await readJsonResponse<CsrfResponse>(response, url);
  if (!response.ok || !body.token) {
    throw new Error(body.message || "无法获取安全令牌");
  }
  cachedToken = body.token;
  mustRefresh = false;
  return body.token;
}
