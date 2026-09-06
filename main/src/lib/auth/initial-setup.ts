import { AdminHttpError } from "@/lib/admin/http";
import { hashPassword } from "@/lib/auth/password";
import {
  createHostSecretFromPassphrase,
  hostSecretExists,
} from "@/lib/backup/host-secret";
import { prisma } from "@/lib/db";
import { ensureHomeModules, setBannerSubtitle } from "@/lib/home/layout";
import { toDatetimeLocalValue } from "@/lib/home/uptime";
import { ensureDefaultSettings, setSetting } from "@/lib/settings";
import type { InitialSetupInput } from "@/lib/validation/setup";

export async function hasAdminUser(): Promise<boolean> {
  return (await prisma.adminUser.count()) > 0;
}

export async function runInitialSetup(input: InitialSetupInput): Promise<void> {
  if (await hasAdminUser()) {
    throw new AdminHttpError("SETUP_EXISTS", "站点已经创建过管理员，请直接登录", 409);
  }
  if (await hostSecretExists()) {
    throw new AdminHttpError(
      "SETUP_EXISTS",
      "备份口令已设定。请用 pnpm setup 补设管理员，或登录后台",
      409,
    );
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

  await createHostSecretFromPassphrase(input.passphrase);
  await setSetting("siteName", input.siteName);
  if (input.siteUrl) {
    await setSetting("siteUrl", input.siteUrl);
  }
  await setSetting("siteStartedAt", toDatetimeLocalValue(new Date().toISOString()));
  await setBannerSubtitle(input.subtitle);
}
