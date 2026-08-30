import { getSetting } from "@/lib/settings";
import { logger } from "@/lib/utils/logger";

export const FALLBACK_BANNER_SRC = "/banner-fallback.svg";

export type HomeBannerSource = "setting" | "bing" | "fallback";

export type HomeBanner = {
  src: string;
  source: HomeBannerSource;
  date?: string;
};

type BannerCacheEntry = {
  banner: HomeBanner;
  expiresAt: number;
};

const BING_ENDPOINT =
  "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN";
const BING_TIMEOUT_MS = 3_000;
const FAILURE_CACHE_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 2;

const globalForBanner = globalThis as typeof globalThis & {
  myblogBannerCache?: Map<string, BannerCacheEntry>;
  myblogBannerRequest?: { day: string; promise: Promise<HomeBanner> };
};

const bannerCache =
  globalForBanner.myblogBannerCache ?? new Map<string, BannerCacheEntry>();
globalForBanner.myblogBannerCache = bannerCache;

function shanghaiDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function setCachedBanner(day: string, banner: HomeBanner, ttlMs: number) {
  bannerCache.delete(day);
  bannerCache.set(day, { banner, expiresAt: Date.now() + ttlMs });
  while (bannerCache.size > CACHE_MAX_ENTRIES) {
    const oldest = bannerCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    bannerCache.delete(oldest);
  }
}

function validatedBingUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://cn.bing.com");
    return url.protocol === "https:" &&
      (url.hostname === "cn.bing.com" || url.hostname === "www.bing.com")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function requestBingBanner(day: string): Promise<HomeBanner> {
  const fallback = { src: FALLBACK_BANNER_SRC, source: "fallback" } as const;
  try {
    const response = await fetch(BING_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(BING_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      images?: Array<{ url?: unknown; startdate?: unknown }>;
    };
    const image = body.images?.[0];
    const src =
      typeof image?.url === "string" ? validatedBingUrl(image.url) : null;
    const date =
      typeof image?.startdate === "string" &&
      /^\d{8}$/.test(image.startdate)
        ? image.startdate
        : day.replaceAll("-", "");
    if (!src) {
      throw new Error("响应中没有合法图片 URL");
    }

    const banner: HomeBanner = { src, source: "bing", date };
    setCachedBanner(day, banner, 26 * 60 * 60_000);
    return banner;
  } catch (error) {
    logger.warn("Bing 每日一图获取失败，已使用本地回退图", {
      error: error instanceof Error ? error.message : String(error),
    });
    setCachedBanner(day, fallback, FAILURE_CACHE_MS);
    return fallback;
  }
}

export async function resolveHomeBanner(): Promise<HomeBanner> {
  const banner = (await getSetting<string>("banner"))?.trim();
  if (banner) {
    return { src: banner, source: "setting" };
  }

  const day = shanghaiDay();
  const cached = bannerCache.get(day);
  if (cached && cached.expiresAt > Date.now()) {
    bannerCache.delete(day);
    bannerCache.set(day, cached);
    return cached.banner;
  }
  if (cached) {
    bannerCache.delete(day);
  }

  if (globalForBanner.myblogBannerRequest?.day === day) {
    return globalForBanner.myblogBannerRequest.promise;
  }

  const promise = requestBingBanner(day).finally(() => {
    if (globalForBanner.myblogBannerRequest?.promise === promise) {
      delete globalForBanner.myblogBannerRequest;
    }
  });
  globalForBanner.myblogBannerRequest = { day, promise };
  return promise;
}
