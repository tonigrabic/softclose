/**
 * Funnel → builder → maker connection (LOOP.md B2).
 *
 * The journey's two handoff seams, exercised for real:
 *  1. Builder entry: contract from the Part-1 plan + null hypothesis must
 *     hydrate a working state (the calm "start without AI" path).
 *  2. Maker handoff: /api/handoff must prefer the homeowner's real build
 *     (BOM totals, band ≤ ±20%) over the budget-band stub, and fall back to
 *     the stub — flagged as placeholder — only when the builder was skipped.
 *
 * What this deliberately does NOT cover: the live browser walk (vision
 * quality, hypothesis content with real API keys). That stays a manual check
 * — see WORKLOG for the click-path.
 */
import { describe, expect, test } from 'vitest'
import { POST as handoffPost } from '@/app/api/handoff/route'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'

function builderStateFromFixture(id: string) {
  const fixture = CONTRACT_FIXTURES.find((f) => f.id === id)
  if (!fixture) throw new Error(`unknown fixture ${id}`)
  const contract = floorPlanToLayout(fixture.build())
  return hydrateFromHypothesis(null, { layoutContract: contract })
}

function post(body: unknown): Promise<Response> {
  return handoffPost(
    new Request('http://localhost/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

describe('maker handoff — estimate comes from the real build', () => {
  test('brief WITH builderState: estimate is the BOM, not the stub', async () => {
    const builderState = builderStateFromFixture('l-shape')
    const bom = computeBom(builderState)

    const res = await post({ brief: { builderState } })
    expect(res.status).toBe(200)
    const bundle = await res.json()

    expect(bundle.estimate.placeholder).toBe(false)
    expect(bundle.estimate.low).toBe(bom.total.low)
    expect(bundle.estimate.high).toBe(bom.total.high)
    // The promise survives the handoff seam too.
    expect(bundle.estimate.bandPct).toBeLessThanOrEqual(20)
  })

  test('brief WITHOUT builderState: stub fallback, flagged as placeholder', async () => {
    const res = await post({ brief: { budgetBand: '15k_30k' } })
    expect(res.status).toBe(200)
    const bundle = await res.json()

    expect(bundle.estimate.placeholder).toBe(true)
    expect(bundle.estimate.bandPct).toBe(20)
    expect(bundle.estimate.low).toBeLessThan(bundle.estimate.high)
  })
})
