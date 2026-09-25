import { NextRequest, NextResponse } from "next/server";

import { verifyCsrfRequest } from "@/lib/auth/csrf";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  loginLimitKey,
} from "@/lib/auth/login-limit";
import { rateLimit } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getClientIp } from "@/lib/utils/fingerprint";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function withSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  const { pathname } = request.nextUrl;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth")
  ) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (
    request.nextUrl.protocol === "https:" ||
    forwardedProto === "https"
  ) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

function jsonError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
): NextResponse {
  return withSecurityHeaders(
    request,
    NextResponse.json({ code, message }, { status }),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!SAFE_METHODS.has(request.method)) {
    if (!(await verifyCsrfRequest(request))) {
      return jsonError(request, 403, "CSRF_INVALID", "CSRF 校验失败，请刷新后重试");
    }

    if (
      (pathname === "/api/auth/login" || pathname === "/api/auth/setup") &&
      request.method === "POST"
    ) {
      const ip = getClientIp(request.headers);
      const result = rateLimit(
        loginLimitKey(
          pathname === "/api/auth/setup" ? "setup" : "login",
          ip,
        ),
        LOGIN_LIMIT,
        LOGIN_WINDOW_MS,
      );

      if (!result.allowed) {
        const response = jsonError(
          request,
          429,
          "RATE_LIMITED",
          pathname === "/api/auth/setup"
            ? "创建尝试过于频繁，请稍后再试"
            : "登录尝试过于频繁，请稍后再试",
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
  const isSetupPage =
    pathname === "/admin/setup" || pathname.startsWith("/admin/setup/");

  if (
    isAdminPage &&
    !isLoginPage &&
    !isSetupPage &&
    !request.cookies.has(SESSION_COOKIE_NAME)
  ) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(request, NextResponse.redirect(loginUrl));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-myblog-pathname", pathname);
  return withSecurityHeaders(
    request,
    NextResponse.next({ request: { headers: requestHeaders } }),
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
