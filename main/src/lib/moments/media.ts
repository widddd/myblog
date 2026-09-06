import { prisma } from "@/lib/db";
import {
  getDriver,
  hashFromMediaKey,
  isThumb2Key,
  localUploadUrl,
  publicMediaUrl,
  thumb2MediaKey,
  thumbMediaKey,
} from "@/lib/storage";
import { peekCosSettings } from "@/lib/storage/cos-config";
import { ensureLocalThumb2 } from "@/lib/upload/handle";

function keyFromStored(value: string): string | null {
  if (value.startsWith("/api/uploads/")) {
    const pathOnly = value.slice("/api/uploads/".length).split("?")[0] ?? "";
    return decodeURIComponent(pathOnly);
  }
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
    return null;
  }
  return value;
}

export function resolvePublicImageUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  if (value.startsWith("https://")) {
    return value;
  }

  const storedKey = keyFromStored(value) ?? (isThumb2Key(value) ? value : null);
  if (storedKey && isThumb2Key(storedKey)) {
    try {
      return localUploadUrl(storedKey);
    } catch {
      return null;
    }
  }

  const hash = hashFromMediaKey(value);
  const looksLikeThumb =
    value.includes("-thumb.") ||
    (value.includes("/thumbs/") && !value.includes("/thumbs2/"));
  if (hash && peekCosSettings() && looksLikeThumb) {
    try {
      return publicMediaUrl(thumbMediaKey(hash));
    } catch {
      // fall through
    }
  }

  const key = keyFromStored(value);
  if (key) {
    try {
      return publicMediaUrl(key);
    } catch {
      return null;
    }
  }

  if (value.startsWith("/")) {
    return value;
  }
  return null;
}

/** Local-only L2 URL. Missing files are generated once; then fallback to L1. */
export async function resolveThumb2Src(
  originalKey: string,
  fallback: string,
  maxPx: number,
): Promise<string> {
  const hash = hashFromMediaKey(originalKey) ?? hashFromMediaKey(fallback);
  if (!hash) {
    return fallback;
  }
  const key = thumb2MediaKey(hash);
  const local = getDriver("local");
  try {
    if (await local.stat(key)) {
      return localUploadUrl(key, `px=${maxPx}`);
    }
    const row = await prisma.upload.findUnique({ where: { hash } });
    if (row) {
      await ensureLocalThumb2(row);
      if (await local.stat(key)) {
        return localUploadUrl(key, `px=${maxPx}`);
      }
    }
  } catch {
    // fall through to L1
  }
  return fallback;
}
