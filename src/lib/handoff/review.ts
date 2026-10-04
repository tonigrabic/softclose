/**
 * Review, then send (IMP-07).
 *
 * The wrap-up used to POST /api/handoff on mount: the brief was inserted and
 * the maker emailed before the homeowner read a line of "Pregledaj što
 * šaljemo". Now the wrap-up is a review, and only an explicit button sends.
 *
 * Two rules keep that honest, and both are pure, so they live here:
 *
 *  1. A walk back through the steps that changes nothing is not a new brief.
 *     `briefPrint` is the content of the brief's profile, minus what a re-walk
 *     stamps on its own (sign-off times, the builder's reducer clock) and with
 *     images normalised (a data URL here, `omitted://image` on a second
 *     device). The intake keeps the review — and its brief id — when the print
 *     is unchanged (`keepsReview`), so the review shows the brief the maker
 *     already has and offers no send.
 *  2. What the review offers follows from the brief on file (`reviewState`,
 *     `sendOffer`): the first send, "send the changes" once the review is a
 *     different brief from the one the maker has, and nothing for the maker
 *     looking in, for the brief they already have, after a send in this visit
 *     or on a closed project.
 *
 * Pure and client-safe.
 */
import { snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import type { LeadProfile, WrapUpData } from '@/lib/types'

/** The content of a brief's profile: what changes the brief, nothing else. */
export function briefPrint(profile: LeadProfile): string {
  const rc = profile.roomConfirmed
  const build = profile.builderState as Record<string, unknown> | undefined
  return snapshotFingerprint(
    stripImages({
      ...profile,
      // Stamped by every pass through the confirm step and the room step.
      contractConfirmedAt: undefined,
      roomConfirmed: rc && { ...rc, at: undefined },
      // Stamped by every builder action and every relock on re-entry.
      builderState: build && { ...build, lastUpdatedAt: undefined },
    })
  )
}

/**
 * The review on screen can be kept as it is — same brief id, same summary —
 * because the profile has not changed since it was built. A review without a
 * print (a snapshot from before IMP-07) is rebuilt once.
 */
export function keepsReview(prev: WrapUpData | null, print: string): boolean {
  return Boolean(prev?.briefId) && prev?.profilePrint === print
}

/**
 * - `readOnly`: the maker looking in. Sending is the customer's act.
 * - `first`: no brief on file yet.
 * - `sent`: the review IS the brief on file (same id).
 * - `changed`: the maker has an earlier brief; this review is a new one.
 */
export type ReviewState = 'readOnly' | 'first' | 'sent' | 'changed'

export function reviewState(input: {
  readOnly: boolean
  /** The project's current brief: the page load's, or one sent in this visit. */
  onFileBriefId: string | null | undefined
  /** The id the review on screen would be sent under. */
  reviewBriefId: string | null | undefined
}): ReviewState {
  if (input.readOnly) return 'readOnly'
  if (!input.onFileBriefId) return 'first'
  return input.reviewBriefId === input.onFileBriefId ? 'sent' : 'changed'
}

export type SendOffer = 'first' | 'changes' | null

/**
 * What the review offers to send. Nothing when there is nothing to send — the
 * maker looking in, the brief the maker already has, a send already made from
 * this screen, or a project the maker closed (IMP-03: the handoff answers 409).
 */
export function sendOffer(state: ReviewState, ctx: { sentNow: boolean; closed: boolean }): SendOffer {
  if (state === 'readOnly' || state === 'sent' || ctx.sentNow || ctx.closed) return null
  return state === 'first' ? 'first' : 'changes'
}
