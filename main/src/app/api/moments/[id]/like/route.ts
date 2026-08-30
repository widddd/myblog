import { NextResponse } from "next/server";

import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { rateLimit } from "@/lib/auth/rateLimit";
import { toggleMomentLike } from "@/lib/moments/query";
import { fingerprint, getClientIp } from "@/lib/utils/fingerprint";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const momentId = Number.parseInt(rawId, 10);
    if (!Number.isInteger(momentId) || momentId < 1) {
      throw new AdminHttpError("VALIDATION_ERROR", "无效的瞬间 ID", 400);
    }

    const ip = getClientIp(request.headers);
    const limited = rateLimit(`moment-like:${ip}`, 20, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "点赞过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.ceil(limited.retryAfterMs / 1_000)),
          },
        },
      );
    }

    const fp = fingerprint(ip, request.headers.get("user-agent") ?? "");
    const result = await toggleMomentLike(momentId, fp);
    return jsonData(result);
  } catch (error) {
    return handleAdminError(error, "点赞失败");
  }
}
