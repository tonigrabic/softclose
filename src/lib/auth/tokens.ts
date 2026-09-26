/**
 * Magic-link token primitives. Pure — no DB, no cookies, no `server-only`, so
 * the proxy and the unit tests can both import them.
 *
 * The raw token exists exactly once, in the email. What we store is its sha256,
 * so a database dump yields nothing replayable. A plain digest is sufficient
 * here — 32 random bytes is not brute-forceable, and unlike a password there is
 * no low-entropy secret to slow an attacker down with argon2.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export type TokenPurpose = 'login' | 'invite'

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  /** They asked for it seconds ago and are staring at their inbox. */
  login: 15 * 60 * 1000,
  /** The maker sends it; the customer opens it days later, after a site visit. */
  invite: 14 * 24 * 60 * 60 * 1000,
}

/**
 * How long after a token is consumed we still accept it.
 *
 * Mail gateways (Outlook SafeLinks and friends) PREFETCH links, which would
 * otherwise burn a single-use token before the human ever clicks. Consuming on
 * POST rather than GET is the main defence; this window covers the rest —
 * double submits, two tabs, a retry after a timeout. The exposure is that a
 * token holder can mint a second session for two minutes, and they already held
 * the link, so it grants nothing they did not have.
 */
export const CONSUME_GRACE_MS = 2 * 60 * 1000

/** 32 bytes of entropy, base64url — 43 characters, URL-safe, no padding. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Constant-time compare, for the rare path that compares two hashes directly. */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function magicLinkUrl(baseUrl: string, raw: string): string {
  return `${baseUrl.replace(/\/$/, '')}/auth/verify?token=${encodeURIComponent(raw)}`
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Deliberately loose. The authoritative check is whether a link sent to the
 * address is ever opened; a clever regex only ever rejects real addresses.
 */
export function isEmail(raw: string): boolean {
  const v = raw.trim()
  return v.length >= 3 && v.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v)
}

/** For logs: never write a full address or a raw token to disk. */
export function maskEmail(raw: string): string {
  const v = normalizeEmail(raw)
  const at = v.indexOf('@')
  if (at <= 0) return '***'
  return `${v[0]}***${v.slice(at)}`
}

export interface TokenRowLike {
  expires_at: string
  consumed_at: string | null
  revoked_at: string | null
}

export type ConsumeVerdict = 'ok' | 'grace' | 'expired' | 'used' | 'revoked' | 'invalid'

/**
 * Why a token could not be claimed. Called only after the atomic claim UPDATE
 * matched no row, to turn "nothing happened" into something we can explain.
 *
 * Note what the caller does with this: every failure verdict renders the SAME
 * screen. Distinguishing them here is for logs, not for the user — telling
 * someone "already used" rather than "invalid" is a small enumeration oracle.
 */
export function classifyConsume(row: TokenRowLike | null, now: number = Date.now()): ConsumeVerdict {
  if (!row) return 'invalid'
  if (row.revoked_at) return 'revoked'
  if (row.consumed_at) {
    const consumedAt = Date.parse(row.consumed_at)
    if (Number.isFinite(consumedAt) && now - consumedAt <= CONSUME_GRACE_MS) return 'grace'
    return 'used'
  }
  const expiresAt = Date.parse(row.expires_at)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'expired'
  return 'ok'
}

export function expiryFor(purpose: TokenPurpose, now: number = Date.now()): Date {
  return new Date(now + TOKEN_TTL_MS[purpose])
}
