/**
 * One rounding for every printed range (IMP-04). Before this, the panel printed
 * to the euro, the dashboard in thousands and the email to the euro again: the
 * same estimate read three ways, and to-the-euro claimed a precision a ±10–20 %
 * band does not have.
 *
 *  - 10 € steps below 2,500 €, 50 € to 9,999 €, 100 € from 10,000 €;
 *  - each end rounded on its own, low ≤ high kept, equal ends printed once;
 *  - the printed ends never move the implied ± by more than one point.
 */
import { describe, expect, test } from 'vitest'
import { formatEUR, formatRange, roundRangeEnd } from '@/lib/builder/range'
import { formatEUR as formatEURFromBom, computeBom } from '@/lib/builder/bom'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import type { BuilderState } from '@/lib/builder/inventory'

const NBSP = ' '

const halfPct = (r: { low: number; high: number }) => ((r.high - r.low) / (r.high + r.low)) * 100

function fixtureState(id: string): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === id)!
  return hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
}

function confirmEverything(state: BuilderState): BuilderState {
  const s = structuredClone(state)
  for (const group of Object.values(s)) {
    if (group && typeof group === 'object' && 'meta' in group) {
      const meta = (group as { meta: Record<string, { confidence: 'H'; provenance: string }> }).meta
      for (const k of Object.keys(meta)) meta[k] = { confidence: 'H', provenance: 'homeowner-confirmed' }
    }
  }
  return s
}

describe('roundRangeEnd', () => {
  test('10 € steps below 2,500 €', () => {
    expect(roundRangeEnd(0)).toBe(0)
    expect(roundRangeEnd(44)).toBe(40)
    expect(roundRangeEnd(1234)).toBe(1230)
    expect(roundRangeEnd(1235)).toBe(1240)
    expect(roundRangeEnd(2494)).toBe(2490)
    expect(roundRangeEnd(2499)).toBe(2500)
  })

  test('50 € steps from 2,500 € to 9,999 €', () => {
    expect(roundRangeEnd(2500)).toBe(2500)
    expect(roundRangeEnd(2524)).toBe(2500)
    expect(roundRangeEnd(2525)).toBe(2550)
    expect(roundRangeEnd(5291)).toBe(5300)
    expect(roundRangeEnd(7376)).toBe(7400)
    expect(roundRangeEnd(9974)).toBe(9950)
    expect(roundRangeEnd(9999)).toBe(10000)
  })

  test('100 € steps from 10,000 €', () => {
    expect(roundRangeEnd(10000)).toBe(10000)
    expect(roundRangeEnd(10049)).toBe(10000)
    expect(roundRangeEnd(10050)).toBe(10100)
    expect(roundRangeEnd(12026)).toBe(12000)
  })

  test('monotonic across the step boundaries, so low ≤ high survives rounding', () => {
    for (let n = 0; n < 20000; n++) {
      expect(roundRangeEnd(n + 1)).toBeGreaterThanOrEqual(roundRangeEnd(n))
    }
  })
})

describe('formatRange', () => {
  test('hr-HR: dot thousands, non-breaking space before €, spaced en dash', () => {
    expect(formatRange({ low: 5291, high: 7376 })).toBe(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(formatRange({ low: 5291, high: 7376 }, 'hr-HR')).toBe(`5.300${NBSP}€ – 7.400${NBSP}€`)
    expect(formatRange({ low: 8592, high: 12026 }, 'hr-HR')).toBe(`8.600${NBSP}€ – 12.000${NBSP}€`)
  })

  test('en-US: comma thousands, € in front', () => {
    expect(formatRange({ low: 5291, high: 7376 }, 'en-US')).toBe('€5,300 – €7,400')
    expect(formatRange({ low: 312, high: 418 }, 'en-US')).toBe('€310 – €420')
  })

  test('keeps low ≤ high even when handed the ends the wrong way round', () => {
    expect(formatRange({ low: 7376, high: 5291 }, 'en-US')).toBe('€5,300 – €7,400')
  })

  test('ends that round to the same figure print once', () => {
    expect(formatRange({ low: 4996, high: 5004 }, 'en-US')).toBe('€5,000')
    expect(formatRange({ low: 52, high: 54 }, 'hr-HR')).toBe(`50${NBSP}€`)
  })

  test('an exact sum is not a range: formatEUR keeps it to the euro', () => {
    expect(formatEUR(449, 'hr-HR')).toBe(`449${NBSP}€`)
    // The BOM module re-exports the same function for its existing callers.
    expect(formatEURFromBom).toBe(formatEUR)
  })

  test('the printed ends move the implied ± by at most one point (amounts from 500 €)', () => {
    for (let low = 500; low <= 60000; low = Math.ceil(low * 1.013) + 1) {
      for (const pct of [10, 12, 14, 16, 18, 20]) {
        const high = Math.round((low * (100 + pct)) / (100 - pct))
        const printed = { low: roundRangeEnd(low), high: roundRangeEnd(high) }
        expect(Math.abs(halfPct(printed) - halfPct({ low, high })), `${low}–${high}`).toBeLessThanOrEqual(1)
      }
    }
  })

  test('on every fixture, untouched and confirmed, the printed headline keeps its ± within a point', () => {
    for (const f of CONTRACT_FIXTURES) {
      for (const state of [fixtureState(f.id), confirmEverything(fixtureState(f.id))]) {
        const works = computeBom(state).sections.works
        const printed = { low: roundRangeEnd(works.low), high: roundRangeEnd(works.high) }
        expect(Math.abs(halfPct(printed) - halfPct(works)), f.id).toBeLessThanOrEqual(1)
        expect(Math.abs(Math.round(halfPct(printed)) - Math.round(works.bandWidthPct / 2)), f.id).toBeLessThanOrEqual(1)
      }
    }
  })
})
