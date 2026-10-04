/**
 * Edits from the review (IMP-07): "Nešto ispraviti?" on a section, Back, a
 * done step on the rail and "Izmijeni kuhinju" on the kitchen home all reopen
 * a step — and Continue from an edited step comes back to the review instead
 * of walking every step after it again.
 *
 * Pure and client-safe; the intake and the rails read it, the tests pin it.
 */
import { nextStepId, type FlowStepId } from '@/lib/flow'
import type { BuilderScreenId } from '@/lib/builder/inventory'
import type { TranslationKey } from '@/lib/i18n/core'
import { legacyReviewPrint } from '@/lib/handoff/review'
import { snapshotFingerprint, stripImages } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { LeadProfile, SpaceVisionResult } from '@/lib/types'

/** Where an edit opens: a funnel step, or a builder group. */
export type ReviewTarget = { step: FlowStepId; group?: BuilderScreenId }

/** The review's sections, as WrapUpScreen renders them. */
export type ReviewSection =
  | 'render'
  | 'space'
  | 'basics'
  | 'scope'
  | 'style'
  | 'materials'
  | 'trades'
  | 'lighting'
  | 'wishlist'
  | 'logistics'
  | 'confidence'
  | 'moodboard'
  | 'contact'

/**
 * The step each section's "Nešto ispraviti?" opens. Null where no step asks
 * it any more: the scope step was cut (2026-09-23) and decision confidence is
 * a legacy capture — those sections still show what an older journey holds,
 * with nothing to fix it in.
 */
export const REVIEW_FIX: Record<ReviewSection, ReviewTarget | null> = {
  render: { step: 'concept_render' },
  space: { step: 'confirm_look' },
  // The only basic still asked is the timeline, on the logistics step.
  basics: { step: 'logistics' },
  scope: null,
  // The tagged styles come from the inspiration tiles (derivePrefills); the
  // builder cannot change them.
  style: { step: 'inspiration' },
  // The picks (fronts, worktop, backsplash) are the builder's.
  materials: { step: 'builder', group: 'doors' },
  // The sink answer is given on the confirm step.
  trades: { step: 'confirm_look' },
  lighting: { step: 'builder', group: 'lighting' },
  wishlist: { step: 'wishlist' },
  logistics: { step: 'logistics' },
  confidence: null,
  moodboard: { step: 'inspiration' },
  contact: { step: 'contact' },
}

/** Where Continue goes from a step: the next step, or the review. */
export type AfterCommit = FlowStepId | 'review'

export interface CommitContext {
  editing: boolean
  hasBuild: boolean
  /** On the photo step: the photos or their read differ from the ones committed (`spacePhotosChanged`). */
  photosChanged?: boolean
}

/**
 * Not editing (the first walk): the next step, and the review after contact.
 *
 * Editing (the review has been reached once): straight back to the review —
 * except where the change has to travel. New photos reopen the room step,
 * which reads them as one room (the brief must not carry new photos with the
 * old read); a new room reopens the confirm step, whose plan follows it; a
 * confirmed layout with a build reopens the builder, which relocks the build
 * to the new layout (the units follow the plan, every pick survives) and
 * prices it again before the review shows a range.
 */
export function afterCommit(step: FlowStepId, ctx: CommitContext): AfterCommit {
  if (!ctx.editing) return nextStepId(step) ?? 'review'
  if (step === 'space_photos') return ctx.photosChanged ? 'room' : 'review'
  if (step === 'room') return 'confirm_look'
  if (step === 'confirm_look') return ctx.hasBuild ? 'builder' : 'review'
  return 'review'
}

/** The footer's Continue says where it goes: "Pregledaj sažetak" when that is the review. */
export function continueKey(step: FlowStepId, ctx: CommitContext): TranslationKey {
  return afterCommit(step, ctx) === 'review' ? 'nav.review' : 'nav.continue'
}

/**
 * The photo step's photos or read differ from what the profile holds. Photos
 * compared as they are, not image-stripped: one photo swapped for another is
 * the same count of `omitted://image` markers, and a different room. A
 * resumed journey's markers equal the profile's own.
 */
export function spacePhotosChanged(
  draft: { photos: string[]; vision: SpaceVisionResult | null },
  profile: Pick<LeadProfile, 'spacePhotos' | 'spaceVisionResult'>
): boolean {
  const committed = profile.spacePhotos ?? []
  if (draft.photos.length !== committed.length || draft.photos.some((p, i) => p !== committed[i])) return true
  const read = (v: SpaceVisionResult | null | undefined) => snapshotFingerprint(stripImages(v ?? null))
  return read(draft.vision) !== read(profile.spaceVisionResult)
}

/**
 * The wishlist as typed, for telling whether it changed since it was last
 * translated. Trimmed, so a trailing space is not a change; one value per
 * field, so text moving between fields is.
 */
export function wishlistSource(mustHaves: string, niceToHaves: string, dealBreakers: string): string {
  return JSON.stringify([mustHaves.trim(), niceToHaves.trim(), dealBreakers.trim()])
}

/**
 * Translate again only when the typed wishlist changed since the lists in the
 * profile were made from it — or there are no lists for it yet. The
 * translation is an AI call: run on unchanged text it words the lists afresh,
 * which would make an unchanged kitchen a new brief.
 */
export function needsTranslate(source: string, translatedFrom: string | undefined, hasLists: boolean): boolean {
  return !hasLists || source !== translatedFrom
}

/**
 * The typed wishlist a restored journey's lists were translated from. A
 * snapshot from before IMP-07 has no record of it — yet passing the wishlist
 * step unchanged must not ask the AI to word an unchanged kitchen afresh. One
 * saved on its review with a brief id (the case `legacyReviewPrint` vouches
 * for) translated exactly its stored text: the step never moved on without a
 * translation, and nothing reached the step again after it. Anything else:
 * unknown, translate once more.
 */
export function restoredWishlistSource(
  snap: Pick<
    ProjectSnapshot,
    'wishlistSource' | 'isDone' | 'wrapUpData' | 'profile' | 'mustHavesText' | 'niceToHavesText' | 'dealBreakersText'
  >
): string | undefined {
  if (typeof snap.wishlistSource === 'string') return snap.wishlistSource
  if (!legacyReviewPrint(snap)) return undefined
  return wishlistSource(snap.mustHavesText ?? '', snap.niceToHavesText ?? '', snap.dealBreakersText ?? '')
}

/**
 * Where "Izmijeni kuhinju" opens. A customer whose brief went out edits from
 * the last step (contact), never the done screen: Back walks the steps,
 * Continue opens the review, and the rail jumps anywhere done. Everyone else
 * resumes where the journey was left — the maker looking in, and a finished,
 * unsent kitchen, whose review is where it was left.
 */
export function editEntryStep(ctx: { submitted: boolean; readOnly: boolean }): FlowStepId | undefined {
  return ctx.submitted && !ctx.readOnly ? 'contact' : undefined
}
