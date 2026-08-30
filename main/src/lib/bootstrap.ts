import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { ensureDefaultSettings } from "@/lib/settings";
import { logger } from "@/lib/utils/logger";

async function ensureAdminUser(): Promise<void> {
  if ((await prisma.adminUser.count()) > 0) {
    return;
  }

  const password = process.env.ADMIN_INIT_PASSWORD?.trim();
  const username = process.env.ADMIN_USERNAME?.trim() || "admin";

  if (!password) {
    logger.warn(
      "尚未创建管理员：请配置 ADMIN_INIT_PASSWORD 后重新启动应用",
    );
    return;
  }

  if (password.length < 8) {
    throw new Error("ADMIN_INIT_PASSWORD 必须至少包含 8 个字符");
  }

  const passwordHash = await hashPassword(password);

  try {
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
      },
    });
    logger.info("首启管理员已创建", { username });
  } catch (error) {
    if ((await prisma.adminUser.count()) === 0) {
      throw error;
    }
    logger.info("管理员已由另一个初始化任务创建");
  }
}

export async function initializeApplication(): Promise<void> {
  await ensureDefaultSettings();
  await ensureAdminUser();
}
