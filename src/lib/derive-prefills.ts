import type { LeadProfile, SpaceVisionResult } from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

/**
 * Deterministic translator from vision results + selected styles into a
 * partial LeadProfile that pre-fills the "Confirm the look" step.
 *
 * Pure function. No AI calls. Easy to unit-test.
 */
export interface PrefillInput {
  selectedStyles: string[]
  inspirationVision: InspirationVisionResult | null
  spaceVision: SpaceVisionResult | null
}

export function derivePrefills(input: PrefillInput): Partial<LeadProfile> {
  const out: Partial<LeadProfile> = {}

  // Style preferences: union of homeowner-tagged + AI guess (single best).
  const stylePool = new Set<string>(input.selectedStyles)
  if (input.inspirationVision?.styleGuess) {
    stylePool.add(input.inspirationVision.styleGuess)
  }
  if (stylePool.size > 0) {
    out.stylePreferences = Array.from(stylePool)
  }

  // Door material: prefer inspiration vision, fall back to space vision hints.
  if (input.inspirationVision?.doorMaterialGuess) {
    out.doorMaterial = input.inspirationVision.doorMaterialGuess
  } else if (input.spaceVision?.materialHints) {
    const hint = input.spaceVision.materialHints.find((h) =>
      /shaker|slab|beaded|glass.front/i.test(h)
    )
    if (hint) out.doorMaterial = guessDoorFromHint(hint)
  }

  if (input.inspirationVision?.worktopGuess) {
    out.worktopPreference = input.inspirationVision.worktopGuess
  }
  if (input.inspirationVision?.backsplashGuess) {
    out.backsplashPreference = input.inspirationVision.backsplashGuess
  }
  if (input.inspirationVision?.hardwareTierGuess) {
    out.hardwareTier = input.inspirationVision.hardwareTierGuess
  }

  // Layout from space vision (high-confidence shapes only).
  if (input.spaceVision?.layoutShape && input.spaceVision.layoutShape !== 'unsure') {
    out.layoutShape = input.spaceVision.layoutShape
  }
  if (typeof input.spaceVision?.hasIsland === 'boolean') {
    out.hasIsland = input.spaceVision.hasIsland
  }
  if (input.spaceVision?.lengthCm) out.spaceLengthCm = input.spaceVision.lengthCm
  if (input.spaceVision?.widthCm) out.spaceWidthCm = input.spaceVision.widthCm

  return out
}

/**
 * Did VISION (not the homeowner's own taps) prefill any "confirm the look"
 * field? Drives the "AI prefilled this" banner — which must never show for a
 * fully manual journey. Defined on top of derivePrefills with no manual
 * styles, so the answer can't drift from the actual prefill logic.
 */
export function visionPrefilledLook(
  inspirationVision: InspirationVisionResult | null,
  spaceVision: SpaceVisionResult | null
): boolean {
  const p = derivePrefills({ selectedStyles: [], inspirationVision, spaceVision })
  return Boolean(
    p.stylePreferences?.length ||
      p.doorMaterial ||
      p.worktopPreference ||
      p.backsplashPreference ||
      p.hardwareTier
  )
}

function guessDoorFromHint(hint: string): string {
  const h = hint.toLowerCase()
  if (h.includes('shaker')) return 'shaker'
  if (h.includes('slab')) return 'slab'
  if (h.includes('beaded')) return 'beaded_inset'
  if (h.includes('glass')) return 'glass_front'
  return 'mixed'
}
