/**
 * Every range states what it assumes and leaves out (IMP-04). Nothing used to:
 * removing the old kitchen, electrical and plumbing work, delivery and the
 * final measure were silently outside a figure labelled "all included".
 *
 * The list is built from the same inputs that priced the range (the build and,
 * for journeys saved before the scope step was cut, the legacy scope), stored
 * as keys with the brief, and given a legacy default for briefs without it.
 */
import { describe, expect, test } from 'vitest'
import { computeBom } from '@/lib/builder/bom'
import {
  BOM_ASSUMPTIONS,
  LEGACY_ASSUMPTIONS,
  assumptionKey,
  normalizeAssumptions,
  type BomAssumption,
} from '@/lib/builder/range'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { buildHandoffBundle, toCustomerBundle } from '@/lib/handoff/bundle'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import type { BuilderState } from '@/lib/builder/inventory'
import type { LeadProfile } from '@/lib/types'

function lShape(supply: { appliances?: 'maker_supplies'; sinkTaps?: 'maker_supplies' } = {}): BuilderState {
  const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
  const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
  return {
    ...s,
    appliances: { ...s.appliances, supply: supply.appliances ?? s.appliances.supply },
    sinkTaps: { ...s.sinkTaps, supply: supply.sinkTaps ?? s.sinkTaps.supply },
  }
}

const assumptions = (state: BuilderState, scope?: LeadProfile['scope']) =>
  computeBom(state, 'hr-HR', { scope }).assumptions

describe('assumptions from the build', () => {
  test('the default build: install in, no demolition, no trades, homeowner buys appliances, sink and tap', () => {
    expect(assumptions(lShape())).toEqual([
      'installIncluded',
      'noDemolition',
      'noTrades',
      'appliancesByHomeowner',
      'sinkTapsByHomeowner',
      'siteCheckByMaker',
    ])
  })

  test('every fixture states the same defaults, and always the site check', () => {
    for (const f of CONTRACT_FIXTURES) {
      const s = hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
      const list = computeBom(s).assumptions
      expect(list, f.id).toContain('siteCheckByMaker')
      expect(list, f.id).toContain('installIncluded')
    }
  })

  test('the maker supplies the appliances: priced on their own row, outside the headline', () => {
    const list = assumptions(lShape({ appliances: 'maker_supplies' }))
    expect(list).toContain('appliancesSeparate')
    expect(list).not.toContain('appliancesByHomeowner')
    expect(list).toContain('sinkTapsByHomeowner')
  })

  test('the maker supplies the sink and tap: no sink line in the caveats', () => {
    const list = assumptions(lShape({ appliances: 'maker_supplies', sinkTaps: 'maker_supplies' }))
    expect(list).toEqual(['installIncluded', 'noDemolition', 'noTrades', 'appliancesSeparate', 'siteCheckByMaker'])
  })

  test('a legacy scope without installation says so, and the install line is gone', () => {
    const bom = computeBom(lShape(), 'hr-HR', { scope: { installation: false } })
    expect(bom.lineItems.some((l) => l.key === 'install')).toBe(false)
    expect(bom.assumptions[0]).toBe('installExcluded')
    expect(bom.assumptions).not.toContain('installIncluded')
  })

  test('a legacy scope with demolition or trades drops that exclusion', () => {
    expect(assumptions(lShape(), { demolitionDisposal: true })).not.toContain('noDemolition')
    expect(assumptions(lShape(), { electricalWork: true })).not.toContain('noTrades')
    expect(assumptions(lShape(), { plumbingRelocation: true })).not.toContain('noTrades')
    expect(assumptions(lShape(), { demolitionDisposal: false, electricalWork: false })).toEqual(
      assumptions(lShape())
    )
  })

  test('a legacy scope that took the appliance or sink supply out leaves it with the homeowner', () => {
    const list = assumptions(lShape({ appliances: 'maker_supplies', sinkTaps: 'maker_supplies' }), {
      appliancesSupply: false,
      sinkTaps: false,
    })
    expect(list).toContain('appliancesByHomeowner')
    expect(list).toContain('sinkTapsByHomeowner')
    expect(list).not.toContain('appliancesSeparate')
  })

  test('always in the canonical order', () => {
    const scopes: Array<LeadProfile['scope'] | undefined> = [
      undefined,
      { installation: false },
      { demolitionDisposal: true },
      { electricalWork: true, plumbingRelocation: true },
    ]
    for (const scope of scopes) {
      for (const state of [lShape(), lShape({ appliances: 'maker_supplies', sinkTaps: 'maker_supplies' })]) {
        const list = assumptions(state, scope)
        const order = list.map((a) => BOM_ASSUMPTIONS.indexOf(a))
        expect(order).toEqual([...order].sort((a, b) => a - b))
      }
    }
  })
})

describe('the brief carries them', () => {
  test('the handoff stores the same list, and the customer response keeps it', () => {
    const builderState = lShape()
    const bundle = buildHandoffBundle({ brief: { builderState } as LeadProfile })
    expect(bundle.estimate?.assumptions).toEqual(computeBom(builderState).assumptions)
    expect(toCustomerBundle(bundle).estimate?.assumptions).toEqual(bundle.estimate?.assumptions)
  })

  test('no build, no estimate, no assumptions to state', () => {
    expect(buildHandoffBundle({ brief: {} }).estimate).toBeNull()
  })

  test('a brief from before IMP-04 reads as the legacy list; unknown keys are dropped', () => {
    expect(normalizeAssumptions(undefined)).toEqual([...LEGACY_ASSUMPTIONS])
    expect(normalizeAssumptions(null)).toEqual([...LEGACY_ASSUMPTIONS])
    expect(normalizeAssumptions(['noTrades', 'fromTheFuture', 'installIncluded'])).toEqual([
      'installIncluded',
      'noTrades',
    ])
    expect(LEGACY_ASSUMPTIONS).toEqual(['installIncluded', 'noDemolition', 'noTrades', 'siteCheckByMaker'])
  })
})

describe('the words', () => {
  test('every assumption has hr-HR and en-US text, worded as the spec has it', () => {
    for (const a of BOM_ASSUMPTIONS) {
      expect(hrHR[assumptionKey(a)], a).toBeTruthy()
      expect(enUS[assumptionKey(a)], a).toBeTruthy()
    }
    const hr = (a: BomAssumption) => hrHR[assumptionKey(a)]
    expect(hr('installIncluded')).toBe('montaža uključena')
    expect(hr('noDemolition')).toBe('bez rušenja i odvoza')
    expect(hr('noTrades')).toMatch(/^bez elektro i vodo/)
    expect(hr('appliancesByHomeowner')).toBe('uređaje nabavlja kupac')
  })

  test('no VAT, margin or quote language in any range string', () => {
    const keys = Object.keys(hrHR).filter((k) => k.startsWith('range.')) as (keyof typeof hrHR)[]
    expect(keys.length).toBeGreaterThan(BOM_ASSUMPTIONS.length)
    for (const k of keys) {
      for (const text of [hrHR[k], enUS[k]]) {
        expect(text, k).not.toMatch(/PDV|VAT|marž|margin|nabavn|B2B|ponud|quote/i)
      }
    }
  })
})
