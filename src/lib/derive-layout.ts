/**
 * The plan the post-render "Confirm layout & look" step opens with.
 *
 * Decision 2026-10-03 (IMP-31, IMP-32): the plan owns the layout, never the
 * picture. The render is a concept anchored to one photo, with no true scale,
 * so it is not read back into the plan: the layout the homeowner confirms —
 * and we price — is the room they measured on the room step with their intent
 * applied, or their own edits to it. The render read (`/api/builder-hypothesis`)
 * contributes decor and materials only (`decorHypothesis`).
 *
 * Pure, no AI calls.
 */
import type { SpaceVisionResult } from '@/lib/types'
import { fromVision, type FloorPlan } from '@/lib/floor-plan'

/**
 * A plan already in hand (the homeowner's edits, or the working plan the room
 * step just committed) always wins; then the plan on the profile — measured
 * since IMP-31, or a legacy journey's confirmed plan, kept as it is; only a
 * journey with no plan at all starts from the photo read.
 */
export function seedConfirmPlan(
  current: FloorPlan | null | undefined,
  profilePlan: FloorPlan | null | undefined,
  photoVision: SpaceVisionResult | null | undefined
): FloorPlan {
  if (current) return current
  if (profilePlan) return profilePlan
  return fromVision(photoVision)
}
