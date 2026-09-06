import { revalidatePath } from "next/cache";

import { AdminHttpError } from "@/lib/admin/http";
import { prisma } from "@/lib/db";
import { postHref } from "@/lib/posts/path";
import { publishedWhere } from "@/lib/posts/query";
import { isPostUnlocked } from "@/lib/posts/unlock";
import { parsePage, parsePageSize } from "@/lib/utils/page";
import {
  type AdminCommentView,
  type CommentStatus,
  type CommentTargetType,
  type PublicComment,
} from "@/lib/comments/types";
import { buildCommentTree, isHoneypotFilled } from "@/lib/comments/tree";

const COMMENT_RATE_WINDOW_MS = 60_000;

export { isHoneypotFilled };

type GuestCommentInput = {
  targetType: CommentTargetType;
  targetId: number;
  nickname: string;
  email: string | null;
  content: string;
  parentId?: number | null;
};

async function assertTargetExists(
  targetType: CommentTargetType,
  targetId: number,
) {
  if (targetType === "board") {
    if (targetId !== 0) {
      throw new AdminHttpError(
        "VALIDATION_ERROR",
        "留言板 targetId 必须为 0",
        400,
      );
    }
    return;
  }

  if (targetId < 1) {
    throw new AdminHttpError("VALIDATION_ERROR", "无效的评论对象", 400);
  }

  if (targetType === "post") {
    const post = await prisma.post.findFirst({
      where: { id: targetId, ...publishedWhere() },
      select: { id: true, slug: true, publicId: true, passwordHash: true },
    });
    if (!post) {
      throw new AdminHttpError("NOT_FOUND", "文章不存在或未发布", 404);
    }
    return;
  }

  const moment = await prisma.moment.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!moment) {
    throw new AdminHttpError("NOT_FOUND", "瞬间不存在", 404);
  }
}

async function assertParent(
  parentId: number | null | undefined,
  targetType: CommentTargetType,
  targetId: number,
) {
  if (parentId == null) {
    return null;
  }

  const parent = await prisma.comment.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      parentId: true,
      targetType: true,
      targetId: true,
    },
  });

  if (!parent) {
    throw new AdminHttpError("NOT_FOUND", "父评论不存在", 404);
  }
  if (parent.parentId != null) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      "评论只支持两级嵌套",
      400,
    );
  }
  if (parent.targetType !== targetType || parent.targetId !== targetId) {
    throw new AdminHttpError(
      "VALIDATION_ERROR",
      "回复必须属于同一评论对象",
      400,
    );
  }
  return parent;
}

async function canReadPostComments(postId: number): Promise<boolean> {
  const post = await prisma.post.findFirst({
    where: { id: postId, ...publishedWhere() },
    select: { publicId: true, passwordHash: true },
  });
  if (!post) {
    return false;
  }
  if (post.passwordHash && !(await isPostUnlocked(post.publicId))) {
    return false;
  }
  return true;
}

async function revalidateCommentTarget(
  targetType: CommentTargetType,
  targetId: number,
) {
  if (targetType === "board") {
    revalidatePath("/messages");
    return;
  }
  if (targetType === "moment") {
    revalidatePath("/moments");
    return;
  }
  const post = await prisma.post.findUnique({
    where: { id: targetId },
    select: { slug: true, publicId: true },
  });
  if (post) {
    revalidatePath(`/posts/${post.slug}`);
    revalidatePath(postHref(post));
  }
}

export async function listApprovedComments(options: {
  targetType: CommentTargetType;
  targetId: number;
  page?: number;
  pageSize?: number;
}): Promise<{
  data: PublicComment[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = parsePage(String(options.page ?? 1));
  const pageSize = parsePageSize(String(options.pageSize ?? 50), 50, 50);

  if (
    options.targetType === "post" &&
    !(await canReadPostComments(options.targetId))
  ) {
    return { data: [], total: 0, page, pageSize };
  }

  const where = {
    targetType: options.targetType,
    targetId: options.targetId,
    status: "approved",
    parentId: null as null,
  };

  const [total, roots] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nickname: true,
        content: true,
        isAdmin: true,
        createdAt: true,
        parentId: true,
      },
    }),
  ]);

  const rootIds = roots.map((row) => row.id);
  const replies =
    rootIds.length === 0
      ? []
      : await prisma.comment.findMany({
          where: {
            parentId: { in: rootIds },
            status: "approved",
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nickname: true,
            content: true,
            isAdmin: true,
            createdAt: true,
            parentId: true,
          },
        });

  return {
    data: buildCommentTree([...roots, ...replies]),
    total,
    page,
    pageSize,
  };
}

