'use server'

import { revalidatePath } from 'next/cache'
import { requireBriefAccess } from '@/lib/auth/dal'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { OPEN_STATUSES, validateDecision, type DecisionError, type MakerDecision } from '@/lib/project/decision'

export type DecideResult =
  | { ok: true; status: MakerDecision }
  | { ok: false; error: DecisionError | 'superseded' | 'stale' | 'unavailable' }

/**
 * Record the maker's decision on a brief: a quote (with the amount they
 * actually quoted), a question for the customer, or a decline (IMP-03).
 *
 * `requireBriefAccess()` is called here and not merely relied upon from the
 * proxy or the page — a Server Action POSTs to whatever route hosts it, Next's
 * own docs warn that matcher changes can take such a POST out of the proxy's
 * coverage, and the page's own guard does not run on an action call at all.
 * It also decides ownership: a signed-out caller is redirected; a customer,
 * another maker, an ownerless brief or a malformed id all get `notFound()`,
 * before anything is read further or written.
 *
 * Every argument is untrusted input (anyone can POST to an action with any
 * positional values), which is why they are typed `unknown` and go through
 * the same `validateDecision` the panel uses.
 *
 * The brief is the source of truth for every chip — maker's page, list and the
 * homeowner's kitchen home. Archiving a declined project runs second and only
 * tidies the list; if it fails it is logged, and the list still files the
 * project under "closed" from the brief's status.
 *
 * Returns only the outcome, never the row (Next's data-security guide).
 */
export async function decideBrief(
  briefId: unknown,
  status: unknown,
  note?: unknown,
  quotedEur?: unknown
): Promise<DecideResult> {
  const { session, brief } = await requireBriefAccess(typeof briefId === 'string' ? briefId : '')

  const checked = validateDecision({ from: brief.makerStatus, to: status, note, quotedEur })
  if (!checked.ok) return { ok: false, error: checked.error }
  const { decision } = checked

  const db = supabaseAdmin()
  if (!db) return { ok: false, error: 'unavailable' }

  // The kitchen home reads only the project's CURRENT brief. A decision on a
  // brief the customer has since replaced would never reach them, so refuse it
  // and let the maker look at the newer one.
  let project: { id: string; status: string } | null = null
  if (brief.projectId) {
    const { data, error } = await db
      .from(TABLES.projects)
      .select('id, current_brief_id, status')
      .eq('id', brief.projectId)
      .maybeSingle()
    if (error) {
      console.error('[maker] decide: project read failed', brief.id, error.message)
      return { ok: false, error: 'unavailable' }
    }
    if (data) {
      if (data.current_brief_id !== brief.id) return { ok: false, error: 'superseded' }
      project = { id: data.id as string, status: data.status as string }
    }
  }

  const payload: Record<string, unknown> = {
    maker_status: decision.status,
    maker_note: decision.note,
    decided_at: new Date().toISOString(),
  }
  // Only a quote carries an amount (the 0007 check insists on it both ways).
  if (decision.status === 'quoted') payload.quoted_eur = decision.quotedEur

  // Conditional on the status still being open: two tabs deciding at once must
  // not let the second overwrite a quote that the first already recorded.
  const { data: updated, error: updateError } = await db
    .from(TABLES.briefs)
    .update(payload)
    .eq('id', brief.id)
    .eq('maker_id', session.accountId)
    .in('maker_status', [...OPEN_STATUSES])
    .select('id')
  if (updateError) {
    console.error('[maker] decide: brief update failed', brief.id, updateError.message)
    return { ok: false, error: 'unavailable' }
  }
  if (!updated || updated.length === 0) return { ok: false, error: 'stale' }

  if (decision.status === 'declined' && project && project.status !== 'archived') {
    // Filtered on current_brief_id too: if the customer re-submitted in the
    // meantime, the new brief must not arrive in an archived project.
    const { error: archiveError } = await db
      .from(TABLES.projects)
      .update({ status: 'archived' })
      .eq('id', project.id)
      .eq('current_brief_id', brief.id)
    if (archiveError) console.error('[maker] decide: archive after decline failed', project.id, archiveError.message)
  }

  revalidatePath(`/maker/${brief.id}`)
  revalidatePath('/dashboard')
  if (project) revalidatePath(`/kitchen/${project.id}`)

  return { ok: true, status: decision.status }
}
