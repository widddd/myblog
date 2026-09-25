import { findAdminAccount } from "@/lib/auth/account";
import { hasPendingCredentialChange } from "@/lib/auth/must-change";
import {
  destroySession,
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

export class CredentialsChangeRequiredError extends Error {
  readonly status = 403;
  readonly code = "CREDENTIALS_CHANGE_REQUIRED";

  constructor() {
    super("请先修改初始账号密码");
    this.name = "CredentialsChangeRequiredError";
  }
}

export type RequireAdminOptions = {
  allowMustChange?: boolean;
};

export async function requireAdmin(
  options: RequireAdminOptions = {},
): Promise<AuthenticatedSession> {
  const session = await getSession();

  if (!isAuthenticatedSession(session)) {
    throw new UnauthorizedError();
  }

  if (!(await findAdminAccount(session.adminId))) {
    await destroySession();
    throw new UnauthorizedError();
  }

  if (
    !options.allowMustChange &&
    (await hasPendingCredentialChange(session.adminId))
  ) {
    throw new CredentialsChangeRequiredError();
  }

  return session;
}
