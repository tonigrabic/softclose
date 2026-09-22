/**
 * Open-redirect guard.
 *
 * `?next=` is the one place a stranger gets to put a destination into our
 * redirect. The table below is the list of things that look like a path to a
 * careless check but are read as somewhere else entirely by a browser — with
 * `//evil.com` the standout, since it has a leading slash and is still a host.
 *
 * The loop guard matters too: pointing `next` back at /login is how a sign-in
 * turns into an infinite bounce that reads as "login is broken".
 */
import { describe, expect, it } from 'vitest'
import { PUBLIC_PATHS, homePathForRole, isPublicPath, loginUrl, safeNextPath } from '@/lib/auth/redirect'

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/maker/2b8f1f6e-0000-4000-8000-000000000000', '/maker/2b8f1f6e-0000-4000-8000-000000000000'],
    ['/kitchen/abc?step=3', '/kitchen/abc?step=3'],
  ])('keeps in-app path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    ['//evil.example', 'protocol-relative — the browser reads evil.example as the host'],
    ['/\\evil.example', 'browsers fold the backslash to a slash'],
    ['https://evil.example', 'absolute'],
    ['http://evil.example', 'absolute'],
    ['javascript:alert(1)', 'scheme, no leading slash'],
    ['/javascript:alert(1)', 'scheme behind a slash'],
    ['//', 'bare protocol-relative'],
    ['dashboard', 'relative — would resolve against whatever page we are on'],
    ['', 'empty'],
    ['/x\nLocation: https://evil.example', 'header injection attempt'],
  ])('refuses %s (%s)', (input) => {
    expect(safeNextPath(input)).toBe('/')
  })

  it('refuses null and undefined', () => {
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
  })

  it('refuses an over-long value', () => {
    expect(safeNextPath(`/${'a'.repeat(600)}`)).toBe('/')
  })

  it('refuses to point back at the auth pages, which would bounce forever', () => {
    expect(safeNextPath('/login')).toBe('/')
    expect(safeNextPath('/auth/verify?token=x')).toBe('/')
  })

  it('honours an explicit fallback', () => {
    expect(safeNextPath('https://evil.example', '/dashboard')).toBe('/dashboard')
  })
})

describe('isPublicPath', () => {
  it.each([...PUBLIC_PATHS])('%s is public', (p) => {
    expect(isPublicPath(p)).toBe(true)
  })

  it('covers sub-paths of the auth routes', () => {
    expect(isPublicPath('/auth/verify')).toBe(true)
  })

  it.each(['/', '/dashboard', '/maker/abc', '/api/handoff', '/loginsomething'])(
    '%s is not public',
    (p) => {
      expect(isPublicPath(p)).toBe(false)
    }
  )
})

describe('homePathForRole', () => {
  it('sends a maker to their inbox and a customer to their kitchen', () => {
    expect(homePathForRole('maker')).toBe('/dashboard')
    expect(homePathForRole('customer')).toBe('/')
  })
})

describe('loginUrl', () => {
  it('encodes a safe next', () => {
    expect(loginUrl('/maker/abc?x=1')).toBe('/login?next=%2Fmaker%2Fabc%3Fx%3D1')
  })

  it('drops an unsafe next rather than passing it through', () => {
    expect(loginUrl('//evil.example')).toBe('/login')
    expect(loginUrl(null)).toBe('/login')
  })
})
