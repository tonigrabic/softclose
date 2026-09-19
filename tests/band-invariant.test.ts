/**
 * The gate (LOOP.md B0): the estimate band on the REAL builder entry path.
 *
 * Reproduces exactly what the /builder route does — every contract fixture,
 * hydrated with `hypothesis = null` (the funnel→builder hypothesis is not
 * wired yet, so this is the state every session reaches today) — and asserts
 * the product invariant from AGENTS.md: a confidence-bounded ±20% range.
 *
 * Displayed band = Math.round(bandWidthPct / 2), the same formula as
 * LiveBOMPanel / MobileRangeDock / the handoff route.
 *
 * Why a fixture sweep and not one fixture: the W3b regression (±20%→±30%)
 * shipped because its numeric check ran on a hand-built state with M/H
 * confidence hints — a state the product never reaches. The gate only ever
 * measures states the app actually produces.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'

// History: 20 → 15 (2026-06-21) when goods bands were first grounded and the
// fixtures settled at 11–13%. Back to 20 (2026-09-19): once hardware moved to
// REAL Elgrad prices (bar handles ≈5 € not 8, budget runners 12–31 € not
// 21–26), the narrow, over-priced hardware line stopped padding the total and
// the wide material lines (boards ±24%, corner accessories ±40%) weigh more —
// l-shape and u-shape land at ±17%. 20 is the product promise (foundations
// #6, AGENTS.md rule 6); the works range is additionally hard-capped at ±20 in
// bom.ts. Tightening again means narrowing boards/accessories honestly, not
// inflating hardware.
const BAND_CAP_PCT = 20

function estimateForFixture(id: string) {
  const fixture = CONTRACT_FIXTURES.find((f) => f.id === id)
  if (!fixture) throw new Error(`unknown fixture ${id}`)
  const contract = floorPlanToLayout(fixture.build())
  const state = hydrateFromHypothesis(null, { layoutContract: contract })
  return computeBom(state)
}

describe('band invariant — every fixture, hypothesis = null', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: displayed band ≤ ±${BAND_CAP_PCT}%`, () => {
      const bom = estimateForFixture(f.id)
      const displayed = Math.round(bom.bandWidthPct / 2)
      expect(displayed, `±${displayed}% (low €${bom.total.low}, high €${bom.total.high})`).toBeLessThanOrEqual(
        BAND_CAP_PCT
      )
    })
  }
})

// Foundations principle 6: the narrowing range is the reward for answering
// questions. Capping at ±20% must not flatten the loop into a constant.
function confirmEverything(state: ReturnType<typeof hydrateFromHypothesis>) {
  const s = structuredClone(state)
  for (const group of Object.values(s)) {
    if (group && typeof group === 'object' && 'meta' in group) {
      const meta = (group as { meta: Record<string, { confidence: 'H'; provenance: string }> }).meta
      for (const k of Object.keys(meta)) {
        meta[k] = { confidence: 'H', provenance: 'homeowner-confirmed' }
      }
    }
  }
  return s
}

describe('reward loop — confirming tightens the band', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: fully confirmed is strictly tighter than untouched`, () => {
      const contract = floorPlanToLayout(f.build())
      const untouched = computeBom(hydrateFromHypothesis(null, { layoutContract: contract }))
      const confirmed = computeBom(confirmEverything(hydrateFromHypothesis(null, { layoutContract: contract })))
      expect(confirmed.bandWidthPct).toBeLessThan(untouched.bandWidthPct)
    })
  }
})

describe('estimate drift — totals per fixture', () => {
  // Any change to these numbers must be explained in WORKLOG.md. An estimate
  // that moves without a logged reason is a regression even if tsc is green.
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: total range snapshot`, () => {
      const bom = estimateForFixture(f.id)
      const contract = floorPlanToLayout(CONTRACT_FIXTURES.find((x) => x.id === f.id)!.build())
      const confirmed = computeBom(confirmEverything(hydrateFromHypothesis(null, { layoutContract: contract })))
      expect({
        low: bom.total.low,
        high: bom.total.high,
        displayedBandPct: Math.round(bom.bandWidthPct / 2),
        confirmedBandPct: Math.round(confirmed.bandWidthPct / 2),
        lines: bom.lineItems.map((l) => l.key),
      }).toMatchSnapshot()
    })
  }
})
