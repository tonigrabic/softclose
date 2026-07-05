/**
 * Scope drives the estimate. The scope step lets the homeowner say what's
 * actually being touched; the range must reflect it — if installation isn't in
 * scope, the install line shouldn't be in the price; if appliances are
 * homeowner-supplied / out of scope, that line drops; cabinets out of scope
 * drops the whole cabinetry package. Absent scope (before the scope step) keeps
 * the full kitchen (this is what every other test relies on — no churn).
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'
import { DEFAULT_LOCALE } from '@/lib/i18n'

function stateFor(id: string) {
  const f = CONTRACT_FIXTURES.find((x) => x.id === id)!
  return hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(f.build()) })
}
const keys = (bom: ReturnType<typeof computeBom>) => bom.lineItems.map((l) => l.key)

describe('scope gates the estimate', () => {
  const state = stateFor('l-shape')

  test('no scope → full kitchen (install + appliances present)', () => {
    const full = computeBom(state)
    expect(keys(full)).toEqual(expect.arrayContaining(['boards', 'install', 'appliances']))
  })

  test('installation out of scope → no install line, lower total', () => {
    const full = computeBom(state)
    const noInstall = computeBom(state, DEFAULT_LOCALE, {
      scope: { cabinets: true, worktops: true, installation: false },
    })
    expect(keys(noInstall)).not.toContain('install')
    expect(keys(full)).toContain('install')
    expect(noInstall.total.high).toBeLessThan(full.total.high)
  })

  test('cabinets out of scope → the whole cabinetry package drops', () => {
    const noCabs = computeBom(state, DEFAULT_LOCALE, { scope: { cabinets: false } })
    for (const k of ['boards', 'edgeBanding', 'hardware', 'finishing', 'cnc', 'assembly', 'design']) {
      expect(keys(noCabs), `${k} should be dropped`).not.toContain(k)
    }
  })

  test('appliances out of scope → no appliances line in goods', () => {
    const noApp = computeBom(state, DEFAULT_LOCALE, { scope: { appliancesSupply: false } })
    expect(keys(noApp)).not.toContain('appliances')
  })

  test('an unmapped scope key (e.g. flooring) does not drop kitchen lines', () => {
    const withFlooring = computeBom(state, DEFAULT_LOCALE, {
      scope: { cabinets: true, worktops: true, flooring: true },
    })
    expect(keys(withFlooring)).toEqual(expect.arrayContaining(['boards', 'worktop']))
  })
})

describe('project-scope allowances', () => {
  const state = stateFor('l-shape')

  test('no allowance lines without scope; the project section is zero', () => {
    const full = computeBom(state)
    for (const k of ['flooring', 'demolition', 'electrical', 'plumbing', 'structural']) {
      expect(keys(full)).not.toContain(k)
    }
    expect(full.sections.project).toEqual({ low: 0, high: 0 })
  })

  test('scoping a trade in adds its allowance line in the project section', () => {
    const withTrades = computeBom(state, DEFAULT_LOCALE, {
      scope: { cabinets: true, electricalWork: true, structural: true },
    })
    expect(keys(withTrades)).toEqual(expect.arrayContaining(['electrical', 'structural']))
    expect(keys(withTrades)).not.toContain('plumbing') // not scoped in
    // allowances live in `project`, never in the kitchen `works` band
    const projectLines = withTrades.lineItems.filter((l) => l.section === 'project')
    expect(projectLines.map((l) => l.key).sort()).toEqual(['electrical', 'structural'])
    expect(withTrades.sections.project.high).toBeGreaterThan(0)
  })

  test('allowances do not change the kitchen works band', () => {
    const base = computeBom(state, DEFAULT_LOCALE, { scope: { cabinets: true } })
    const withStructural = computeBom(state, DEFAULT_LOCALE, {
      scope: { cabinets: true, structural: true },
    })
    expect(withStructural.sections.works).toEqual(base.sections.works)
    // …but they do lift the all-in total.
    expect(withStructural.total.high).toBeGreaterThan(base.total.high)
  })
})
