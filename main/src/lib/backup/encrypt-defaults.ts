export function isHttpsEndpoint(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function defaultEncryptEnabled(cosHttps: boolean): boolean {
  return !cosHttps;
}
