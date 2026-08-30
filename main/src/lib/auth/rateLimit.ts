export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

const MAX_BUCKETS = 2_000;

const globalForRateLimit = globalThis as typeof globalThis & {
  myblogRateLimitStore?: Map<string, number[]>;
};

const store =
  globalForRateLimit.myblogRateLimitStore ?? new Map<string, number[]>();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.myblogRateLimitStore = store;
}

function evictOldestBucket() {
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) {
    store.delete(oldestKey);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  if (limit < 1 || windowMs < 1) {
    throw new RangeError("限速参数必须大于 0");
  }

  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (store.get(key) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );

  store.delete(key);

  if (timestamps.length >= limit) {
    store.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(1, timestamps[0] + windowMs - now),
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  while (store.size > MAX_BUCKETS) {
    evictOldestBucket();
  }

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    retryAfterMs: 0,
  };
}

export function clearRateLimit(key: string): void {
  store.delete(key);
}
