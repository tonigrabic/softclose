/**
 * The session cookie.
 *
 * A signature check that accepts something it shouldn't is invisible — no error,
 * no failing page, just an open app — so the cases here are mostly forgeries:
 * `alg: none`, a different algorithm, a flipped byte, an expired token, the
 * wrong key. Each must come back null, and null is the only "no".
 *
 * Also pinned: with no AUTH_SECRET the module refuses to sign OR verify. That is
 * a deliberate break from this repo's degrade-to-null habit, and the kind of
 * thing a later "make dev easier" change would quietly undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import {
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  authSecretConfigured,
  shouldRefresh,
  signSession,
  verifySession,
  type SessionClaims,
} from '@/lib/auth/session'

const SECRET = 'test-secret-at-least-32-characters-long'
const OTHER = 'a-completely-different-secret-value-here'
const enc = (s: string) => new TextEncoder().encode(s)

const claims = { sub: 'acc-1', role: 'maker' as const, epoch: 1 }

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET
  delete process.env.AUTH_SECRET_PREVIOUS
})

afterEach(() => {
  delete process.env.AUTH_SECRET
  delete process.env.AUTH_SECRET_PREVIOUS
  vi.useRealTimers()
})

describe('sign / verify', () => {
  it('round trips the account, role and epoch', async () => {
    const jwt = await signSession(claims)
    const out = await verifySession(jwt)
    expect(out).toMatchObject({ sub: 'acc-1', role: 'maker', epoch: 1 })
  })

  it('carries nothing but the identifiers — no email, no name', async () => {
    const jwt = await signSession(claims)
    const payload = JSON.parse(Buffer.from(jwt!.split('.')[1], 'base64url').toString())
    expect(Object.keys(payload).sort()).toEqual(['epoch', 'exp', 'iat', 'role', 'sub'])
  })

  it('expires at the stated TTL', async () => {
    const jwt = await signSession(claims)
    const out = (await verifySession(jwt)) as SessionClaims
    expect((out.exp - out.iat) * 1000).toBe(SESSION_TTL_MS)
  })

  it.each([null, undefined, '', 'not-a-jwt', 'a.b.c'])('rejects %s', async (bad) => {
    expect(await verifySession(bad as string | null)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const forged = await new SignJWT({ role: 'maker', epoch: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(enc(OTHER))
    expect(await verifySession(forged)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const jwt = (await signSession(claims))!
    const [head, payload, sig] = jwt.split('.')
    const edited = JSON.parse(Buffer.from(payload, 'base64url').toString())
    edited.role = 'maker'
    edited.sub = 'someone-else'
    const repacked = Buffer.from(JSON.stringify(edited)).toString('base64url')
    expect(await verifySession(`${head}.${repacked}.${sig}`)).toBeNull()
  })

  it("rejects alg 'none'", async () => {
    // The classic: strip the signature and claim it was never needed.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({ sub: 'acc-1', role: 'maker', epoch: 1, iat: 1, exp: 9999999999 })
    ).toString('base64url')
    expect(await verifySession(`${header}.${payload}.`)).toBeNull()
  })

  it('rejects a different HMAC family even when the key matches', async () => {
    const forged = await new SignJWT({ role: 'maker', epoch: 1 })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(enc(SECRET))
    expect(await verifySession(forged)).toBeNull()
  })

  it('rejects an expired token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
    const jwt = await signSession(claims)
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS + 60_000))
    expect(await verifySession(jwt)).toBeNull()
  })

  it('rejects a payload missing the fields the DAL relies on', async () => {
    const half = await new SignJWT({ role: 'maker' }) // no epoch
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(enc(SECRET))
    expect(await verifySession(half)).toBeNull()

    const noRole = await new SignJWT({ epoch: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('acc-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(enc(SECRET))
    expect(await verifySession(noRole)).toBeNull()
  })
})

describe('secret rotation', () => {
  it('still accepts cookies signed with the previous secret', async () => {
    process.env.AUTH_SECRET = OTHER
    const oldCookie = await signSession(claims)

    process.env.AUTH_SECRET = SECRET
    process.env.AUTH_SECRET_PREVIOUS = OTHER
    expect(await verifySession(oldCookie)).toMatchObject({ sub: 'acc-1' })
  })

  it('signs with the current secret only, so old cookies age out', async () => {
    process.env.AUTH_SECRET = SECRET
    process.env.AUTH_SECRET_PREVIOUS = OTHER
    const fresh = await signSession(claims)

    delete process.env.AUTH_SECRET_PREVIOUS
    expect(await verifySession(fresh)).toMatchObject({ sub: 'acc-1' })
  })
})

describe('no AUTH_SECRET', () => {
  it('refuses to sign or verify rather than falling back to something derivable', async () => {
    const jwt = await signSession(claims)
    expect(jwt).not.toBeNull()

    delete process.env.AUTH_SECRET
    expect(authSecretConfigured()).toBe(false)
    expect(await signSession(claims)).toBeNull()
    expect(await verifySession(jwt)).toBeNull()
  })
})

describe('sliding refresh', () => {
  const at = (ageMs: number): SessionClaims => ({
    sub: 'acc-1',
    role: 'maker',
    epoch: 1,
    iat: Math.floor((Date.now() - ageMs) / 1000),
    exp: Math.floor((Date.now() - ageMs + SESSION_TTL_MS) / 1000),
  })

  it('leaves a fresh cookie alone', () => {
    expect(shouldRefresh(at(60_000))).toBe(false)
  })

  it('refreshes once half the life is gone', () => {
    expect(shouldRefresh(at(SESSION_REFRESH_AFTER_MS - 1000))).toBe(false)
    expect(shouldRefresh(at(SESSION_REFRESH_AFTER_MS + 1000))).toBe(true)
  })
})
