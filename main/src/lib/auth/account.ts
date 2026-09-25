import { revalidateTag } from "next/cache";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hasPendingCredentialChange } from "@/lib/auth/must-change";
import { createSession } from "@/lib/auth/session";
import { AdminHttpError } from "@/lib/admin/http";
import { revalidatePublicContent } from "@/lib/admin/revalidate";
import { PUBLIC_CACHE_TAGS } from "@/lib/cache/public";
import { prisma } from "@/lib/db";

export async function findAdminAccount(adminId: number) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { id: true, username: true, penName: true },
  });
  if (!admin) {
    return null;
  }
  return {
    ...admin,
    penName: admin.penName ?? "",
    mustChangeCredentials: await hasPendingCredentialChange(admin.id),
  };
}

/**
 * 管理员账号上的默认笔名：新文章的作者默认取它，文章自己没填作者时前台也显示它。
 * 不加缓存 —— 需要缓存的公开读路径（`lib/posts/query.ts`）把这次查询放在自己的
 * `cachedPublic(...)` 里，改笔名时 `updateAdminAccount()` 会 revalidate 那个 tag。
 */
export async function readDefaultPenName(): Promise<string> {
  const admin = await prisma.adminUser.findFirst({
    orderBy: { id: "asc" },
    select: { penName: true },
  });
  return admin?.penName?.trim() ?? "";
}

export async function getAdminAccount(adminId: number) {
  const admin = await findAdminAccount(adminId);
  if (!admin) {
    throw new AdminHttpError("NOT_FOUND", "管理员不存在", 404);
  }
  return admin;
}

export async function updateAdminAccount(
  adminId: number,
  input: {
    currentPassword: string;
    username?: string;
    newPassword?: string;
    penName?: string;
  },
) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      username: true,
      penName: true,
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

  // 笔名留空 = 清掉默认笔名（文章各自填的作者不受影响）
  const nextPenName =
    input.penName === undefined ? admin.penName : input.penName.trim() || null;

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      username: nextUsername,
      penName: nextPenName,
      passwordHash,
    },
    select: { id: true, username: true, penName: true },
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
  // 默认笔名变了，前台所有「没单独填作者」的文章都要跟着换署名
  if (admin.penName !== nextPenName) {
    revalidatePublicContent();
    // 再补一刀"立即过期"：revalidateTag(tag, "max") 的语义是"先给旧值、后台再重算"，
    // 实测第一次请求仍会渲染旧署名（P-089）；默认笔名影响每一篇文章页，必须立刻生效。
    // 注意：Next 16 的 updateTag() 在 Route Handler 里会直接抛错（源码写死只允许 Server Action），
    // 所以这里用内联 profile { expire: 0 } 表达"立即过期"。
    revalidateTag(PUBLIC_CACHE_TAGS.posts, { expire: 0 });
  }
  return { ...updated, penName: updated.penName ?? "", mustChangeCredentials: false };
}
