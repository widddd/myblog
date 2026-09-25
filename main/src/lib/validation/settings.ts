import { z } from "zod";

import { ADMIN_ACCENT_KEYS } from "@/lib/admin/accents";
import { resolveDashboardCards } from "@/lib/admin/dashboard-cards";
import type { SettingKey } from "@/lib/settings";

export const WRITABLE_SETTING_KEYS = [
  "siteName",
  "announcement",
  "banner",
  "pageSize",
  "backupPeriodDays",
  "backupKeep",
  "uploadMaxSizeMB",
  "homeModuleOpacity",
  "homeBackdropOpacity",
  "siteUrl",
  "siteStartedAt",
  "updateGithubRepo",
  "cosBucket",
  "cosRegion",
  "cosSecretId",
  "cosSecretKey",
  "cosPublicBaseUrl",
  "thumbMaxPx",
  "thumb2MaxPx",
  "backupLocalMaxMB",
  "localMediaMaxMB",
  "adminAccent",
  "dashboardCards",
] as const satisfies readonly Exclude<SettingKey, "lastBackupAt">[];

export type WritableSettingKey = (typeof WRITABLE_SETTING_KEYS)[number];

export const settingsPutSchema = z
  .object({
    siteName: z.string().trim().min(1).max(80),
    announcement: z.string().max(500),
    banner: z.string().max(500),
    pageSize: z.number().int().min(1).max(50),
    homeModuleOpacity: z.number().int().min(0).max(100),
    homeBackdropOpacity: z.number().int().min(0).max(100),
    siteUrl: z
      .string()
      .max(200)
      .refine((value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return true;
        }
        try {
          const url = new URL(trimmed);
          if (url.protocol === "https:") {
            return true;
          }
          return (
            url.protocol === "http:" &&
            (url.hostname === "localhost" || url.hostname === "127.0.0.1")
          );
        } catch {
          return false;
        }
      }, "站点地址须为 https，或本机 http://localhost"),
    updateGithubRepo: z
      .string()
      .max(200)
      .refine((value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return true;
        }
        if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(trimmed)) {
          return true;
        }
        try {
          const url = new URL(trimmed);
          return url.hostname === "github.com" || url.hostname === "www.github.com";
        } catch {
          return false;
        }
      }, "GitHub 仓库须为 owner/repo 或 https://github.com/owner/repo"),
    siteStartedAt: z
      .string()
      .max(32)
      .refine((value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return true;
        }
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed);
      }, "开始时间须为本地日期时间，或留空"),
    backupPeriodDays: z.number().int().min(1).max(365),
    backupKeep: z.number().int().min(1).max(30),
    backupLocalMaxMB: z.number().int().min(64).max(10240),
    localMediaMaxMB: z.number().int().min(64).max(10240),
    uploadMaxSizeMB: z.number().int().min(1).max(50),
    thumbMaxPx: z.number().int().min(128).max(1280),
    thumb2MaxPx: z.number().int().min(128).max(640),
    cosBucket: z.string().trim().max(80),
    cosRegion: z.string().trim().max(40),
    cosSecretId: z.string().trim().max(128),
    cosSecretKey: z.string().max(200),
    cosPublicBaseUrl: z
      .string()
      .max(300)
      .refine((value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return true;
        }
        try {
          return new URL(trimmed).protocol === "https:";
        } catch {
          return false;
        }
      }, "COS 访问域名须为 https"),
    adminAccent: z.enum(ADMIN_ACCENT_KEYS),
    // 未知卡片键丢弃、缺键补默认 true、非布尔值按默认，落库前归一化
    dashboardCards: z
      .record(z.string(), z.unknown())
      .transform((value) => resolveDashboardCards(value)),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个设置项",
  });

export function isWritableSettingKey(key: string): key is WritableSettingKey {
  return (WRITABLE_SETTING_KEYS as readonly string[]).includes(key);
}

