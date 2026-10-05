/**
 * IMP-07: a revisit of the review shows the range the maker has.
 *
 * The kitchen page reads the current brief's stored estimate (one JSON path,
 * bundle->estimate) and hands it to the client for the review. The stored
 * estimate carries the maker-only money (net cost and margin), so the copy
 * the client gets is built from known fields only — and a brief from before
 * the estimate was stored in full still gets its range from the row's columns.
 */
import { describe, expect, test } from 'vitest'
import { savedEstimate, type SavedEstimateColumns } from '@/lib/handoff/saved-estimate'
import { estimateFromBuild } from '@/lib/handoff/estimate'
import { LEGACY_ASSUMPTIONS } from '@/lib/builder/range'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'

const NO_COLUMNS: SavedEstimateColumns = { low: null, high: null, bandPct: null, allInLow: null, allInHigh: null }

const STORED = estimateFromBuild({
  builderState: hydrateFromHypothesis(null, {
    layoutContract: floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()),
  }),
})!

describe('savedEstimate', () => {
  test('the stored estimate, without the maker-only money', () => {
    const raw = { ...STORED, makerCost: { low: 1, high: 2 } }
    expect(raw.maker).toBeDefined()
    const out = savedEstimate(JSON.parse(JSON.stringify(raw)), NO_COLUMNS)!
    expect(out).not.toHaveProperty('maker')
    expect(out).not.toHaveProperty('makerCost')
    expect(out.low).toBe(STORED.low)
    expect(out.high).toBe(STORED.high)
    expect(out.bandPct).toBe(STORED.bandPct)
    expect(out.withAppliances).toEqual(STORED.withAppliances)
    expect(out.lines).toEqual(STORED.lines)
    expect(out.assumptions).toEqual(STORED.assumptions)
    expect(out.priceBasis).toBe('gross-margin-v1')
  })

  test('nothing it does not name gets through', () => {
    const out = savedEstimate({ low: 100, high: 200, secret: 'x', basis: 'b' }, NO_COLUMNS)!
    expect(Object.keys(out).sort()).toEqual(['assumptions', 'basis', 'high', 'lines', 'low', 'withAppliances'])
  })

  test('unknown assumptions are dropped; none stored → the legacy list', () => {
    expect(savedEstimate({ low: 1, high: 2, assumptions: ['installIncluded', 'freeBeer'] }, NO_COLUMNS)!.assumptions).toEqual([
      'installIncluded',
    ])
    expect(savedEstimate({ low: 1, high: 2 }, NO_COLUMNS)!.assumptions).toEqual([...LEGACY_ASSUMPTIONS])
  })

  test('malformed lines are dropped, not drawn', () => {
    const good = STORED.lines![0]
    const out = savedEstimate(
      { low: 1, high: 2, lines: [good, null, 'x', { key: 'fronts', section: 'works', low: 'a', high: 2 }, { key: 'x', section: 'nope', low: 1, high: 2 }] },
      NO_COLUMNS
    )!
    expect(out.lines).toEqual([good])
    expect(savedEstimate({ low: 1, high: 2, lines: 'nope' }, NO_COLUMNS)!.lines).toEqual([])
  })

  test('a brief whose bundle holds no estimate: the row’s columns', () => {
    const out = savedEstimate(null, { low: 5291, high: 7376, bandPct: 14, allInLow: 9000, allInHigh: 11000 })!
    expect(out).toEqual({
      low: 5291,
      high: 7376,
      bandPct: 14,
      withAppliances: { low: 9000, high: 11000 },
      basis: '',
      lines: [],
      assumptions: [...LEGACY_ASSUMPTIONS],
    })
    // No band column: no invented ±.
    expect(savedEstimate(null, { ...NO_COLUMNS, low: 1, high: 2 })).not.toHaveProperty('bandPct')
  })

  test('a stored estimate without its band takes the column’s', () => {
    expect(savedEstimate({ low: 1, high: 2 }, { ...NO_COLUMNS, bandPct: 12 })!.bandPct).toBe(12)
  })

  test('no range at all (sent without a build): null', () => {
    expect(savedEstimate(null, NO_COLUMNS)).toBeNull()
    expect(savedEstimate({ low: 'x', high: 2 }, NO_COLUMNS)).toBeNull()
    expect(savedEstimate([], NO_COLUMNS)).toBeNull()
  })
})
