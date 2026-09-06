import { getSetting } from "@/lib/settings";
import { normalizeStorageKey } from "@/lib/storage/types";

export class CosNotConfiguredError extends Error {
  constructor(message = "腾讯云 COS 尚未配置") {
    super(message);
    this.name = "CosNotConfiguredError";
  }
}

export type CosSettings = {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  publicBaseUrl: string;
};

let cached: CosSettings | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export function buildCosPublicBaseUrl(
  bucket: string,
  region: string,
  custom?: string | null,
): string {
  const trimmed = custom?.trim().replace(/\/+$/, "") ?? "";
  if (trimmed) {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      throw new Error("COS 访问域名须为 https");
    }
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  }
  return `https://${bucket}.cos.${region}.myqcloud.com`;
}

export function objectPublicUrl(base: string, key: string): string {
  const encoded = normalizeStorageKey(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${base.replace(/\/+$/, "")}/${encoded}`;
}

export function peekCosSettings(): CosSettings | null {
  if (cached && Date.now() - cachedAt < CACHE_MS) {
    return cached;
  }
  return cached;
}

export function clearCosSettingsCache() {
  cached = null;
  cachedAt = 0;
}

export async function loadCosSettings(): Promise<CosSettings | null> {
  const [bucket, region, secretId, secretKey, publicBase] = await Promise.all([
    getSetting<string>("cosBucket"),
    getSetting<string>("cosRegion"),
    getSetting<string>("cosSecretId"),
    getSetting<string>("cosSecretKey"),
    getSetting<string>("cosPublicBaseUrl"),
  ]);

  const nextBucket = bucket?.trim() ?? "";
  const nextRegion = region?.trim() ?? "";
  const nextId = secretId?.trim() ?? "";
  const nextKey = secretKey?.trim() ?? "";

  if (!nextBucket || !nextRegion || !nextId || !nextKey) {
    cached = null;
    cachedAt = Date.now();
    return null;
  }

  cached = {
    bucket: nextBucket,
    region: nextRegion,
    secretId: nextId,
    secretKey: nextKey,
    publicBaseUrl: buildCosPublicBaseUrl(
      nextBucket,
      nextRegion,
      publicBase ?? "",
    ),
  };
  cachedAt = Date.now();
  return cached;
}

export async function requireCosSettings(): Promise<CosSettings> {
  const config = await loadCosSettings();
  if (!config) {
    throw new CosNotConfiguredError();
  }
  return config;
}

export function isCosConfigured(config: CosSettings | null): config is CosSettings {
  return Boolean(config);
}
