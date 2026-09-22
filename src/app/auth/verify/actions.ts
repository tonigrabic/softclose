'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { activateAccount, findAccountById, touchLastLogin } from '@/lib/auth/accounts'
import { consumeToken } from '@/lib/auth/magic-link'
import { homePathForRole, safeNextPath } from '@/lib/auth/redirect'
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth/session'
import { maskEmail } from '@/lib/auth/tokens'
import { markProjectOpened } from '@/lib/auth/projects'

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

  const account = await findAccountById(claim.accountId)
  if (!account || account.status === 'disabled') return { failed: true }

  // An invite is also the account's activation: pending → active, and the
  // project stops being merely "invited".
  if (claim.purpose === 'invite') {
    await activateAccount(account.id)
    if (claim.projectId) await markProjectOpened(claim.projectId)
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
