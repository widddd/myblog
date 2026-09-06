import { z } from "zod";

export const accountPutSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    username: z.string().trim().min(2).max(64).optional(),
    newPassword: z.string().min(8).max(256).optional(),
  })
  .refine((value) => Boolean(value.username || value.newPassword), {
    message: "请至少修改用户名或密码",
  });
