import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/session'

/**
 * POST only, and it must stay that way.
 *
 * Next prefetches <Link> targets, so a GET /logout would sign people out when
 * they merely hovered something pointing at it. The UI posts a form — see
 * LogoutButton — and there is deliberately no GET export here.
 */
export async function POST(req: Request) {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
}
