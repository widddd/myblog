import { NextResponse } from "next/server";

import { handleAdminError, jsonPage, AdminHttpError } from "@/lib/admin/http";
import { rateLimit } from "@/lib/auth/rateLimit";
import { searchPosts } from "@/lib/search/service";
import { getClientIp } from "@/lib/utils/fingerprint";
import { parsePage } from "@/lib/utils/page";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request.headers);
    const limited = rateLimit(`search:${ip}`, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "搜索过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.ceil(limited.retryAfterMs / 1_000)),
          },
        },
      );
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (q.length > 80) {
      throw new AdminHttpError("VALIDATION_ERROR", "关键词不能超过 80 个字符", 400);
    }
    const result = await searchPosts(q, parsePage(url.searchParams.get("page") ?? undefined));
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "搜索失败");
  }
}
