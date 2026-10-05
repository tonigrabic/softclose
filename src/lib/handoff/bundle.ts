/**
 * Assemble the maker's brief from a homeowner's journey.
 *
 * Lifted verbatim out of /api/handoff so more than one caller can produce the
 * same artifact: the submit route, and (once projects exist) the maker's live
 * view of a brief still being built. Two callers computing an estimate two ways
 * is how the ±20% promise quietly breaks — one function, one `computeBom` path.
 *
 * Pure: no DB, no network, no cookies. That also keeps it directly testable,
 * which the route it came from no longer will be once it reads a session.
 */
import { WALL_LETTER, hasPlan, planFromProfile, renderFloorPlanSvg, validate } from '@/lib/floor-plan'
import { computeBom } from '@/lib/builder/bom'
import { makerPricingEntryCount } from '@/lib/catalog/maker-pricing'
import { DEFAULT_RATE_CARD, withoutMargin } from '@/lib/catalog/rate-card'
import { customerEstimate, estimateFromBuild } from './estimate'
import type { BuilderState } from '@/lib/builder/inventory'
import type {
  ClientMessage,
  ConceptRender,
  ConceptVisualRef,
  HandoffBundle,
  LeadProfile,
  MoodBoardItem,
} from '@/lib/types'

export const PLAN_DISCLAIMER =
  'Schematic generated from the homeowner-confirmed plan and AI-inferred features — not a survey or working drawing. Per-element provenance + confidence on hover.'

export interface HandoffBundleInput {
  brief?: LeadProfile
  moodBoard?: MoodBoardItem[]
  explorationRefs?: { url: string; prompt: string; reaction?: string }[]
  transcript?: ClientMessage[]
}

export function buildHandoffBundle(input: HandoffBundleInput): HandoffBundle {
  const brief = input.brief ?? {}
  const moodBoard = input.moodBoard ?? brief.moodBoardItems ?? []
  const transcript = input.transcript ?? []
  const explorationRefs: ConceptVisualRef[] = (input.explorationRefs ?? []).map((r) => ({
    url: r.url,
    prompt: r.prompt,
    reaction: r.reaction,
    illustrativeOnly: true,
  }))

  let floorPlan: HandoffBundle['floorPlan'] = null
  if (hasPlan(brief)) {
    const plan = planFromProfile(brief)
    if (plan) {
      const validated = validate(plan)
      floorPlan = {
        plan: validated,
        // Maker mode: solid lines, provenance shown by the dashboard, not by dashing.
        // Wall letters, so the trades row's "zid A → zid D" points at a wall.
        svg: renderFloorPlanSvg(validated, { mode: 'maker', wallLetters: WALL_LETTER }),
        disclaimer: PLAN_DISCLAIMER,
      }
    }
  }

  let chosenRender: (ConceptRender & { conceptOnly: true }) | null = null
  if (brief.conceptRenderChosenId && brief.conceptRenders?.length) {
    const found = brief.conceptRenders.find((r) => r.id === brief.conceptRenderChosenId)
    if (found) chosenRender = { ...found, conceptOnly: true as const }
  }

  // The range, priced from the build alone (null without one) — the same
  // function the wrap-up's review prices its preview with (IMP-07).
  const estimate = estimateFromBuild(brief)

  return {
    brief,
    moodBoard,
    floorPlan,
    explorationRefs,
    chosenRender,
    estimate,
    transcript,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * MAKER-ONLY. The build at the maker's B2B account prices, at cost (no
 * workshop margin: it is what the shop pays), kitchen and goods together. The
 * homeowner figures stay retail regardless (decision 2026-06-21).
 *
 * Computed where the maker reads it (src/app/maker/[id]/page.tsx), never at
 * submit: never stored with the brief, never in a homeowner response.
 * undefined while maker-pricing.json is empty, or when there is no build.
 */
export function makerCostFor(brief: LeadProfile): { low: number; high: number } | undefined {
  if (!brief.builderState || makerPricingEntryCount() === 0) return undefined
  // IMP-21 loads the owning maker's rate card here, as at submit.
  const bom = computeBom(brief.builderState as BuilderState, undefined, {
    scope: brief.scope,
    pricing: 'maker',
    rates: withoutMargin(DEFAULT_RATE_CARD),
  })
  return { low: bom.total.low, high: bom.total.high }
}

/**
 * The bundle as the homeowner's client may receive it: without the maker-only
 * money (net cost and workshop margin). The database keeps the full bundle, so
 * the maker's brief page still reads them. Every response /api/handoff sends
 * goes through this. It also drops `makerCost`, which no bundle built here
 * carries any more (makerCostFor): a guard, should one ever be attached.
 */
export function toCustomerBundle(bundle: HandoffBundle): HandoffBundle {
  if (!bundle.estimate) return bundle
  return { ...bundle, estimate: customerEstimate(bundle.estimate) }
}
