'use server'

import { headers } from 'next/headers'
import { findAccountByEmail } from '@/lib/auth/accounts'
import { devLinkIfAllowed } from '@/lib/auth/dev-link'
import { issueToken, recentTokenCount } from '@/lib/auth/magic-link'
import { safeNextPath } from '@/lib/auth/redirect'
import { authSecretConfigured } from '@/lib/auth/session'
import { isEmail, magicLinkUrl, maskEmail, normalizeEmail } from '@/lib/auth/tokens'
import { buildLoginEmail } from '@/lib/notify/auth-email'
import { emailProvider, sendEmail } from '@/lib/notify/send'
import { rateLimit } from '@/lib/rate-limit'

export interface LoginState {
  status: 'idle' | 'sent' | 'error'
  /** What we echo back — never a statement about whether the account exists. */
  email?: string
  /** invalidEmail | notConfigured | sendFailed | notSent (the mail did not go
   *  out: the provider refused it, or nothing is set up to send it). */
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
 *
 * "Sent" must be true, though (IMP-08): when the mail does not go out the form
 * says so — "Slanje nije uspjelo, zatraži link od izrađivača" — instead of
 * promising a link that is not coming. Nothing set up to send at all is
 * answered before the account lookup, the same for every address, so a server
 * without a provider cannot be used to tell registered addresses from the
 * rest. A provider refusing one message (quota, outage, a bad from-address)
 * can only be known after the send, so while it lasts an existing account
 * reads "not sent" where an unknown one reads "sent" — a signal tied to an
 * outage, accepted for the same reason as the timing one. In development the
 * link on screen (dev-link.ts) is the delivery, so no mail is not an error
 * there.
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

  // Production with no provider: no address gets a mail, so none is told one
  // is on its way (and no token is issued for a link nobody can receive).
  if (emailProvider() === 'none') {
    console.error('[auth] no email provider configured — sign-in links cannot be sent')
    return { status: 'error', email: raw, message: 'notSent' }
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
  const devLink = devLinkIfAllowed(url, result.ok)

  // Not accepted and not on screen: the link reaches nobody. Logged with what
  // the provider said — never the address in full, never the link.
  if (!result.ok && !devLink) {
    console.error(
      '[auth] login link not sent',
      maskEmail(email),
      result.provider,
      result.outcome,
      result.status ?? 'no status'
    )
    return { status: 'error', email: raw, message: 'notSent' }
  }

  console.info('[auth] login link issued', maskEmail(email), result.provider, result.outcome, result.status ?? '')
  return { status: 'sent', email: raw, devLink }
}
