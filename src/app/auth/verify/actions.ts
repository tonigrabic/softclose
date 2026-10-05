'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { accountAdmitsSession, activateAccount, findAccountById, touchLastLogin } from '@/lib/auth/accounts'
import { consumeToken } from '@/lib/auth/magic-link'
import { homePathForRole, safeNextPath } from '@/lib/auth/redirect'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth/session'
import { maskEmail } from '@/lib/auth/tokens'

export interface VerifyState {
  failed: boolean
}

/**
 * Turn a magic link into a session.
 *
 * This runs on POST, not on the GET that loaded the page, and that is the whole
 * reason the page has a form on it at all: corporate mail gateways (Outlook
 * SafeLinks and friends) fetch every link in a message to scan it. On GET those
 * scanners would consume single-use tokens before the human ever clicked, and
 * the failure looks exactly like "your product is broken".
 */
export async function completeSignIn(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const raw = String(formData.get('token') ?? '')
  if (!raw) return { failed: true }

  const claim = await consumeToken(raw)
  if ((claim.verdict !== 'ok' && claim.verdict !== 'grace') || !claim.accountId) {
    console.warn('[auth] sign-in refused:', claim.verdict)
    return { failed: true }
  }

  const found = await findAccountById(claim.accountId)
  if (!found || found.status === 'disabled') return { failed: true }

  // A link that worked was opened from the account's own inbox — all an invite
  // proves, too. So either kind is the activation: pending → active. A customer
  // a maker invited who signs in at /login rather than through the invite is
  // the same person proving the same address. The kitchen stops reading
  // "invited" on the maker's list when they load it, not here: the kitchen
  // page stamps it, whichever way they arrived.
  if (found.status === 'pending') await activateAccount(found.id)

  // Read again, after activation, and ask the DAL's own question: a cookie
  // the DAL refuses would send every page to /login. Never hand one out.
  const account = await findAccountById(found.id)
  if (!account || !accountAdmitsSession(account, account.sessionEpoch)) {
    console.error('[auth] sign-in refused: account not active after activation', maskEmail(found.email), found.status)
    return { failed: true }
  }
  await touchLastLogin(account.id)

  const jwt = await signSession({
    sub: account.id,
    role: account.role,
    // Read fresh rather than from the token: an account disabled and re-enabled
    // between issuing and clicking must get the current epoch, not a stale one.
    epoch: account.sessionEpoch,
  })
  if (!jwt) return { failed: true }

  const jar = await cookies()
  jar.set(SESSION_COOKIE, jwt, sessionCookieOptions())
  console.info('[auth] signed in', maskEmail(account.email), account.role, claim.verdict)

  const destination =
    claim.purpose === 'invite' && claim.projectId
      ? `/kitchen/${claim.projectId}`
      : safeNextPath(claim.redirectTo, '') || homePathForRole(account.role)

  redirect(destination)
}
