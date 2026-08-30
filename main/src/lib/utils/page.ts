export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function parsePageSize(
  value: string | string[] | undefined,
  fallback = 20,
  max = 50,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const size = Number.parseInt(raw ?? String(fallback), 10);
  if (!Number.isFinite(size) || size < 1) {
    return fallback;
  }
  return Math.min(size, max);
}
