/**
 * Hybrid layout derivation — the seam for "derive the layout from the AI render".
 *
 * Product decision (2026-06-21): the kitchen we PRICE is the AI-generated
 * design, so its layout should come from the render — but an AI image has no
 * true scale, and the render is img2img-anchored to the homeowner's photo, so
 * the room SHELL (dimensions, openings) is the photo's. We therefore MERGE:
 *
 *   scale + shell (lengthCm, widthCm, windows, doors, existing features)
 *       ← the original space photos  (`/api/space-vision`, the only true cm scale)
 *   configuration (shape, island)
 *       ← the generated render       (`/api/builder-hypothesis` → layout)
 *
 * The homeowner then confirms/edits the proposed plan in the editor before it
 * is frozen into the contract — so a render mis-read is always correctable.
 *
 * Pure functions, no AI calls — easy to unit-test.
 */
import type { SpaceVisionResult, SpaceFeatures, FeaturePosition, WallSide } from '@/lib/types'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { fromVision, type FloorPlan, type LayoutShape } from '@/lib/floor-plan'

/** A guessed feature position, anchored to the hob when we know it. */
function anchoredFeature(anchor: FeaturePosition | undefined, primaryWall: WallSide): FeaturePosition {
  return anchor
    ? { wall: anchor.wall, positionPct: anchor.positionPct, confidence: 'L' }
    : { wall: primaryWall, positionPct: 50, confidence: 'L' }
}

/**
 * Overlay the render's layout configuration onto the photo's scale + shell,
 * producing a single `SpaceVisionResult` ready for `fromVision`.
 *
 * - With no render layout, returns the photo vision unchanged (legacy path).
 * - Shape + island come from the render when it read them; everything else
 *   (dimensions, windows, doors, feature positions) stays the photo's.
 */
export function spaceVisionWithRenderLayout(
  photoVision: SpaceVisionResult | null | undefined,
  hypothesis: BuilderHypothesis | null | undefined
): SpaceVisionResult | null {
  if (!hypothesis) return photoVision ?? null

  // Base on the photo read (scale + shell). When there were no photos we still
  // synthesise a minimal result so the render's shape drives a preset-sized plan.
  const base: SpaceVisionResult = photoVision
    ? { ...photoVision }
    : { lookedLikeKitchen: true }

  const renderLayout = hypothesis.layout
  if (renderLayout) {
    const renderShape = renderLayout.shape?.value
    if (renderShape && renderShape !== 'unsure') {
      base.layoutShape = renderShape as LayoutShape
    }
    // The render is authoritative for the DESIGN, including the island: render
    // says island ⇒ island, render silent ⇒ NO island. This is the phantom-island
    // fix — a stale island from the photo read can no longer leak through.
    if (renderLayout.hasIsland?.value === true) {
      base.hasIsland = true
    } else {
      base.hasIsland = false
      if (base.features?.island) base.features = { ...base.features, island: undefined }
    }
    // Ceiling height: the photo read wins (it can anchor to references); fall
    // back to the render's guess only when the photo didn't capture one.
    if (base.ceilingHeightCm == null && renderLayout.ceilingHeightCm?.value) {
      base.ceilingHeightCm = renderLayout.ceilingHeightCm.value
    }
  }

  // Seed the appliances homeowners always forget — the OVEN and the extractor
  // HOOD — from the render's appliance read when the photo read didn't place
  // them. They sit at the hob (oven below, hood above), so we co-locate; the
  // homeowner can nudge either on the canvas.
  const ap = hypothesis.appliances
  if (ap) {
    const features: SpaceFeatures = { ...(base.features ?? {}) }
    const primaryWall: WallSide = base.wallRuns?.[0]?.wall ?? 'top'
    if (ap.oven && !features.oven) features.oven = anchoredFeature(features.hob, primaryWall)
    if (ap.extractor && !features.hood) features.hood = anchoredFeature(features.hob, primaryWall)
    base.features = features
  }

  return base
}

/**
 * Build the proposed `FloorPlan` for the post-render "Confirm layout & look"
 * step: render configuration over photo scale, through the single `fromVision`
 * constructor (so there is still exactly one FloorPlan-construction path).
 */
export function renderDerivedFloorPlan(
  photoVision: SpaceVisionResult | null | undefined,
  hypothesis: BuilderHypothesis | null | undefined
): FloorPlan {
  return fromVision(spaceVisionWithRenderLayout(photoVision, hypothesis))
}
