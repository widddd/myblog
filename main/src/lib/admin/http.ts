import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/lib/auth/guard";
import { logger } from "@/lib/utils/logger";

export class AdminHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminHttpError";
  }
}

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonData<T>(data: T, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function jsonPage<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return NextResponse.json(
    { data, total, page, pageSize },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function handleAdminError(error: unknown, fallbackMessage: string) {
  if (error instanceof UnauthorizedError) {
    return jsonError("UNAUTHORIZED", error.message, 401);
  }
  if (error instanceof AdminHttpError) {
    return jsonError(error.code, error.message, error.status);
  }

  logger.error(fallbackMessage, {
    error: error instanceof Error ? error.message : String(error),
  });
  return jsonError("INTERNAL_ERROR", fallbackMessage, 500);
}
