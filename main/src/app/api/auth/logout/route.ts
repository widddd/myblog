import { NextResponse } from "next/server";

import { clearCsrfCookie } from "@/lib/auth/csrf";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  await destroySession();
  await clearCsrfCookie();

  return NextResponse.json({ data: { loggedOut: true } });
}
