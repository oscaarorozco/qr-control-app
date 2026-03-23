type Bucket = {
  attempts: number;
  resetAt: number;
  blockedUntil: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  options?: {
    maxAttempts?: number;
    windowMs?: number;
    blockMs?: number;
  },
) {
  const maxAttempts = options?.maxAttempts ?? 8;
  const windowMs = options?.windowMs ?? 15 * 60 * 1000;
  const blockMs = options?.blockMs ?? 30 * 60 * 1000;
  const now = Date.now();

  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, {
      attempts: 1,
      resetAt: now + windowMs,
      blockedUntil: 0,
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.blockedUntil > now) {
    return { allowed: false, retryAfterMs: bucket.blockedUntil - now };
  }

  if (bucket.resetAt <= now) {
    bucket.attempts = 1;
    bucket.resetAt = now + windowMs;
    bucket.blockedUntil = 0;
    return { allowed: true, retryAfterMs: 0 };
  }

  bucket.attempts += 1;

  if (bucket.attempts > maxAttempts) {
    bucket.blockedUntil = now + blockMs;
    return { allowed: false, retryAfterMs: blockMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
