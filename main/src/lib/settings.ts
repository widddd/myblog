import { prisma } from "@/lib/db";
import { logger } from "@/lib/utils/logger";

export const DEFAULT_SETTINGS = {
  siteName: "MyBlog",
  announcement: "",
  banner: "",
  pageSize: 10,
  backupPeriodDays: 3,
  backupKeep: 5,
  uploadMaxSizeMB: 10,
  lastBackupAt: null,
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

export async function getPublicSettings() {
  const [siteName, announcement, banner, pageSize] = await Promise.all([
    getSetting<string>("siteName"),
    getSetting<string>("announcement"),
    getSetting<string>("banner"),
    getSetting<number>("pageSize"),
  ]);

  return {
    siteName: siteName ?? DEFAULT_SETTINGS.siteName,
    announcement: announcement ?? DEFAULT_SETTINGS.announcement,
    banner: banner ?? DEFAULT_SETTINGS.banner,
    pageSize: pageSize ?? DEFAULT_SETTINGS.pageSize,
  };
}
