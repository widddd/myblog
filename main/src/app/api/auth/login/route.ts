import { NextResponse } from "next/server";
import { z } from "zod";

import { issueCsrfToken } from "@/lib/auth/csrf";
import { verifyPasswordAgainstKnownOrDummy } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "请求体必须是有效 JSON" },
        { status: 400 },
      );
    }

    const payload = loginSchema.safeParse(body);

    if (!payload.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "请输入用户名和密码" },
        { status: 400 },
      );
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username: payload.data.username },
      select: { id: true, username: true, passwordHash: true },
    });

    if (
      !(await verifyPasswordAgainstKnownOrDummy(
        payload.data.password,
        admin?.passwordHash,
      ))
    ) {
      return NextResponse.json(
        { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
        { status: 401 },
      );
    }

    if (!admin) {
      return NextResponse.json(
        { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
        { status: 401 },
      );
    }

    await createSession(admin);
    const csrfToken = await issueCsrfToken();

    return NextResponse.json({
      data: { username: admin.username },
      csrfToken,
    });
  } catch (error) {
    logger.error("管理员登录处理失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "登录失败，请稍后重试" },
      { status: 500 },
    );
  }
}
