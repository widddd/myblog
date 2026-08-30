import { NextResponse } from "next/server";

import { AdminHttpError, handleAdminError, jsonData, jsonPage } from "@/lib/admin/http";
import { rateLimit } from "@/lib/auth/rateLimit";
import {
  GUEST_COMMENT_WINDOW_MS,
  isHoneypotFilled,
  listApprovedComments,
  submitGuestComment,
} from "@/lib/comments/service";
import { getClientIp } from "@/lib/utils/fingerprint";
import { parsePage, parsePageSize } from "@/lib/utils/page";
import { guestCommentSchema } from "@/lib/validation/comment";

export const runtime = "nodejs";

function parseTargetType(raw: string | null) {
  if (
    raw === "post" ||
    raw === "moment" ||
    raw === "board"
  ) {
    return raw;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = parseTargetType(url.searchParams.get("targetType"));
    const targetId = Number.parseInt(url.searchParams.get("targetId") ?? "", 10);
    if (!targetType || !Number.isInteger(targetId) || targetId < 0) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        "需要有效的 targetType 与 targetId",
        400,
      );
    }

    const result = await listApprovedComments({
      targetType,
      targetId,
      page: parsePage(url.searchParams.get("page") ?? undefined),
      pageSize: parsePageSize(url.searchParams.get("pageSize") ?? undefined, 50, 50),
    });
    return jsonPage(result.data, result.total, result.page, result.pageSize);
  } catch (error) {
    return handleAdminError(error, "读取评论失败");
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }

    if (
      body &&
      typeof body === "object" &&
      isHoneypotFilled((body as { honeypot?: unknown }).honeypot)
    ) {
      return jsonData({ ok: true, pending: true });
    }

    const parsed = guestCommentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "评论字段校验失败",
        400,
      );
    }

    const ip = getClientIp(request.headers);
    const limited = rateLimit(`comment:${ip}`, 1, GUEST_COMMENT_WINDOW_MS);
    if (!limited.allowed) {
      return NextResponse.json(
        { code: "RATE_LIMITED", message: "评论过于频繁，请 60 秒后再试" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.ceil(limited.retryAfterMs / 1_000),
            ),
          },
        },
      );
    }

    const result = await submitGuestComment(
      {
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        nickname: parsed.data.nickname,
        email: parsed.data.email,
        content: parsed.data.content,
        parentId: parsed.data.parentId,
      },
      ip,
    );
    return jsonData(result, 201);
  } catch (error) {
    return handleAdminError(error, "提交评论失败");
  }
}