export async function submitGuestComment(
  input: GuestCommentInput,
  ip: string,
): Promise<{ ok: true; pending: true }> {
  await assertTargetExists(input.targetType, input.targetId);
  if (
    input.targetType === "post" &&
    !(await canReadPostComments(input.targetId))
  ) {
    throw new AdminHttpError("LOCKED", "请先解锁文章后再发表评论", 401);
  }
  await assertParent(input.parentId, input.targetType, input.targetId);

  await prisma.comment.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      nickname: input.nickname,
      email: input.email,
      content: input.content,
      parentId: input.parentId ?? null,
      status: "pending",
      isAdmin: false,
      ip: ip.slice(0, 64),
    },
  });

  return { ok: true, pending: true };
}

export const GUEST_COMMENT_WINDOW_MS = COMMENT_RATE_WINDOW_MS;

async function loadTargetLabels(
  rows: Array<{ targetType: string; targetId: number }>,
): Promise<Map<string, string>> {
  const postIds = [
    ...new Set(
      rows
        .filter((row) => row.targetType === "post")
        .map((row) => row.targetId),
    ),
  ];
  const momentIds = [
    ...new Set(
      rows
        .filter((row) => row.targetType === "moment")
        .map((row) => row.targetId),
    ),
  ];

  const [posts, moments] = await Promise.all([
    postIds.length === 0
      ? []
      : prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true },
        }),
    momentIds.length === 0
      ? []
      : prisma.moment.findMany({
          where: { id: { in: momentIds } },
          select: { id: true, content: true },
        }),
  ]);

  const labels = new Map<string, string>();
  for (const post of posts) {
    labels.set(`post:${post.id}`, `文章 · ${post.title}`);
  }
  for (const moment of moments) {
    const snippet = moment.content.replace(/\s+/g, " ").slice(0, 24);
    labels.set(
      `moment:${moment.id}`,
      snippet ? `瞬间 · ${snippet}` : `瞬间 #${moment.id}`,
    );
  }
  return labels;
}

function toAdminView(
  row: {
    id: number;
    targetType: string;
    targetId: number;
    nickname: string;
    email: string | null;
    content: string;
    parentId: number | null;
    status: string;
    isAdmin: boolean;
    ip: string | null;
    createdAt: Date;
  },
  labels: Map<string, string>,
): AdminCommentView {
  const targetType = row.targetType as CommentTargetType;
  const targetLabel =
    targetType === "board"
      ? "留言板"
      : (labels.get(`${targetType}:${row.targetId}`) ??
        `${targetType} #${row.targetId}`);

  return {
    id: row.id,
    targetType,
    targetId: row.targetId,
    targetLabel,
    nickname: row.nickname,
    email: row.email,
    content: row.content,
    parentId: row.parentId,
    status: row.status as CommentStatus,
    isAdmin: row.isAdmin,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAdminComments(options: {
  status?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = parsePage(String(options.page ?? 1));
  const pageSize = parsePageSize(String(options.pageSize ?? 20));
  const status =
    options.status === "pending" || options.status === "approved"
      ? options.status
      : undefined;
  const targetType =
    options.targetType === "post" ||
    options.targetType === "moment" ||
    options.targetType === "board"
      ? options.targetType
      : undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(targetType ? { targetType } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const labels = await loadTargetLabels(rows);
  return {
    data: rows.map((row) => toAdminView(row, labels)),
    total,
    page,
    pageSize,
  };
}

export async function replyAsAdmin(input: {
  targetType: CommentTargetType;
  targetId: number;
  content: string;
  parentId?: number | null;
  nickname: string;
}) {
  await assertTargetExists(input.targetType, input.targetId);
  await assertParent(input.parentId, input.targetType, input.targetId);

  const created = await prisma.comment.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      nickname: input.nickname,
      content: input.content,
      parentId: input.parentId ?? null,
      status: "approved",
      isAdmin: true,
    },
  });

  await revalidateCommentTarget(input.targetType, input.targetId);
  const labels = await loadTargetLabels([created]);
  return toAdminView(created, labels);
}

export async function moderateComment(
  id: number,
  status: "approved" | "rejected",
) {
  const current = await prisma.comment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      targetType: true,
      targetId: true,
    },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "评论不存在", 404);
  }

  if (status === "rejected") {
    await prisma.comment.delete({ where: { id } });
    await revalidateCommentTarget(
      current.targetType as CommentTargetType,
      current.targetId,
    );
    return { ok: true, deleted: true };
  }

  if (current.status === "approved") {
    return { ok: true, deleted: false };
  }

  await prisma.comment.update({
    where: { id },
    data: { status: "approved" },
  });
  await revalidateCommentTarget(
    current.targetType as CommentTargetType,
    current.targetId,
  );
  return { ok: true, deleted: false };
}

export async function deleteComment(id: number) {
  const current = await prisma.comment.findUnique({
    where: { id },
    select: { id: true, targetType: true, targetId: true },
  });
  if (!current) {
    throw new AdminHttpError("NOT_FOUND", "评论不存在", 404);
  }

  await prisma.comment.delete({ where: { id } });
  await revalidateCommentTarget(
    current.targetType as CommentTargetType,
    current.targetId,
  );
  return { ok: true };
}

export async function countPendingComments() {
  return prisma.comment.count({ where: { status: "pending" } });
}
