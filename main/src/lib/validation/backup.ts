import { z } from "zod";

import { isManagedBackupFileName } from "@/lib/backup/filename";

/**
 * 备份口令是**可选**的：不加密的备份与恢复根本不带口令——客户端在没有口令时
 * 会把整个字段省掉（`JSON.stringify({ passphrase: undefined })` 会丢掉这个键），
 * run 路由的注释也写着「空 body 对非加密备份是合法的」。
 *
 * 所以这里不能写成必填的 `z.string()`：那会让「非加密备份」必然 400，而且报的是
 * Zod 默认的 `Invalid input: expected string, received undefined`，用户看不懂
 * （2026-10-01 实测）。空串 / 纯空白同样按「没给」处理。
 */
const optionalPassphrase = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(8, "备份口令至少 8 个字符")
    .max(128, "备份口令过长")
    .optional(),
);

export const restorePostSchema = z.object({
  name: z.string().refine(isManagedBackupFileName, "备份文件名不合法"),
  confirm: z.literal(true),
  passphrase: optionalPassphrase,
});

export const backupRunPostSchema = z.object({
  passphrase: optionalPassphrase,
});

export const restorePutSchema = z.union([
  z.object({ restartNow: z.literal(true) }),
  z.object({
    restartAt: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), "重启时间不合法"),
  }),
]);

export const backupEncryptPutSchema = z.object({
  enabled: z.boolean(),
});
