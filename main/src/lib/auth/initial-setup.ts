import { AdminHttpError } from "@/lib/admin/http";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { ensureHomeModules, setBannerSubtitle } from "@/lib/home/layout";
import { toDatetimeLocalValue } from "@/lib/home/uptime";
import { ensureDefaultSettings, setSetting } from "@/lib/settings";
import type {
  AdminRecoveryInput,
  InitialSetupInput,
} from "@/lib/validation/setup";

type SetupLockState = {
  lock?: Promise<void>;
};

const globalForInitialSetup = globalThis as typeof globalThis & {
  myblogInitialSetupState?: SetupLockState;
};

async function withSetupLock<T>(operation: () => Promise<T>): Promise<T> {
  const state = globalForInitialSetup.myblogInitialSetupState ?? {};
  globalForInitialSetup.myblogInitialSetupState = state;
  const previous = state.lock ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.lock = current;
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (state.lock === current) {
      delete state.lock;
    }
  }
}

export async function hasAdminUser(): Promise<boolean> {
  return (await prisma.adminUser.count()) > 0;
}

export async function runInitialSetup(input: InitialSetupInput): Promise<void> {
  return withSetupLock(async () => {
    if (await hasAdminUser()) {
      throw new AdminHttpError("SETUP_EXISTS", "站点已经创建过管理员，请直接登录", 409);
    }
    await ensureDefaultSettings();
    await ensureHomeModules();

    await prisma.adminUser.create({
      data: {
        username: input.username,
        passwordHash: await hashPassword(input.password),
        mustChangeCredentials: false,
      },
    });

    await setSetting("siteName", input.siteName);
    if (input.siteUrl) {
      await setSetting("siteUrl", input.siteUrl);
    }
    await setSetting("siteStartedAt", toDatetimeLocalValue(new Date().toISOString()));
    await setBannerSubtitle(input.subtitle);
  });
}

export async function createAdminForExistingSite(
  input: AdminRecoveryInput,
): Promise<void> {
  return withSetupLock(async () => {
    if (await hasAdminUser()) {
      throw new AdminHttpError("SETUP_EXISTS", "站点已经创建过管理员，请直接登录", 409);
    }

    await prisma.adminUser.create({
      data: {
        username: input.username,
        passwordHash: await hashPassword(input.password),
        mustChangeCredentials: false,
      },
    });
  });
}
