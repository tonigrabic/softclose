import { NextResponse, type NextRequest } from 'next/server'
import { isPublicPath, loginUrl } from '@/lib/auth/redirect'
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  shouldRefresh,
  signSession,
  verifySession,
} from '@/lib/auth/session'

/**
 * Proxy — what Next 16 calls what used to be Middleware.
 *
 * This is the redirect, NOT the gate. Next's own reference says so plainly:
 * Server Functions POST to whatever route they are used on, so changing the
 * matcher can silently remove coverage from code that looks protected. The real
 * decisions live in src/lib/auth/dal.ts, and every page, action and route
 * handler calls those for itself. What this file buys is that a signed-out
 * visitor gets a login page instead of a broken one.
 *
 * It must stay cheap and dependency-light: it runs on every request including
 * prefetches, so it verifies the cookie's signature and touches no database.
 * It also must never import a 'use client' module — one bad edge here 500s the
 * entire app rather than a single route (tests/server-client-boundary covers it).
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (!claims) {
    if (isPublicPath(pathname)) return NextResponse.next()
    // A fetch() from the intake must not receive an HTML login page: the
    // client's readJson() would surface the markup as an error string. Answer
    // the way an API should and let the caller decide.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 })
    }
    return NextResponse.redirect(new URL(loginUrl(pathname + search), req.nextUrl))
  }

  // Signed in and standing on the sign-in page — send them somewhere useful.
  if (pathname === '/login') {
    return NextResponse.redirect(new URL(claims.role === 'maker' ? '/dashboard' : '/', req.nextUrl))
  }

  // Let the DAL build an accurate ?next= without every page repeating itself.
  const headers = new Headers(req.headers)
  headers.set('x-sc-path', pathname + search)
  const res = NextResponse.next({ request: { headers } })

  // The sliding refresh has to happen HERE. cookies().set() throws during a
  // Server Component render, so the DAL cannot do it even though the DAL is
  // where the session is otherwise handled.
  if (shouldRefresh(claims)) {
    const fresh = await signSession({ sub: claims.sub, role: claims.role, epoch: claims.epoch })
    if (fresh) res.cookies.set(SESSION_COOKIE, fresh, sessionCookieOptions())
  }

  return res
}

export const config = {
  // Everything except build output and static assets. Public paths are decided
  // in code (isPublicPath), not here — see the note above about matcher
  // exclusions quietly un-protecting Server Functions.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|txt|xml|json)$).*)',
  ],
}
