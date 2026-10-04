/**
 * What a project's state *means* to the maker looking at their list.
 *
 * Pure, so the distinctions can be tested rather than eyeballed. They are not
 * cosmetic — they are the maker's whole triage:
 *
 *   invited              → they never clicked. Chase them, or the link got lost.
 *   opened               → they clicked and did nothing. Something put them off
 *                          immediately, which is worth knowing.
 *   in_progress          → mid-flow. Leave them alone.
 *   submitted            → a brief is waiting.
 *   changed_since_submit → they edited AFTER you already had a brief, possibly
 *                          after you quoted it. The one state that is easy to
 *                          miss and expensive to miss.
 *
 * `changed_since_submit` is `content_changed_at > brief.created_at` (0008):
 * the checkpoint route moves `content_changed_at` only when the saved
 * kitchen differs from the brief the maker has (`contentChangedAt`), not on
 * every write. `updated_at` is every write — a walk back through the steps
 * from the review (IMP-07), a sign-off re-stamped — and stays the list's
 * "last activity". Flagging those would invent a change the homeowner, whose
 * review offers nothing to send, could never clear.
 */
import { FLOW, resolveStepId, stepNumber, type FlowStepId } from '@/lib/flow'
import { briefPrint } from '@/lib/handoff/review'
import type { ProjectSnapshot } from './snapshot'

export type ProjectDisplayStatus =
  | 'invited'
  | 'opened'
  | 'in_progress'
  | 'submitted'
  | 'changed_since_submit'
  | 'archived'

export interface StatusInput {
  status: string
  openedAt: string | null
  step: string | null
  /** When the kitchen last differed from the current brief; null while it is that brief (0008). */
  contentChangedAt: string | null
  /** created_at of the project's current brief, when there is one. */
  currentBriefCreatedAt: string | null
}

/**
 * The kitchen differs from the brief on file, and has since that brief went
 * out (0008): the maker's "izmijenjeno", and on the kitchen home the
 * homeowner's "changes not sent yet" — one test, so the two sides never
 * disagree about it.
 */
export function changedSinceBrief(contentChangedAt: string | null, briefCreatedAt: string | null): boolean {
  return (
    briefCreatedAt !== null &&
    contentChangedAt !== null &&
    Date.parse(contentChangedAt) > Date.parse(briefCreatedAt)
  )
}

export function projectDisplayStatus(p: StatusInput): ProjectDisplayStatus {
  if (p.status === 'archived') return 'archived'

  if (p.status === 'submitted' || p.currentBriefCreatedAt) {
    return changedSinceBrief(p.contentChangedAt, p.currentBriefCreatedAt) ? 'changed_since_submit' : 'submitted'
  }

  // A saved step is proof on its own: only the customer's checkpoint writes
  // it. A kitchen worked on before every first open was stamped (a second
  // invite, signed into at /login) must not read "never opened".
  if (!p.openedAt && !p.step) return 'invited'
  // Opened but still sitting on the first step is "showed up and stalled",
  // which reads very differently from "working through it".
  if (!p.step || p.step === FLOW[0].id) return 'opened'
  return 'in_progress'
}

/**
 * The `content_changed_at` a checkpoint stores with `snapshot` (0008):
 *  - null while the saved kitchen IS the brief the maker has — a look, a walk
 *    back through the steps, a sign-off re-stamped, a change undone. Those
 *    saves still land (a resume needs them); they are not a change.
 *  - `now` once it differs, or when the brief's print is unknown: a brief
 *    sent before 0008 whose journey keeps no record of it either — every
 *    save then counts, as before.
 *  - null without a brief: the flag needs one.
 * The brief's print is the project's `brief_print` (the handoff's, from the
 * profile it was sent); for an older brief, the journey's own record of it
 * (`sentReview`) when that names the current brief.
 */
export function contentChangedAt(
  project: { currentBriefId: string | null; briefPrint: string | null },
  snapshot: unknown,
  now: string
): string | null {
  if (!project.currentBriefId) return null
  const snap = (snapshot && typeof snapshot === 'object' ? snapshot : {}) as Partial<ProjectSnapshot>
  const sent = snap.sentReview
  const onFile =
    project.briefPrint ??
    (sent?.briefId === project.currentBriefId && typeof sent.profilePrint === 'string' ? sent.profilePrint : null)
  const profile = snap.profile
  if (onFile && profile && typeof profile === 'object' && briefPrint(profile) === onFile) return null
  return now
}

/** True for the states a maker should act on. Drives the top group of the list. */
export function needsAttention(status: ProjectDisplayStatus): boolean {
  return status === 'submitted' || status === 'changed_since_submit'
}

export type DashboardGroup = 'attention' | 'decided' | 'active' | 'waiting' | 'closed'

/**
 * Which group of the maker's list a project sits in, once the maker's own
 * decision on the current brief is taken into account (IMP-03).
 *
 *   closed    → archived, or the maker declined. Declined counts even if the
 *               archive write after it failed: the brief is the source of
 *               truth, archiving only tidies the list.
 *   attention → a brief waiting on the maker, or ANY edit after the brief —
 *               an edit after a quote or a question is the expensive one to
 *               miss, so it outranks the decision.
 *   decided   → quoted or asked a question; the ball is with the customer.
 *   active    → opened or mid-flow.
 *   waiting   → invited, never opened.
 */
export function dashboardGroup(display: ProjectDisplayStatus, makerStatus: string | null): DashboardGroup {
  if (display === 'archived' || makerStatus === 'declined') return 'closed'
  if (display === 'changed_since_submit') return 'attention'
  if (display === 'submitted') {
    return makerStatus === 'quoted' || makerStatus === 'clarify' ? 'decided' : 'attention'
  }
  if (display === 'invited') return 'waiting'
  return 'active'
}

export interface StepProgress {
  current: number
  total: number
  stepId: FlowStepId
}

/**
 * "step 4 of 9", using the same numbering the homeowner sees in their own rail,
 * so the maker and the customer are never describing different steps.
 */
export function stepProgress(step: string | null): StepProgress | null {
  if (!step) return null
  const stepId = resolveStepId(step)
  if (!stepId) return null
  // The builder step is excluded from the homeowner's numbering (see
  // lib/flow.ts), so show it as the step it follows rather than as a gap.
  const total = FLOW.filter((s) => s.id !== 'builder').length
  const current = stepId === 'builder' ? stepNumber('confirm_look') : stepNumber(stepId)
  return { current: Math.max(1, current), total, stepId }
}
