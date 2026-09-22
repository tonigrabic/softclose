/**
 * In-memory rate limiter. Demo-grade only — replace with Redis/Upstash before
 * any real traffic: on Vercel each instance owns its own counters, so a fleet
 * enforces roughly N× the stated limit. The durable limits that actually bind
 * (sign-in and invite sends) live in the auth-token table instead.
 *
 * Prefer `rateLimitKey(accountId, …)` over the IP version now that the app is
 * behind a login. An account is the thing worth limiting — an IP is shared by
 * everyone behind one office NAT, and trivially changed by anyone who cares.
 */

interface Bucket {
  count: number
  resetAt: number
}

const BUCKETS: Map<string, Bucket> = new Map()

export function clientIpFromRequest(req: Request): string {
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
  return rateLimitKey(clientIpFromRequest(req), bucketName, max, windowMs)
}

/** Same, keyed by anything — an account id, usually. */
export function rateLimitKey(
  identity: string,
  bucketName: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const key = `${bucketName}:${identity}`
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
