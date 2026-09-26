/**
 * The session cookie: a signed JWT saying "this browser is account X".
 *
 * Deliberately NOT marked `server-only` — the proxy imports it, and so do the
 * tests. It touches no database and reads no cookies; it only signs and
 * verifies. Cookie reading and writing live where they are allowed to happen
 * (the proxy, route handlers and server actions), not here.
 *
 * Fail closed. With no AUTH_SECRET, signing and verifying both return null, so
 * every guarded page redirects to /login and nobody gets in — including us.
 * That breaks this repo's usual "degrade to null and keep working" posture on
 * purpose: auth that degrades to *allow* is worse than auth that is down.
 */
import { SignJWT, jwtVerify } from 'jose'

export type Role = 'maker' | 'customer'

export interface SessionClaims {
  /** Account id. */
  sub: string
  role: Role
  /** softclose_accounts.session_epoch — bumped to sign an account out everywhere. */
  epoch: number
  iat: number
  exp: number
}

export const SESSION_COOKIE = 'sc_session'

/** Absolute life of one cookie. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
/** Re-sign once half the life is gone, so an active person is never logged out. */
export const SESSION_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

const ALG = 'HS256'

/**
 * Read lazily, never at module scope: `next build` imports every module, and a
 * top-level throw would turn a missing variable into a failed build rather than
 * a clear runtime message. Same reason `supabaseAdmin()` is a function.
 */
function secrets(): { current: Uint8Array | null; previous: Uint8Array | null } {
  const enc = new TextEncoder()
  const current = process.env.AUTH_SECRET
  const previous = process.env.AUTH_SECRET_PREVIOUS
  return {
    current: current ? enc.encode(current) : null,
    previous: previous ? enc.encode(previous) : null,
  }
}

export function authSecretConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET)
}

export async function signSession(claims: { sub: string; role: Role; epoch: number }): Promise<string | null> {
  const { current } = secrets()
  if (!current) {
    console.error('[auth] AUTH_SECRET is not set — cannot issue sessions')
    return null
  }
  return new SignJWT({ role: claims.role, epoch: claims.epoch })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + SESSION_TTL_MS))
    .sign(current)
}

/**
 * Verify against the current secret, then the previous one.
 *
 * That second attempt is what turns a secret rotation from "sign everyone out"
 * into a no-op: set AUTH_SECRET_PREVIOUS to the old value, deploy, wait out the
 * TTL, delete it. Signing always uses the current secret, so old cookies age
 * out rather than being refreshed forever.
 *
 * `algorithms: [ALG]` is not decoration — without it a token claiming
 * `alg: none` or a different family would be considered on its own terms.
 */
export async function verifySession(jwt: string | null | undefined): Promise<SessionClaims | null> {
  if (!jwt) return null
  const { current, previous } = secrets()
  for (const key of [current, previous]) {
    if (!key) continue
    try {
      const { payload } = await jwtVerify(jwt, key, { algorithms: [ALG] })
      const { sub, role, epoch, iat, exp } = payload as Record<string, unknown>
      if (typeof sub !== 'string' || !sub) return null
      if (role !== 'maker' && role !== 'customer') return null
      if (typeof epoch !== 'number' || typeof iat !== 'number' || typeof exp !== 'number') return null
      return { sub, role, epoch, iat, exp }
    } catch {
      // Wrong key, tampered, or expired — try the next key, then give up.
    }
  }
  return null
}

export function sessionCookieOptions(): {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
} {
  return {
    httpOnly: true,
    // Production only, so plain-http localhost works in every browser.
    secure: process.env.NODE_ENV === 'production',
    // 'lax', never 'strict': someone arriving from a link in their email is a
    // cross-site navigation, and under 'strict' they would land signed out.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }
}

export function shouldRefresh(claims: SessionClaims, now: number = Date.now()): boolean {
  return now - claims.iat * 1000 >= SESSION_REFRESH_AFTER_MS
}
