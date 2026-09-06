import type { Upload } from "@prisma/client";

import {
  localOriginalCandidates,
  localThumb2Candidates,
  localThumbCandidates,
} from "@/lib/storage/media-keys";

function variantKeys(raw: string): {
  thumb?: string;
  thumb2?: string;
  content?: string;
} {
  try {
    const parsed = JSON.parse(raw) as {
      thumb?: { key?: string };
      thumb2?: { key?: string };
      content?: { key?: string };
    };
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return {
      thumb: parsed.thumb?.key,
      thumb2: parsed.thumb2?.key,
      content: parsed.content?.key,
    };
  } catch {
    return {};
  }
}

export type UploadLocationPlace = "local" | "cos";
export type UploadLocationRole = "original" | "thumb" | "thumb2" | "content";

export type UploadLocationPlan = {
  place: UploadLocationPlace;
  role: UploadLocationRole;
  keys: string[];
};

export function parseUploadDuration(value: unknown): number | null {
  const raw = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(raw) || raw <= 0 || raw > 24 * 60 * 60) {
    return null;
  }
  return Math.round(raw);
}

export function uniqueKeys(keys: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  return result;
}

export function plannedLocations(
  row: Pick<Upload, "key" | "hash" | "mime"> & { variants: string },
): UploadLocationPlan[] {
  const variants = variantKeys(row.variants);
  const originalKeys = uniqueKeys([row.key, ...localOriginalCandidates(row)]);
  const thumbKeys = uniqueKeys([
    variants.thumb,
    ...(row.mime.startsWith("image/") ? localThumbCandidates(row) : []),
  ]);
  const thumb2Keys = uniqueKeys([
    variants.thumb2,
    ...(row.mime.startsWith("image/") ? localThumb2Candidates(row) : []),
  ]);
  const contentKeys = uniqueKeys([variants.content]);

  const plans: UploadLocationPlan[] = [
    { place: "local", role: "original", keys: originalKeys },
    { place: "cos", role: "original", keys: originalKeys },
  ];
  if (thumbKeys.length > 0) {
    plans.push(
      { place: "local", role: "thumb", keys: thumbKeys },
      { place: "cos", role: "thumb", keys: thumbKeys },
    );
  }
  if (thumb2Keys.length > 0) {
    plans.push({ place: "local", role: "thumb2", keys: thumb2Keys });
  }
  if (contentKeys.length > 0) {
    plans.push(
      { place: "local", role: "content", keys: contentKeys },
      { place: "cos", role: "content", keys: contentKeys },
    );
  }
  return plans;
}

export function keysForDelete(row: Pick<Upload, "key" | "hash" | "mime"> & { variants: string }) {
  return uniqueKeys(plannedLocations(row).flatMap((plan) => plan.keys));
}

export function mimePrefixForKind(kind?: string | null): "image/" | "video/" | "audio/" | null {
  if (kind === "image" || kind === "video" || kind === "audio") {
    return `${kind}/`;
  }
  return null;
}
