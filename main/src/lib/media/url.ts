export function isSafeMediaUrl(value: string): boolean {
  if (value.startsWith("/api/uploads/")) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Same-origin path or https. Rejects javascript:, data:, protocol-relative //. */
export function isSafeHref(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) {
    return false;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return !trimmed.includes("\\") && !trimmed.includes("\0");
  }
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

export function isExternalMediaUrl(value: string): boolean {
  return value.startsWith("https://");
}

export function mediaSourceHost(value: string): string | null {
  if (!isExternalMediaUrl(value)) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return "外链";
  }
}
