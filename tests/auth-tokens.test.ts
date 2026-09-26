/**
 * Magic-link token primitives.
 *
 * These are the whole of the app's "prove you are this email" mechanism, so the
 * properties worth pinning are the ones that stop being obvious the moment
 * someone refactors: that the stored value is never the raw token, that a
 * single use really is single, and that the grace window has an end.
 *
 * The last case guards a seam rather than a function: scripts/maker.mjs mints a
 * sign-in link without being able to import TypeScript, so it reimplements the
 * two primitives. If they ever drift, `npm run maker -- add` silently starts
 * printing links the app cannot verify — and that is the lockout recovery path.
 */
import { describe, expect, it } from 'vitest'
import {
  CONSUME_GRACE_MS,
  TOKEN_TTL_MS,
  classifyConsume,
  expiryFor,
  generateToken,
  hashToken,
  hashesEqual,
  isEmail,
  magicLinkUrl,
  maskEmail,
  normalizeEmail,
} from '@/lib/auth/tokens'
// The CLI is plain JS; it exports these purely so this contract can be pinned.
import { generateRawToken, hashToken as scriptHashToken, normalizeEmail as scriptNormalize, LOGIN_TTL_MS } from '../scripts/maker.mjs'

describe('token generation', () => {
  it('is 32 bytes of entropy, base64url, and never repeats', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const { raw } = generateToken()
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/)
      seen.add(raw)
    }
    expect(seen.size).toBe(1000)
  })

  it('stores the digest, never the token', () => {
    const { raw, hash } = generateToken()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(raw)
    expect(hash).not.toContain(raw)
    expect(hashToken(raw)).toBe(hash)
  })

  it('compares hashes without leaking length-vs-content timing', () => {
    const a = hashToken('a')
    expect(hashesEqual(a, hashToken('a'))).toBe(true)
    expect(hashesEqual(a, hashToken('b'))).toBe(false)
    expect(hashesEqual(a, 'short')).toBe(false)
  })

  it('puts the token in the query string of an absolute verify URL', () => {
    expect(magicLinkUrl('https://app.example/', 'abc+def')).toBe(
      'https://app.example/auth/verify?token=abc%2Bdef'
    )
  })
})

describe('email handling', () => {
  it('normalises so one person cannot become two accounts', () => {
    expect(normalizeEmail('  Ana@Stolarija.HR ')).toBe('ana@stolarija.hr')
  })

  it.each([
    ['ana@stolarija.hr', true],
    ['a@b.co', true],
    ['ana+kuhinja@stolarija.hr', true],
    ['ana@localhost', false],
    ['ana stolarija.hr', false],
    ['@stolarija.hr', false],
    ['ana@', false],
    ['', false],
  ])('isEmail(%s) → %s', (input, expected) => {
    expect(isEmail(input)).toBe(expected)
  })

  it('masks the local part for logs', () => {
    expect(maskEmail('Ana@Stolarija.hr')).toBe('a***@stolarija.hr')
    expect(maskEmail('nonsense')).toBe('***')
  })
})

describe('TTLs', () => {
  it('gives an invite far longer than a login link', () => {
    // A login link is answered in seconds; an invite waits in an inbox.
    expect(TOKEN_TTL_MS.login).toBe(15 * 60 * 1000)
    expect(TOKEN_TTL_MS.invite).toBeGreaterThan(TOKEN_TTL_MS.login * 100)
  })

  it('expires from now, per purpose', () => {
    const now = Date.UTC(2026, 8, 22, 12, 0, 0)
    expect(expiryFor('login', now).toISOString()).toBe(new Date(now + TOKEN_TTL_MS.login).toISOString())
    expect(expiryFor('invite', now).toISOString()).toBe(new Date(now + TOKEN_TTL_MS.invite).toISOString())
  })
})

describe('classifyConsume', () => {
  const now = Date.UTC(2026, 8, 22, 12, 0, 0)
  const live = { expires_at: new Date(now + 60_000).toISOString(), consumed_at: null, revoked_at: null }

  it('accepts a live, unused token', () => {
    expect(classifyConsume(live, now)).toBe('ok')
  })

  it('reports a missing row as invalid', () => {
    expect(classifyConsume(null, now)).toBe('invalid')
  })

  it('reports an expired token', () => {
    expect(classifyConsume({ ...live, expires_at: new Date(now - 1).toISOString() }, now)).toBe('expired')
  })

  it('reports a revoked token even when it is otherwise live', () => {
    expect(classifyConsume({ ...live, revoked_at: new Date(now - 1).toISOString() }, now)).toBe('revoked')
  })

  it('re-accepts a token consumed moments ago, and stops at the window edge', () => {
    // Two tabs, a double submit, or a mail scanner beating the human to it.
    const justUsed = { ...live, consumed_at: new Date(now - 1_000).toISOString() }
    expect(classifyConsume(justUsed, now)).toBe('grace')

    const longUsed = { ...live, consumed_at: new Date(now - CONSUME_GRACE_MS - 1).toISOString() }
    expect(classifyConsume(longUsed, now)).toBe('used')
  })

  it('treats an unparseable expiry as expired rather than valid', () => {
    expect(classifyConsume({ ...live, expires_at: 'not a date' }, now)).toBe('expired')
  })
})

describe('scripts/maker.mjs agrees with the app', () => {
  it('hashes identically', () => {
    const raw = generateRawToken()
    expect(scriptHashToken(raw)).toBe(hashToken(raw))
  })

  it('mints tokens the app would accept', () => {
    expect(generateRawToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('normalises emails identically', () => {
    expect(scriptNormalize('  Ana@Stolarija.HR ')).toBe(normalizeEmail('  Ana@Stolarija.HR '))
  })

  it('uses the same login TTL', () => {
    expect(LOGIN_TTL_MS).toBe(TOKEN_TTL_MS.login)
  })
})
