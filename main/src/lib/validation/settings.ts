import { z } from "zod";

import type { SettingKey } from "@/lib/settings";

export const WRITABLE_SETTING_KEYS = [
  "siteName",
  "announcement",
  "banner",
  "pageSize",
  "backupPeriodDays",
  "backupKeep",
  "uploadMaxSizeMB",
] as const satisfies readonly Exclude<SettingKey, "lastBackupAt">[];

export type WritableSettingKey = (typeof WRITABLE_SETTING_KEYS)[number];

export const settingsPutSchema = z
  .object({
    siteName: z.string().trim().min(1).max(80),
    announcement: z.string().max(500),
    banner: z.string().max(500),
    pageSize: z.number().int().min(1).max(50),
    backupPeriodDays: z.number().int().min(1).max(365),
    backupKeep: z.number().int().min(1).max(30),
    uploadMaxSizeMB: z.number().int().min(1).max(50),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个设置项",
  });

export function isWritableSettingKey(key: string): key is WritableSettingKey {
  return (WRITABLE_SETTING_KEYS as readonly string[]).includes(key);
}

