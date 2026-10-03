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
import type { BuilderState } from '@/lib/builder/inventory'
import type {
  ClientMessage,
  ConceptRender,
  ConceptVisualRef,
  HandoffBundle,
  HandoffEstimate,
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

  // The range comes from the homeowner's build and from nothing else. Skip the
  // builder and there is no range: a number derived from no inputs, shown as if
  // it were ±20%, is exactly the dishonesty rule 6 rules out. Every surface
  // renders the null case as "no range yet — build your kitchen to get one".
  let estimate: HandoffEstimate | null = null
  if (brief.builderState) {
    // The rate card (labour, workshop margin, band floor). IMP-21 loads the
    // owning maker's row here; until then every brief uses the defaults.
    const rates = DEFAULT_RATE_CARD
    const bom = computeBom(brief.builderState as BuilderState, undefined, { scope: brief.scope, rates })
    // Headline range is kitchen-only (works); appliances + sink/tap (goods)
    // ride alongside as the all-in figure. Band applies to the works range.
    // Every figure is what the homeowner pays: PDV and the margin are inside.
    const hasGoods = bom.sections.goods.high > 0
    estimate = {
      low: bom.sections.works.low,
      high: bom.sections.works.high,
      withAppliances: hasGoods ? { low: bom.total.low, high: bom.total.high } : null,
      basis: `Estimated from your build — ±${Math.round(bom.sections.works.bandWidthPct / 2)}%. An estimate your maker confirms, never a final quote.`,
      bandPct: Math.round(bom.sections.works.bandWidthPct / 2),
      lines: bom.lineItems,
      priceBasis: 'gross-margin-v1',
      // Maker-only: net cost and margin for the brief page. The stored brief
      // keeps them; the customer's response does not (toCustomerBundle).
      maker: bom.makerOnly,
    }
    // Maker-only cost basis: same build priced at the maker's B2B account
    // prices, at cost (no margin: it is what the shop pays). Only attached
    // once the maker has supplied prices; the homeowner figures above stay
    // retail regardless (decision 2026-06-21).
    if (makerPricingEntryCount() > 0) {
      const makerBom = computeBom(brief.builderState as BuilderState, undefined, {
        scope: brief.scope,
        pricing: 'maker',
        rates: withoutMargin(rates),
      })
      estimate.makerCost = { low: makerBom.total.low, high: makerBom.total.high }
    }
  }

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
 * The bundle as the homeowner's client may receive it: without the maker-only
 * money (net cost, workshop margin, B2B cost basis). The database keeps the
 * full bundle, so the maker's brief page still reads them. Every response
 * /api/handoff sends goes through this.
 */
export function toCustomerBundle(bundle: HandoffBundle): HandoffBundle {
  if (!bundle.estimate) return bundle
  const estimate: HandoffEstimate = { ...bundle.estimate }
  delete estimate.maker
  delete estimate.makerCost
  return { ...bundle, estimate }
}
