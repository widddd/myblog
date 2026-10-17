import { fetchCsrfToken, resetCsrfToken } from "@/lib/client/csrf";
import { readJsonResponse } from "@/lib/client/http";

type ErrorBody = {
  code?: string;
  message?: string;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

function isCsrfFailure(error: unknown): boolean {
  return error instanceof AdminRequestError && error.code === "CSRF_INVALID";
}

async function send<T>(
  url: string,
  init: RequestInit,
  token: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("x-csrf-token", token);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
  // 不直接 response.json()：网关的 HTML 错误页会被翻译成 `Unexpected token '<'`，
  // 用户完全看不出发生了什么（见 lib/client/http.ts）
  const payload = await readJsonResponse<ErrorBody & T>(response, url);
  if (!response.ok) {
    throw new AdminRequestError(
      payload.message || "请求失败",
      payload.code,
      response.status,
    );
  }
  return payload;
}

/**
 * 后台 JSON 请求的统一入口。
 *
 * 写操作会带上 CSRF 令牌（优先复用 cookie 里的，见 lib/client/csrf.ts）。
 * 一旦服务端回 `CSRF_INVALID`（会话被换掉、cookie 过期、上次的令牌签名对不上当前
 * csrfSecret），**强制重新签发一次并自动重试一次**：从前这种情况只会把错误抛给用户，
 * 表现就是「点一下没保存，再点一下又好了」——用户没法判断到底是没点到还是没保存。
 * 只重试一次，不重试网络错误（写操作重试可能造成重复提交）。
 */
export async function adminJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const mutating = !SAFE_METHODS.has(method);

  const attempt = async () =>
    send<T>(url, init, mutating ? await fetchCsrfToken() : null);

  if (!mutating) {
    return attempt();
  }

  try {
    return await attempt();
  } catch (error) {
    if (!isCsrfFailure(error)) {
      throw error;
    }
    resetCsrfToken();
    return attempt();
  }
}
