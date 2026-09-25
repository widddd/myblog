import { z } from "zod";

import { AUTHOR_NAME_MAX } from "@/lib/posts/author";

export const accountPutSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    username: z.string().trim().min(2).max(64).optional(),
    newPassword: z.string().min(8).max(256).optional(),
    // 默认笔名（新文章的作者默认取它）；允许空串 = 清掉
    penName: z.string().trim().max(AUTHOR_NAME_MAX).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.username || value.newPassword) || value.penName !== undefined,
    { message: "请至少修改笔名、用户名或密码" },
  );
