'use server'

import { headers } from 'next/headers'
import { findAccountByEmail } from '@/lib/auth/accounts'
import { devLinkIfAllowed } from '@/lib/auth/dev-link'
import { issueToken, recentTokenCount } from '@/lib/auth/magic-link'
import { safeNextPath } from '@/lib/auth/redirect'
import { authSecretConfigured } from '@/lib/auth/session'
import { isEmail, magicLinkUrl, maskEmail, normalizeEmail } from '@/lib/auth/tokens'
import { buildLoginEmail } from '@/lib/notify/auth-email'
import { sendEmail } from '@/lib/notify/send'
import { rateLimit } from '@/lib/rate-limit'

export interface LoginState {
  status: 'idle' | 'sent' | 'error'
  /** What we echo back — never a statement about whether the account exists. */
  email?: string
  message?: string
  /** Development only, and only when nothing sent the mail. See dev-link.ts. */
  devLink?: string | null
}

/** Per account, per hour. Stored in the token table because the in-memory
 *  limiter is per-Vercel-instance and would barely count across a fleet. */
const MAX_LOGIN_TOKENS_PER_HOUR = 5
const HOUR_MS = 60 * 60 * 1000

/**
 * Ask for a sign-in link.
 *
 * The single most important property: the response is identical whether or not
 * that email has an account. No account means we skip quietly — softclose is
 * invite-only, and "this address is not registered" would let anyone map the
 * customer list of every studio on it.
 *
 * (There is a timing difference left — the no-account path skips a database
 * write and an HTTP call. Closing it fully would mean padding the response;
 * the signal is small enough to accept, and worth knowing about.)
 */
export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get('email') ?? '')
  const next = safeNextPath(String(formData.get('next') ?? ''), '')
  const email = normalizeEmail(raw)

  if (!isEmail(email)) {
    return { status: 'error', email: raw, message: 'invalidEmail' }
  }

  if (!authSecretConfigured()) {
    console.error('[auth] AUTH_SECRET is not set — refusing to issue sign-in links')
    return { status: 'error', email: raw, message: 'notConfigured' }
  }

  // Stops someone cycling addresses to send mail from us. Per instance, so it
  // is a speed bump, not the limit — the durable one is per account, below.
  const h = await headers()
  const ipLimited = !rateLimit(
    new Request('http://local/login', { headers: h }),
    'login-request',
    10,
    HOUR_MS
  ).ok
  if (ipLimited) return { status: 'sent', email: raw }

  const account = await findAccountByEmail(email)
  if (!account || account.status === 'disabled') {
    console.info('[auth] login requested for unknown or disabled account', maskEmail(email))
    return { status: 'sent', email: raw }
  }

  const recent = await recentTokenCount(account.id, 'login', HOUR_MS)
  if (recent >= MAX_LOGIN_TOKENS_PER_HOUR) {
    console.warn('[auth] login link rate limit hit', maskEmail(email))
    return { status: 'sent', email: raw }
  }

  const issued = await issueToken({
    accountId: account.id,
    purpose: 'login',
    redirectTo: next || null,
  })
  if (!issued) return { status: 'error', email: raw, message: 'sendFailed' }

  const origin = process.env.APP_URL?.replace(/\/$/, '') || `https://${h.get('host') ?? 'localhost:3000'}`
  const url = magicLinkUrl(origin, issued.raw)
  const mail = buildLoginEmail({ url })
  const result = await sendEmail({ to: account.email, ...mail })

  console.info('[auth] login link issued', maskEmail(email), result.provider, result.outcome)
  return { status: 'sent', email: raw, devLink: devLinkIfAllowed(url, result.ok) }
}
