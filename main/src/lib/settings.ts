import {
  DEFAULT_ADMIN_ACCENT,
  resolveAdminAccent,
  type AdminAccentKey,
} from "@/lib/admin/accents";
import {
  DEFAULT_DASHBOARD_CARDS,
  resolveDashboardCards,
  type DashboardCards,
} from "@/lib/admin/dashboard-cards";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/utils/logger";

export const DEFAULT_SETTINGS = {
  siteName: "",
  announcement: "",
  banner: "",
  pageSize: 10,
  backupPeriodDays: 3,
  backupKeep: 5,
  uploadMaxSizeMB: 10,
  homeModuleOpacity: 32,
  homeBackdropOpacity: 100,
  siteUrl: "",
  siteStartedAt: "",
  lastBackupAt: null,
  updateGithubRepo: "",
  cosBucket: "",
  cosRegion: "",
  cosSecretId: "",
  cosSecretKey: "",
  cosPublicBaseUrl: "",
  thumbMaxPx: 480,
  thumb2MaxPx: 320,
  backupLocalMaxMB: 512,
  localMediaMaxMB: 512,
  adminAccent: DEFAULT_ADMIN_ACCENT,
  dashboardCards: DEFAULT_DASHBOARD_CARDS,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

type CacheEntry = {
  rawValue: string | null;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 64;

const globalForSettings = globalThis as typeof globalThis & {
  myblogSettingCache?: Map<string, CacheEntry>;
};

const cache =
  globalForSettings.myblogSettingCache ?? new Map<string, CacheEntry>();

if (process.env.NODE_ENV !== "production") {
  globalForSettings.myblogSettingCache = cache;
}

function setCache(key: string, rawValue: string | null) {
  cache.delete(key);
  cache.set(key, {
    rawValue,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function parseValue<T>(key: string, rawValue: string, fallback: T): T {
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    logger.warn("站点设置值不是有效 JSON，已使用默认值", { key });
    return fallback;
  }
}

function defaultValueFor<T>(key: string, fallback?: T): T | null {
  if (fallback !== undefined) {
    return fallback;
  }

  if (Object.hasOwn(DEFAULT_SETTINGS, key)) {
    return DEFAULT_SETTINGS[key as SettingKey] as T;
  }

  return null;
}

export async function settingIsStored(key: string): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rawValue !== null;
  }
  if (cached) {
    cache.delete(key);
  }
  const setting = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  });
  setCache(key, setting?.value ?? null);
  return Boolean(setting);
}

export async function getSetting<T = unknown>(
  key: string,
  fallback?: T,
): Promise<T | null> {
  const defaultValue = defaultValueFor(key, fallback);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.rawValue === null
      ? defaultValue
      : parseValue(key, cached.rawValue, defaultValue as T);
  }

  if (cached) {
    cache.delete(key);
  }

  const setting = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  });

  setCache(key, setting?.value ?? null);
  return setting
    ? parseValue(key, setting.value, defaultValue as T)
    : defaultValue;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const rawValue = JSON.stringify(value);
  if (rawValue === undefined) {
    throw new TypeError(`站点设置 ${key} 不能序列化`);
  }

  await prisma.setting.upsert({
    where: { key },
    create: { key, value: rawValue },
    update: { value: rawValue },
  });

  setCache(key, rawValue);
}

export async function ensureDefaultSettings(): Promise<void> {
  await prisma.$transaction(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value) },
        update: {},
      }),
    ),
  );
}

export function displaySiteName(siteName: string | null | undefined): string {
  const trimmed = typeof siteName === "string" ? siteName.trim() : "";
  return trimmed || "博客";
}

export async function getPublicSettings() {
  const [
    siteName,
    announcement,
    banner,
    pageSize,
    homeModuleOpacity,
    homeBackdropOpacity,
    siteUrl,
    siteStartedAt,
  ] = await Promise.all([
    getSetting<string>("siteName"),
    getSetting<string>("announcement"),
    getSetting<string>("banner"),
    getSetting<number>("pageSize"),
    getSetting<number>("homeModuleOpacity"),
    getSetting<number>("homeBackdropOpacity"),
    getSetting<string>("siteUrl"),
    getSetting<string>("siteStartedAt"),
  ]);

  return {
    siteName: displaySiteName(siteName),
    announcement: announcement ?? DEFAULT_SETTINGS.announcement,
    banner: banner ?? DEFAULT_SETTINGS.banner,
    pageSize: pageSize ?? DEFAULT_SETTINGS.pageSize,
    homeModuleOpacity: clampPercent(
      homeModuleOpacity ?? DEFAULT_SETTINGS.homeModuleOpacity,
    ),
    homeBackdropOpacity: clampPercent(
      homeBackdropOpacity ?? DEFAULT_SETTINGS.homeBackdropOpacity,
    ),
    siteUrl: siteUrl ?? DEFAULT_SETTINGS.siteUrl,
    siteStartedAt: siteStartedAt ?? DEFAULT_SETTINGS.siteStartedAt,
  };
}

