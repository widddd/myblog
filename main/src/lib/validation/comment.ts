import { z } from "zod";

import { COMMENT_TARGET_TYPES } from "@/lib/comments/types";

const optionalEmail = z
  .string()
  .trim()
  .max(120)
  .optional()
  .nullable()
  .refine(
    (value) =>
      value == null ||
      value.length === 0 ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "邮箱格式不正确",
  )
  .transform((value) => (value && value.length > 0 ? value : null));

export const guestCommentSchema = z.object({
  targetType: z.enum(COMMENT_TARGET_TYPES),
  targetId: z.number().int().min(0),
  nickname: z.string().trim().min(1, "请填写昵称").max(32, "昵称最多 32 字"),
  email: optionalEmail,
  content: z.string().trim().min(1, "请填写评论").max(1000, "评论最多 1000 字"),
  parentId: z.number().int().positive().optional().nullable(),
  honeypot: z.string().optional(),
});

export const adminCommentReplySchema = z.object({
  targetType: z.enum(COMMENT_TARGET_TYPES),
  targetId: z.number().int().min(0),
  content: z.string().trim().min(1, "请填写回复").max(1000, "回复最多 1000 字"),
  parentId: z.number().int().positive().optional().nullable(),
});

export const adminCommentPatchSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});
