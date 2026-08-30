import { NextRequest, NextResponse } from "next/server";

import { verifyCsrfRequest } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getClientIp } from "@/lib/utils/fingerprint";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return withSecurityHeaders(
    NextResponse.json({ code, message }, { status }),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!SAFE_METHODS.has(request.method)) {
    if (!(await verifyCsrfRequest(request))) {
      return jsonError(403, "CSRF_INVALID", "CSRF 校验失败，请刷新后重试");
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      const ip = getClientIp(request.headers);
      const result = rateLimit(
        `login:${ip}`,
        LOGIN_LIMIT,
        LOGIN_WINDOW_MS,
      );

      if (!result.allowed) {
        const response = jsonError(
          429,
          "RATE_LIMITED",
          "登录尝试过于频繁，请稍后再试",
        );
        response.headers.set(
          "Retry-After",
          String(Math.ceil(result.retryAfterMs / 1_000)),
        );
        return response;
      }
    }
  }

  const isAdminPage =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isLoginPage =
    pathname === "/admin/login" || pathname.startsWith("/admin/login/");

  if (
    isAdminPage &&
    !isLoginPage &&
    !request.cookies.has(SESSION_COOKIE_NAME)
  ) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
