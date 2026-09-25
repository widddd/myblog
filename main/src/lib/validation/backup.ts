import { z } from "zod";

import { isManagedBackupFileName } from "@/lib/backup/filename";

export const restorePostSchema = z.object({
  name: z.string().refine(isManagedBackupFileName, "备份文件名不合法"),
  confirm: z.literal(true),
  passphrase: z.string().trim().min(8, "备份口令至少 8 个字符").max(128, "备份口令过长"),
});

export const backupRunPostSchema = z.object({
  passphrase: z.string().trim().min(8, "备份口令至少 8 个字符").max(128, "备份口令过长"),
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
