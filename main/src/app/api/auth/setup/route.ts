import { NextResponse } from "next/server";

import {
  createAdminForExistingSite,
  hasAdminUser,
  runInitialSetup,
} from "@/lib/auth/initial-setup";
import { destroySession } from "@/lib/auth/session";
import { hostSecretExists } from "@/lib/backup/host-secret";
import { AdminHttpError, handleAdminError, jsonData } from "@/lib/admin/http";
import {
  adminRecoverySchema,
  initialSetupSchema,
} from "@/lib/validation/setup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AdminHttpError("VALIDATION_ERROR", "请求体必须是有效 JSON", 400);
    }

    if (await hasAdminUser()) {
      throw new AdminHttpError("SETUP_EXISTS", "站点已经创建过管理员，请直接登录", 409);
    }

    if (await hostSecretExists()) {
      const parsed = adminRecoverySchema.safeParse(body);
      if (!parsed.success) {
        throw new AdminHttpError(
          "VALIDATION_ERROR",
          parsed.error.issues[0]?.message ?? "请确认管理员信息",
          400,
        );
      }
      await createAdminForExistingSite(parsed.data);
    } else {
      const parsed = initialSetupSchema.safeParse(body);
      if (!parsed.success) {
        throw new AdminHttpError(
          "VALIDATION_ERROR",
          parsed.error.issues[0]?.message ?? "请确认创建信息",
          400,
        );
      }
      await runInitialSetup(parsed.data);
    }
    await destroySession();
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
