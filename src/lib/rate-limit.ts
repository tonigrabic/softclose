/**
 * In-memory IP rate limiter. Demo-grade only — replace with Redis/Upstash
 * before any real traffic. Fine for a prototype where the process owns the
 * counters and resets on restart.
 */

interface Bucket {
  count: number
  resetAt: number
}

const BUCKETS: Map<string, Bucket> = new Map()

function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'anon'
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterMs: number
}

/** Returns ok: false when the IP has exceeded `max` calls in the window. */
export function rateLimit(
  req: Request,
  bucketName: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const ip = clientIpFromRequest(req)
  const key = `${bucketName}:${ip}`
  const now = Date.now()
  const bucket = BUCKETS.get(key)
  if (!bucket || bucket.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1, retryAfterMs: 0 }
  }
  if (bucket.count >= max) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now }
  }
  bucket.count += 1
  return { ok: true, remaining: max - bucket.count, retryAfterMs: 0 }
}
