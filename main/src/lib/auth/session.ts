import { randomBytes } from "node:crypto";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "myblog.session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionData = {
  isLoggedIn?: boolean;
  adminId?: number;
  username?: string;
  csrfSecret?: string;
};

export type AuthenticatedSession = SessionData & {
  isLoggedIn: true;
  adminId: number;
  username: string;
};

export function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET?.trim();

  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET 必须至少包含 32 个字符");
  }

  return {
    cookieName: SESSION_COOKIE_NAME,
    password,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export function isAuthenticatedSession(
  session: SessionData,
): session is AuthenticatedSession {
  return (
    session.isLoggedIn === true &&
    Number.isInteger(session.adminId) &&
    typeof session.username === "string" &&
    session.username.length > 0
  );
}

export async function createSession(admin: {
  id: number;
  username: string;
}): Promise<void> {
  const session = await getSession();
  session.isLoggedIn = true;
  session.adminId = admin.id;
  session.username = admin.username;
  session.csrfSecret = randomBytes(32).toString("hex");
  await session.save();
}

export async function destroySession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
