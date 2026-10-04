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
 *     is unchanged, and goes back to the brief the maker has whenever the
 *     print is that brief's again (`keptReview`), so the review shows the
 *     brief the maker already has and offers no send.
 *  2. What the review offers follows from the brief on file (`reviewState`,
 *     `sendOffer`): the first send, "send the changes" once the review is a
 *     different brief from the one the maker has, and nothing for the maker
 *     looking in, for the brief they already have, after a send in this visit
 *     or on a closed project.
 *
 * Pure and client-safe.
 */
import { snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
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
 * print of its own (a snapshot from before IMP-07) is compared with
 * `legacyPrint` when its snapshot could vouch for one, else rebuilt once.
 */
export function keepsReview(prev: WrapUpData | null, print: string, legacyPrint: string | null = null): boolean {
  if (!prev?.briefId) return false
  return (prev.profilePrint ?? legacyPrint) === print
}

/**
 * The print a review saved before IMP-07 (no `profilePrint`) was built from,
 * when its snapshot can vouch for it: saved while on the review (`isDone`),
 * the snapshot's profile IS the reviewed one — a finish sets both together,
 * and every edit leaves the review first. Null otherwise. The intake records
 * it with the review once that review is kept (`keptReview`) or found to be
 * the brief on file (`sentReviewFrom`); those saves do not flag the brief as
 * changed for the maker, whose flag follows the kitchen's content (0008).
 */
export function legacyReviewPrint(
  snap: Pick<ProjectSnapshot, 'isDone' | 'wrapUpData' | 'profile'> | null | undefined
): string | null {
  if (!snap?.isDone || !snap.wrapUpData?.briefId || snap.wrapUpData.profilePrint) return null
  return briefPrint(snap.profile ?? {})
}

/**
 * The review the brief on file went out from, as a restored snapshot knows it
 * — or null. Trusted only while it names the project's current brief
 * (`onFileBriefId`): a send that failed, or a newer brief sent from another
 * device, is not the brief the maker has.
 *  - the snapshot's own record (`sentReview`, written once a send succeeded);
 *  - else its review, when that review IS the brief on file: with its print,
 *    or — saved before IMP-07 — the print its snapshot vouches for
 *    (`legacyReviewPrint`).
 * The intake keeps it in its snapshot, so it outlives the visit that derived
 * it: a later visit that finds the journey off the review (isDone false) can
 * no longer vouch for a legacy print.
 */
export function sentReviewFrom(
  snap: Pick<ProjectSnapshot, 'isDone' | 'wrapUpData' | 'profile' | 'sentReview'> | null | undefined,
  onFileBriefId: string | null | undefined
): WrapUpData | null {
  if (!snap || !onFileBriefId) return null
  const stored = snap.sentReview
  if (stored?.briefId === onFileBriefId && typeof stored.profilePrint === 'string') return stored
  const review = snap.wrapUpData
  if (!review || review.briefId !== onFileBriefId) return null
  if (review.profilePrint) return review
  const print = legacyReviewPrint(snap)
  return print ? { ...review, profilePrint: print } : null
}

/**
 * The review a finish can show without building a new one, or null (a new
 * brief, under a new id):
 *  1. the brief the maker has (`sent`), when the profile prints the same as
 *     the one sent — a walk back, a change made and undone, a reload in
 *     between: the review then IS that brief and offers no send;
 *  2. else the review on screen, when nothing changed since it was built — a
 *     review from before IMP-07 by the print its snapshot vouches for, which
 *     is then written into it, so the next visit does not depend on the
 *     snapshot still being on the review.
 */
export function keptReview(
  print: string,
  ctx: { prev: WrapUpData | null; sent: WrapUpData | null; legacyPrint?: string | null }
): WrapUpData | null {
  if (ctx.sent?.briefId && ctx.sent.profilePrint === print) return ctx.sent
  if (!keepsReview(ctx.prev, print, ctx.legacyPrint ?? null)) return null
  return ctx.prev!.profilePrint ? ctx.prev : { ...ctx.prev!, profilePrint: print }
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
