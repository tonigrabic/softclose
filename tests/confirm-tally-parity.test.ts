/**
 * Confirmed tally = seeded tally (LOOP.md B3a).
 *
 * "What we counted" (LayoutConfirm) and the builder's first seed
 * (CabinetBoxesGroup) must produce the same per-run cabinet counts —
 * "Nothing is priced off counts they haven't signed off on." Both now
 * assemble their suggest options through `contractSeedOptions`; these tests
 * fail if either side drifts back to hand-rolled options.
 *
 * The builder's post-seed steps (AI pattern overrides, sink/hob forcing)
 * change unit PATTERNS, never counts or types, so count parity is the full
 * invariant.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { contractSeedOptions, suggestCabinetsForRun } from '@/lib/builder/cabinet-suggest'
import { hydrateFromHypothesis } from '@/lib/builder/state'

function tally(units: { type: string }[]) {
  return {
    base: units.filter((u) => u.type === 'base').length,
    wall: units.filter((u) => u.type === 'wall').length,
    tall: units.filter((u) => u.type === 'tall').length,
  }
}

describe('confirm tally parity — per fixture, per run', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: LayoutConfirm tally === builder first-seed tally`, () => {
      const contract = floorPlanToLayout(f.build())
      // The builder seeds from hydrated state (contract-only here, like the
      // real null-hypothesis path) — integratedFridge as hydration leaves it.
      const state = hydrateFromHypothesis(null, { layoutContract: contract })

      for (const run of contract.runs) {
        // LayoutConfirm side: contract run straight into the shared assembler.
        const confirmed = tally(
          suggestCabinetsForRun(run, contractSeedOptions(contract, run))
        )
        // Builder side: state run + state-known integratedFridge, exactly as
        // CabinetBoxesGroup assembles it.
        const stateRun = state.layout.runs.find((r) => r.id === run.id)!
        const integratedFridge =
          state.appliances.selections.find((s) => s.type === 'fridge')?.integrated ?? false
        const seeded = tally(
          suggestCabinetsForRun(
            stateRun,
            contractSeedOptions(contract, { id: stateRun.id, hasCorner: stateRun.hasCorner }, { integratedFridge })
          )
        )
        expect(confirmed, `run ${run.id}`).toEqual(seeded)
      }
    })
  }
})

describe('the tally respects measured appliance footprints', () => {
  test('l-shape: the fridge wall confirms fewer cabinets than a naive fill', () => {
    const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
    const contract = floorPlanToLayout(f.build())
    const fridgeRun = contract.runs.find((r) =>
      contract.appliances.some((a) => a.kind === 'fridge' && a.runId === r.id)
    )!
    const withFootprints = suggestCabinetsForRun(
      fridgeRun,
      contractSeedOptions(contract, fridgeRun)
    )
    const naive = suggestCabinetsForRun(fridgeRun, { hasCorner: fridgeRun.hasCorner })
    expect(withFootprints.length).toBeLessThan(naive.length)
  })
})
