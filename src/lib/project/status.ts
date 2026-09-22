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
 * `changed_since_submit` is derived from `updated_at > brief.created_at` rather
 * than stored, which is why checkpoints must not write when nothing changed: a
 * no-op save that bumped updated_at would invent customer activity that never
 * happened.
 */
import { FLOW, flowIndex, stepNumber, type FlowStepId } from '@/lib/flow'

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
  updatedAt: string
  /** created_at of the project's current brief, when there is one. */
  currentBriefCreatedAt: string | null
}

export function projectDisplayStatus(p: StatusInput): ProjectDisplayStatus {
  if (p.status === 'archived') return 'archived'

  if (p.status === 'submitted' || p.currentBriefCreatedAt) {
    const changed =
      p.currentBriefCreatedAt !== null && Date.parse(p.updatedAt) > Date.parse(p.currentBriefCreatedAt)
    return changed ? 'changed_since_submit' : 'submitted'
  }

  if (!p.openedAt) return 'invited'
  // Opened but still sitting on the first step is "showed up and stalled",
  // which reads very differently from "working through it".
  if (!p.step || p.step === FLOW[0].id) return 'opened'
  return 'in_progress'
}

/** True for the states a maker should act on. Drives the top group of the list. */
export function needsAttention(status: ProjectDisplayStatus): boolean {
  return status === 'submitted' || status === 'changed_since_submit'
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
  if (flowIndex(step as FlowStepId) === -1) return null
  const stepId = step as FlowStepId
  // The builder step is excluded from the homeowner's numbering (see
  // lib/flow.ts), so show it as the step it follows rather than as a gap.
  const total = FLOW.filter((s) => s.id !== 'builder').length
  const current = stepId === 'builder' ? stepNumber('confirm_look') : stepNumber(stepId)
  return { current: Math.max(1, current), total, stepId }
}
