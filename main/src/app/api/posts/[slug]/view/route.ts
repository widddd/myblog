import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/auth/rateLimit";
import { prisma } from "@/lib/db";
import { findPublishedPostByRef } from "@/lib/posts/query";
import { getClientIp } from "@/lib/utils/fingerprint";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";

const VIEW_WINDOW_MS = 60_000;

type ViewRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: ViewRouteContext) {
  try {
    const { slug } = await context.params;
    const post = await findPublishedPostByRef(slug);
    if (!post) {
      return NextResponse.json(
        { code: "POST_NOT_FOUND", message: "文章不存在" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const ip = getClientIp(request.headers);
    const result = rateLimit(`post-view:${ip}:${post.publicId}`, 1, VIEW_WINDOW_MS);
    if (!result.allowed) {
      return NextResponse.json(
        { data: { views: post.views, counted: false } },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return NextResponse.json(
      { data: { views: updated.views, counted: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("记录文章浏览量失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "记录浏览量失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
