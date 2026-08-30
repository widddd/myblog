import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { unsealData } from "iron-session";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

import {
  getSession,
  getSessionOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionData,
} from "@/lib/auth/session";

export const CSRF_COOKIE_NAME = "myblog.csrf";

const TOKEN_PATTERN = /^[a-f0-9]{64}\.[a-f0-9]{64}$/;

function signNonce(nonce: string, csrfSecret: string): string {
  return createHmac("sha256", csrfSecret).update(nonce).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyCsrfToken(token: string, csrfSecret: string): boolean {
  if (!TOKEN_PATTERN.test(token)) {
    return false;
  }

  const [nonce, signature] = token.split(".");
  return safeEqual(signature, signNonce(nonce, csrfSecret));
}

export async function issueCsrfToken(): Promise<string> {
  const session = await getSession();

  if (!session.csrfSecret) {
    session.csrfSecret = randomBytes(32).toString("hex");
    await session.save();
  }

  const nonce = randomBytes(32).toString("hex");
  const token = `${nonce}.${signNonce(nonce, session.csrfSecret)}`;
  const cookieStore = await cookies();

  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return token;
}

export async function clearCsrfCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_COOKIE_NAME);
}

export async function verifyCsrfRequest(
  request: NextRequest,
): Promise<boolean> {
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const sealedSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (
    !headerToken ||
    !cookieToken ||
    !sealedSession ||
    !safeEqual(headerToken, cookieToken)
  ) {
    return false;
  }

  try {
    const options = getSessionOptions();
    const session = await unsealData<SessionData>(sealedSession, {
      password: options.password,
      ttl: options.ttl,
    });

    return Boolean(
      session.csrfSecret &&
        verifyCsrfToken(headerToken, session.csrfSecret),
    );
  } catch {
    return false;
  }
}