export type AdminSettings = {
  siteName: string;
  announcement: string;
  banner: string;
  pageSize: number;
  backupPeriodDays: number;
  backupKeep: number;
  backupLocalMaxMB: number;
  localMediaMaxMB: number;
  uploadMaxSizeMB: number;
  thumbMaxPx: number;
  thumb2MaxPx: number;
  homeModuleOpacity: number;
  homeBackdropOpacity: number;
  siteUrl: string;
  siteStartedAt: string;
  lastBackupAt: string | null;
  updateGithubRepo: string;
  cosBucket: string;
  cosRegion: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosPublicBaseUrl: string;
  cosSecretIdSet: boolean;
  cosSecretKeySet: boolean;
  adminAccent: AdminAccentKey;
  dashboardCards: DashboardCards;
};

function asSettingString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asSettingNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const keys = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSetting(key)] as const),
  );
  const values = Object.fromEntries(entries) as Record<SettingKey, unknown>;
  const secretId = asSettingString(values.cosSecretId, "");
  const secretKey = asSettingString(values.cosSecretKey, "");
  return {
    siteName: asSettingString(values.siteName, DEFAULT_SETTINGS.siteName),
    announcement: asSettingString(
      values.announcement,
      DEFAULT_SETTINGS.announcement,
    ),
    banner: asSettingString(values.banner, DEFAULT_SETTINGS.banner),
    pageSize: asSettingNumber(values.pageSize, DEFAULT_SETTINGS.pageSize),
    backupPeriodDays: asSettingNumber(
      values.backupPeriodDays,
      DEFAULT_SETTINGS.backupPeriodDays,
    ),
    backupKeep: asSettingNumber(values.backupKeep, DEFAULT_SETTINGS.backupKeep),
    backupLocalMaxMB: asSettingNumber(
      values.backupLocalMaxMB,
      DEFAULT_SETTINGS.backupLocalMaxMB,
    ),
    localMediaMaxMB: asSettingNumber(
      values.localMediaMaxMB,
      DEFAULT_SETTINGS.localMediaMaxMB,
    ),
    uploadMaxSizeMB: asSettingNumber(
      values.uploadMaxSizeMB,
      DEFAULT_SETTINGS.uploadMaxSizeMB,
    ),
    thumbMaxPx: asSettingNumber(values.thumbMaxPx, DEFAULT_SETTINGS.thumbMaxPx),
    thumb2MaxPx: asSettingNumber(values.thumb2MaxPx, DEFAULT_SETTINGS.thumb2MaxPx),
    homeModuleOpacity: asSettingNumber(
      values.homeModuleOpacity,
      DEFAULT_SETTINGS.homeModuleOpacity,
    ),
    homeBackdropOpacity: asSettingNumber(
      values.homeBackdropOpacity,
      DEFAULT_SETTINGS.homeBackdropOpacity,
    ),
    siteUrl: asSettingString(values.siteUrl, DEFAULT_SETTINGS.siteUrl),
    siteStartedAt: asSettingString(
      values.siteStartedAt,
      DEFAULT_SETTINGS.siteStartedAt,
    ),
    lastBackupAt:
      typeof values.lastBackupAt === "string" ? values.lastBackupAt : null,
    updateGithubRepo: asSettingString(
      values.updateGithubRepo,
      DEFAULT_SETTINGS.updateGithubRepo,
    ),
    cosBucket: asSettingString(values.cosBucket, DEFAULT_SETTINGS.cosBucket),
    cosRegion: asSettingString(values.cosRegion, DEFAULT_SETTINGS.cosRegion),
    cosSecretId: "",
    cosSecretKey: "",
    cosPublicBaseUrl: asSettingString(
      values.cosPublicBaseUrl,
      DEFAULT_SETTINGS.cosPublicBaseUrl,
    ),
    cosSecretIdSet: secretId.trim().length > 0,
    cosSecretKeySet: secretKey.trim().length > 0,
    adminAccent: resolveAdminAccent(values.adminAccent).key,
    dashboardCards: resolveDashboardCards(values.dashboardCards),
  };
}

/** 后台配色（后台专属，不进 getPublicSettings）：脏值/读取失败一律回退默认，不抛错。 */
export async function getAdminAccent(): Promise<AdminAccentKey> {
  try {
    return resolveAdminAccent(await getSetting<string>("adminAccent")).key;
  } catch (error) {
    logger.warn("后台配色读取失败，已回退默认配色", {
      error: error instanceof Error ? error.message : String(error),
    });
    return resolveAdminAccent(null).key;
  }
}

/** 概览页卡片显隐：未知键丢弃、缺键补默认、非布尔值按默认，不抛错。 */
export async function getDashboardCards(): Promise<DashboardCards> {
  try {
    return resolveDashboardCards(await getSetting("dashboardCards"));
  } catch (error) {
    logger.warn("概览页卡片配置读取失败，已回退默认显示", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...DEFAULT_DASHBOARD_CARDS };
  }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}
