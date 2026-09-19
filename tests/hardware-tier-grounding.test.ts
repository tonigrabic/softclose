/** Unpicked hardware tiers come from the real Elgrad distribution and stay ordered. */
import { describe, expect, test } from 'vitest'
import { elgradPriceBands, elgradTierBand } from '@/lib/catalog/hardware'
import { handleStyleBase, hardwareTierRrp } from '@/lib/builder/bom'

describe('hardware tier grounding', () => {
  test('runner-set and hinge bands exist with enough real products', () => {
    expect(elgradPriceBands['hardware/runner_set'].n).toBeGreaterThanOrEqual(50)
    expect(elgradPriceBands['hardware/hinge_unit'].n).toBeGreaterThanOrEqual(30)
  })
  test('tiers are ordered and sit inside the real min/max', () => {
    const b = elgradPriceBands['hardware/runner_set']
    const budget = elgradTierBand('hardware/runner_set', 'budget')!
    const mid = elgradTierBand('hardware/runner_set', 'mid')!
    const premium = elgradTierBand('hardware/runner_set', 'premium')!
    expect(budget.high).toBeLessThanOrEqual(mid.low)
    expect(mid.high).toBeLessThanOrEqual(premium.low)
    expect(budget.low).toBeGreaterThanOrEqual(b.min)
    expect(premium.high).toBeLessThanOrEqual(b.max)
  })
  test('the estimate uses the Elgrad-sourced tiers', () => {
    for (const tier of ['budget', 'mid', 'premium'] as const) {
      const r = hardwareTierRrp(tier)
      expect(r.source).toBe('elgrad')
      expect(r.perDrawer.low).toBeLessThan(r.perDrawer.high)
      expect(r.perBaseUnit.low).toBeLessThan(r.perBaseUnit.high)
    }
    expect(hardwareTierRrp('budget').perDrawer.high).toBeLessThanOrEqual(hardwareTierRrp('premium').perDrawer.low)
  })
  test('a knob is cheaper than a bar, a cup sits between', () => {
    const h = handleStyleBase()
    expect(h.knob).toBeLessThan(h.cup)
    expect(h.cup).toBeLessThan(h.bar)
  })
})
