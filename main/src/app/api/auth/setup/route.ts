import { NextResponse } from "next/server";

import { runInitialSetup } from "@/lib/auth/initial-setup";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import { initialSetupSchema } from "@/lib/validation/setup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }

    const parsed = initialSetupSchema.safeParse(body);
    if (!parsed.success) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "请确认创建信息",
        400,
      );
    }

    await runInitialSetup(parsed.data);
    return jsonData({ ok: true });
  } catch (error) {
    if (error instanceof AdminHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return handleAdminError(error, "创建站点失败");
  }
}
