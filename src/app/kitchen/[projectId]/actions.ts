'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { requireProjectAccess, requireSession } from '@/lib/auth/dal'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { supabaseAdmin } from '@/lib/db/supabase'
import { eraseCustomerAccount, eraseCustomerProject } from '@/lib/project/erase'

/**
 * 'account': the kitchen is gone but the account step stopped. The project
 * row no longer exists, so this action would now 404 — the retry is
 * deleteMyAccount().
 */
export type DeleteKitchenResult = { ok: false; error: 'incomplete' | 'unavailable' | 'account' }

/**
 * "Izbriši moju kuhinju" — the homeowner erases their own kitchen (IMP-09).
 *
 * `requireProjectAccess()` runs here, not only on the page: a Server Action is
 * a POST anyone can send with any arguments, and the page's own guard does not
 * run on it. It redirects a signed-out caller and answers `notFound()` for a
 * malformed id or a project that is not theirs. On top of it, only the
 * project's own CUSTOMER may erase — the maker's read-only view may look,
 * never delete.
 *
 * Success signs the browser out (the account may be gone with the kitchen,
 * and a cookie for a deleted account is a dead end) and lands on a calm
 * confirmation at /login?deleted=1. Cookie, then revalidate, then redirect —
 * the order Next's mutating-data guide gives — and the redirect stays outside
 * any try, since it works by throwing.
 *
 * A deletion that stops part-way keeps the cookie. Up to the project row, the
 * rows that point at anything still left are still there (lib/project/erase
 * deletes Storage first and puts the project's status back), so the kitchen
 * page still opens and the same button retries. Past it — only the account
 * left — the answer is 'account', and the panel retries with deleteMyAccount.
 */
export async function deleteMyKitchen(projectId: unknown): Promise<DeleteKitchenResult> {
  const { session, project } = await requireProjectAccess(typeof projectId === 'string' ? projectId : '')
  // The maker's read-only view may look, never erase — and only the project's own customer.
  if (session.role !== 'customer' || project.customerId !== session.accountId) notFound()

  const db = supabaseAdmin()
  if (!db) return { ok: false, error: 'unavailable' }

  const result = await eraseCustomerProject(db, {
    projectId: project.id,
    customerId: session.accountId,
    status: project.status,
  })
  // Cookie kept: the session is still valid for a retry.
  if (!result.ok) return { ok: false, error: result.failedAt === 'account' ? 'account' : 'incomplete' }

  ;(await cookies()).delete(SESSION_COOKIE)
  revalidatePath('/dashboard')
  redirect('/login?deleted=1')
}

/**
 * "Izbriši moj račun" — a homeowner's account once no kitchen is left on it
 * (IMP-09): the retry when deleteMyKitchen stopped at the account step, and
 * the no-kitchen panel at / (an account that outlived its project).
 *
 * Customers only, and only their own account — the session names it; there
 * is no argument to forge. The erase deletes nothing while any project names
 * the customer (and the FK is RESTRICT behind it); if one does — a new invite
 * landed — the account stays and / takes them to that kitchen.
 */
export async function deleteMyAccount(): Promise<DeleteKitchenResult> {
  const session = await requireSession()
  if (session.role !== 'customer') notFound()

  const db = supabaseAdmin()
  if (!db) return { ok: false, error: 'unavailable' }

  const result = await eraseCustomerAccount(db, { customerId: session.accountId })
  if (!result.ok) return { ok: false, error: 'incomplete' }
  if (!result.accountDeleted) redirect('/')

  ;(await cookies()).delete(SESSION_COOKIE)
  revalidatePath('/dashboard')
  redirect('/login?deleted=account')
}
