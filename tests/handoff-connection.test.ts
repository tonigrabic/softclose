/**
 * Funnel → builder → maker connection (LOOP.md B2).
 *
 * The journey's two handoff seams, exercised for real:
 *  1. Builder entry: contract from the Part-1 plan + null hypothesis must
 *     hydrate a working state (the calm "start without AI" path).
 *  2. Maker handoff: buildHandoffBundle must prefer the homeowner's real build
 *     (BOM totals, band ≤ ±20%) over the budget-band stub, and fall back to
 *     the stub — flagged as placeholder — only when the builder was skipped.
 *     Targets the pure builder rather than the route: the route now reads a
 *     session, which vitest cannot provide, and the estimate logic — the part
 *     worth guarding — lives in the pure function either way.
 *
 * What this deliberately does NOT cover: the live browser walk (vision
 * quality, hypothesis content with real API keys). That stays a manual check
 * — see WORKLOG for the click-path.
 */
import { describe, expect, test } from 'vitest'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'

function builderStateFromFixture(id: string) {
  const fixture = CONTRACT_FIXTURES.find((f) => f.id === id)
  if (!fixture) throw new Error(`unknown fixture ${id}`)
  const contract = floorPlanToLayout(fixture.build())
  const s = hydrateFromHypothesis(null, { layoutContract: contract })
  // Maker supplies the goods, so the all-in "with appliances" figure exists.
  return {
    ...s,
    appliances: { ...s.appliances, supply: 'maker_supplies' as const },
    sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' as const },
  }
}


describe('maker handoff — estimate comes from the real build', () => {
  test('brief WITH builderState: estimate is the BOM, not the stub', () => {
    const builderState = builderStateFromFixture('l-shape')
    const bom = computeBom(builderState)

    const bundle = buildHandoffBundle({ brief: { builderState } })

    expect(bundle.estimate!.placeholder).toBe(false)
    // Headline is kitchen-only (works); the all-in figure rides in withAppliances.
    expect(bundle.estimate!.low).toBe(bom.sections.works.low)
    expect(bundle.estimate!.high).toBe(bom.sections.works.high)
    expect(bundle.estimate!.withAppliances).toEqual({ low: bom.total.low, high: bom.total.high })
    // The promise survives the handoff seam too.
    expect(bundle.estimate!.bandPct).toBeLessThanOrEqual(20)
  })

  // `budgetRange`, not `budgetBand` — the latter is not a LeadProfile field, so
  // this case used to fall through to the scope-count fallback while claiming to
  // test the budget band. Untyped JSON through the route hid it; the pure
  // function's types did not. The midpoints below pin the path for good.
  test('brief WITHOUT builderState: stub fallback, flagged as placeholder', () => {
    const bundle = buildHandoffBundle({ brief: { budgetRange: '15k_30k' } })

    expect(bundle.estimate!.placeholder).toBe(true)
    expect(bundle.estimate!.bandPct).toBe(20)
    expect(bundle.estimate!.low).toBeLessThan(bundle.estimate!.high)
    // 22,500 midpoint ±20%.
    expect(bundle.estimate!.low).toBe(18000)
    expect(bundle.estimate!.high).toBe(27000)
  })
})
