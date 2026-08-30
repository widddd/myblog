import {
  getSession,
  isAuthenticatedSession,
  type AuthenticatedSession,
} from "@/lib/auth/session";

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor() {
    super("请先登录");
    this.name = "UnauthorizedError";
  }
}

export async function requireAdmin(): Promise<AuthenticatedSession> {
  const session = await getSession();

  if (!isAuthenticatedSession(session)) {
    throw new UnauthorizedError();
  }

  return session;
}
