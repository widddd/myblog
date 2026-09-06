import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { clearRateLimit, rateLimit } from "@/lib/auth/rateLimit";
import { findPublishedPostByRef } from "@/lib/posts/query";
import { issuePostUnlockCookie } from "@/lib/posts/unlock";
import { getClientIp } from "@/lib/utils/fingerprint";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const unlockSchema = z.object({
  password: z.string().min(1).max(256),
});

type UnlockRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: UnlockRouteContext) {
  try {
    const { slug } = await context.params;
    const ip = getClientIp(request.headers);
    const limitKey = `post-unlock:${ip}:${slug}`;
    const limited = rateLimit(limitKey, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS);
    if (!limited.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "密码尝试过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "请求体必须是有效 JSON" },
        { status: 400 },
      );
    }
    const payload = unlockSchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "请输入文章访问密码" },
        { status: 400 },
      );
    }

    const post = await findPublishedPostByRef(slug);
    if (!post) {
      return NextResponse.json(
        { code: "POST_NOT_FOUND", message: "文章不存在" },
        { status: 404 },
      );
    }
    if (!post.passwordHash) {
      return NextResponse.json(
        { code: "POST_NOT_LOCKED", message: "这篇文章无需密码" },
        { status: 400 },
      );
    }
    if (!(await verifyPassword(payload.data.password, post.passwordHash))) {
      return NextResponse.json(
        { code: "INVALID_PASSWORD", message: "访问密码错误" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    await issuePostUnlockCookie(post.publicId);
    clearRateLimit(limitKey);
    return NextResponse.json(
      { data: { unlocked: true, expiresIn: 2 * 60 * 60 } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("密码文章解锁失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "解锁失败，请稍后重试" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
