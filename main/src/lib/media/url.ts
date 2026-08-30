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
