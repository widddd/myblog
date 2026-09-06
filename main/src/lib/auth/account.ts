import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hasPendingCredentialChange } from "@/lib/auth/must-change";
import { createSession } from "@/lib/auth/session";
import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";

export async function getAdminAccount(adminId: number) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, username: true },
  });
  if (!admin) {
    throw new AdminHttpError("NOT_FOUND", "管理员不存在", 404);
  }
  return {
    ...admin,
    mustChangeCredentials: await hasPendingCredentialChange(admin.id),
  };
}

export async function updateAdminAccount(
  adminId: number,
  input: {
    currentPassword: string;
    username?: string;
    newPassword?: string;
  },
) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      username: true,
      passwordHash: true,
    },
  });
  if (!admin) {
    throw new AdminHttpError("NOT_FOUND", "管理员不存在", 404);
  }

  if (!(await verifyPassword(input.currentPassword, admin.passwordHash))) {
    throw new AdminHttpError("INVALID_CREDENTIALS", "当前密码不正确", 401);
  }

  const mustChangeCredentials = await hasPendingCredentialChange(admin.id);
  if (mustChangeCredentials && !input.newPassword) {
    throw new AdminHttpError("VALIDATION_ERROR", "首次使用必须设置新密码", 400);
  }

  if (input.newPassword && input.newPassword === input.currentPassword) {
    throw new AdminHttpError("VALIDATION_ERROR", "新密码不能与当前密码相同", 400);
  }

  const nextUsername = input.username?.trim() || admin.username;
  if (nextUsername !== admin.username) {
    const taken = await prisma.adminUser.findUnique({
      where: { username: nextUsername },
      select: { id: true },
    });
    if (taken) {
      throw new AdminHttpError("CONFLICT", "该用户名已被使用", 409);
    }
  }

  const passwordHash = input.newPassword
    ? await hashPassword(input.newPassword)
    : admin.passwordHash;

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      username: nextUsername,
      passwordHash,
    },
    select: { id: true, username: true },
  });
  try {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { mustChangeCredentials: false },
    });
  } catch {
    // Column may be missing until the backup-secret migration is applied.
  }

  await createSession(updated);
  return { ...updated, mustChangeCredentials: false };
}
