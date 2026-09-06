import { objectPublicUrl, peekCosSettings } from "./cos-config";
import { normalizeStorageKey } from "./types";

function uploadsPath(key: string): string {
  const encoded = normalizeStorageKey(key)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `/api/uploads/${encoded}`;
}

/** Always local `/api/uploads` — used by thumb2 (never COS). */
export function localUploadUrl(key: string, cacheBust?: string): string {
  const base = uploadsPath(key);
  return cacheBust ? `${base}?${cacheBust}` : base;
}

/** Visitor-facing object URL: COS when configured, otherwise local /api/uploads. */
export function publicMediaUrl(key: string): string {
  const config = peekCosSettings();
  if (config) {
    return objectPublicUrl(config.publicBaseUrl, key);
  }
  return uploadsPath(key);
}
