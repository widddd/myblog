import { z } from "zod";

export const initialSetupSchema = z
  .object({
    siteName: z.string().trim().min(1, "请填写站点名称").max(80, "站点名称过长"),
    siteUrl: z
      .string()
      .max(200)
      .optional()
      .transform((value) => value?.trim() ?? ""),
    subtitle: z
      .string()
      .max(200)
      .optional()
      .transform((value) => value?.trim() ?? ""),
    username: z.string().trim().min(1, "请填写管理员用户名").max(64),
    password: z.string().min(8, "密码至少 8 个字符").max(256),
    passwordConfirm: z.string().min(1, "请再输入一次密码"),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.passwordConfirm) {
      ctx.addIssue({
        code: "custom",
        message: "两次输入的密码不一致",
        path: ["passwordConfirm"],
      });
    }
    const url = value.siteUrl;
    if (url) {
      try {
        const parsed = new URL(url);
        const ok =
          parsed.protocol === "https:" ||
          (parsed.protocol === "http:" &&
            (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"));
        if (!ok) {
          ctx.addIssue({
            code: "custom",
            message: "站点地址须为 https，或本机 http://localhost",
            path: ["siteUrl"],
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "站点地址须为 https，或本机 http://localhost",
          path: ["siteUrl"],
        });
      }
    }
  });

export const adminRecoverySchema = z
  .object({
    username: z.string().trim().min(1, "请填写管理员用户名").max(64, "管理员用户名过长"),
    password: z.string().min(8, "密码至少 8 个字符").max(256, "密码过长"),
    passwordConfirm: z.string().min(1, "请再输入一次密码"),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.passwordConfirm) {
      ctx.addIssue({
        code: "custom",
        message: "两次输入的密码不一致",
        path: ["passwordConfirm"],
      });
    }
  });

export type InitialSetupInput = z.infer<typeof initialSetupSchema>;
export type AdminRecoveryInput = z.infer<typeof adminRecoverySchema>;
