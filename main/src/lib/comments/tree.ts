import type { PublicComment } from "./types";

export type CommentTreeRow = {
  id: number;
  nickname: string;
  content: string;
  isAdmin: boolean;
  createdAt: Date | string;
  parentId: number | null;
};

function toPublicComment(
  row: CommentTreeRow,
  replies: PublicComment[] = [],
): PublicComment {
  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    isAdmin: row.isAdmin,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : row.createdAt,
    replies,
  };
}

/** 两级树：仅顶层评论带 replies；更深的 parentId 丢弃（不渲染）。 */
export function buildCommentTree(rows: CommentTreeRow[]): PublicComment[] {
  const byId = new Map<number, CommentTreeRow>();
  for (const row of rows) {
    byId.set(row.id, row);
  }

  const children = new Map<number, CommentTreeRow[]>();
  const roots: CommentTreeRow[] = [];

  for (const row of rows) {
    if (row.parentId == null) {
      roots.push(row);
      continue;
    }
    const parent = byId.get(row.parentId);
    if (!parent || parent.parentId != null) {
      continue;
    }
    const list = children.get(row.parentId) ?? [];
    list.push(row);
    children.set(row.parentId, list);
  }

  return roots.map((root) =>
    toPublicComment(
      root,
      (children.get(root.id) ?? []).map((child) => toPublicComment(child)),
    ),
  );
}

export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
