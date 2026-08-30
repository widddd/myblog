export const COMMENT_TARGET_TYPES = ["post", "moment", "board"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];

export const COMMENT_STATUSES = ["pending", "approved"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export type PublicComment = {
  id: number;
  nickname: string;
  content: string;
  isAdmin: boolean;
  createdAt: string;
  replies: PublicComment[];
};

export type AdminCommentView = {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  targetLabel: string;
  nickname: string;
  email: string | null;
  content: string;
  parentId: number | null;
  status: CommentStatus;
  isAdmin: boolean;
  ip: string | null;
  createdAt: string;
};
