import { prisma } from "@/lib/db";
import { ensureHomeModules } from "@/lib/home/layout";
import { ensurePostPublicIds } from "@/lib/posts/public-id";
import { ensureDefaultSettings } from "@/lib/settings";
import { loadCosSettings } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

async function ensureAdminUser(): Promise<void> {
  if ((await prisma.adminUser.count()) > 0) {
    return;
  }

  logger.warn("尚未创建管理员：打开 /admin/setup 或在 main/ 下执行 pnpm setup");
}

export async function initializeApplication(): Promise<void> {
  await ensureDefaultSettings();
  await ensureAdminUser();
  await ensureHomeModules();
  await ensurePostPublicIds();
  await loadCosSettings();
}
