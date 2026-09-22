/**
 * Where to send people, and — more importantly — where not to.
 *
 * Pure and dependency-free so the proxy can use it and the tests can hammer it.
 * `safeNextPath` is the open-redirect guard: it is applied when a token is
 * ISSUED, and the result is stored on the token row, so the emailed URL carries
 * no redirect parameter at all. There is nothing in the link for anyone to
 * rewrite into a link to their own site.
 */
import type { Role } from './session'

/** Reachable without a session. Kept in code, not in the proxy's matcher regex:
 *  the matcher also governs Server Function POSTs, so an exclusion there can
 *  silently drop authorization from a route (Next's own proxy docs warn about
 *  exactly this). A named, tested function is greppable; a regex is not. */
export const PUBLIC_PATHS = ['/login', '/auth/verify', '/logout'] as const

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function homePathForRole(role: Role): string {
  return role === 'maker' ? '/dashboard' : '/'
}

const MAX_NEXT_LENGTH = 512

/**
 * Accept only paths inside this app.
 *
 * Rejects, in order of how often each is actually tried: absolute URLs,
 * protocol-relative `//evil.com` (a browser reads that as a host, not a path),
 * backslash variants that browsers fold to `/`, and `/javascript:` style
 * schemes. Also refuses to point back at the auth pages themselves, which would
 * bounce someone between /login and /auth/verify forever.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  if (raw.length > MAX_NEXT_LENGTH) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback
  if (raw.includes('\n') || raw.includes('\r')) return fallback
  if (isPublicPath(raw.split('?')[0])) return fallback
  return raw
}

export function loginUrl(next?: string | null): string {
  const safe = next ? safeNextPath(next, '') : ''
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login'
}
