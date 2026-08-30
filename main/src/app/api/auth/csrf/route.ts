import { NextResponse } from "next/server";

import { issueCsrfToken } from "@/lib/auth/csrf";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = await issueCsrfToken();
    return NextResponse.json(
      { token },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    logger.error("签发 CSRF token 失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "安全令牌签发失败" },
      { status: 500 },
    );
  }
}
