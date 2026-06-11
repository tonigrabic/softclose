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
    // KNOWN RED (LOOP.md B1): W3b's widenByMeta double-counts uncertainty and
    // the null hypothesis hydrates every material field at L, so the displayed
    // band currently exceeds the cap. `test.fails` keeps the suite green while
    // documenting the regression; when B1 lands, vitest will flag these as
    // unexpectedly passing — flip them to plain `test` in the same commit.
    test.fails(`${f.id}: displayed band ≤ ±${BAND_CAP_PCT}%`, () => {
      const bom = estimateForFixture(f.id)
      const displayed = Math.round(bom.bandWidthPct / 2)
      expect(displayed, `±${displayed}% (low €${bom.total.low}, high €${bom.total.high})`).toBeLessThanOrEqual(
        BAND_CAP_PCT
      )
    })
  }
})

describe('estimate drift — totals per fixture', () => {
  // Any change to these numbers must be explained in WORKLOG.md. An estimate
  // that moves without a logged reason is a regression even if tsc is green.
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: total range snapshot`, () => {
      const bom = estimateForFixture(f.id)
      expect({
        low: bom.total.low,
        high: bom.total.high,
        displayedBandPct: Math.round(bom.bandWidthPct / 2),
        lines: bom.lineItems.map((l) => l.key),
      }).toMatchSnapshot()
    })
  }
})
