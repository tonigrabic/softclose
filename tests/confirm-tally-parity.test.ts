/**
 * Confirmed tally = seeded tally = priced units (LOOP.md B3a).
 *
 * "What we counted" (LayoutConfirm) and the builder's hydrated unit list both
 * come from the ONE assembler (`assembleUnits`); these tests fail if either
 * side drifts back to hand-rolled derivation. Parity is asserted DEEP (ids,
 * types, patterns, widths) and across the hint layers that used to bypass the
 * tally: render-seen tall towers and per-unit pattern hints.
 */
import { describe, expect, test } from 'vitest'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { assembleUnits, hintsFromHypothesis, withPatternChanged, displayedSequence } from '@/lib/builder/unit-assembly'
import { hydrateFromHypothesis } from '@/lib/builder/state'

describe('confirm tally parity — contract-only (null hypothesis)', () => {
  for (const f of CONTRACT_FIXTURES) {
    test(`${f.id}: hydrated units deep-equal the assembler's`, () => {
      const contract = floorPlanToLayout(f.build())
      const state = hydrateFromHypothesis(null, { layoutContract: contract })
      const expected = assembleUnits({ contract }).units
      expect(state.cabinetBoxes.units).toEqual(expected)
    })
  }
})

describe('confirm tally parity — with a hypothesis (the old parity holes)', () => {
  for (const hypId of ['decor', 'tall-tower', 'patterns'] as const) {
    test(`${hypId}: tally and builder seed agree, hints included`, () => {
      const contract = floorPlanToLayout(CONTRACT_FIXTURES[0].build())
      const hypothesis = hypothesisFixtureById(hypId).build(contract)
      const state = hydrateFromHypothesis(hypothesis, { layoutContract: contract })

      const integratedFridge =
        state.appliances.selections.find((s) => s.type === 'fridge')?.integrated ?? false
      const expected = assembleUnits({
        contract,
        hints: hintsFromHypothesis(hypothesis),
        integratedFridge,
      }).units
      expect(state.cabinetBoxes.units).toEqual(expected)
    })
  }

  test('tall-tower: the render tower now shows up in BOTH tally and seed', () => {
    const contract = floorPlanToLayout(CONTRACT_FIXTURES[0].build())
    const hypothesis = hypothesisFixtureById('tall-tower').build(contract)
    const state = hydrateFromHypothesis(hypothesis, { layoutContract: contract })
    const tallies = state.cabinetBoxes.units.filter((u) => u.type === 'tall' && !u.boundTo)
    expect(tallies.length).toBeGreaterThan(0)
    // The tally card's assembler call sees the same tower.
    const tallyUnits = assembleUnits({ contract, hints: hintsFromHypothesis(hypothesis) }).units
    expect(tallyUnits.filter((u) => u.type === 'tall' && !u.boundTo)).toHaveLength(tallies.length)
  })
})

describe('unit edits flow through hydration', () => {
  test('a homeowner pattern edit reaches the builder seed', () => {
    const contract = floorPlanToLayout(CONTRACT_FIXTURES[0].build())
    const seeded = displayedSequence(assembleUnits({ contract }).units, 'top', 'base')
    const nonCornerIdx = seeded.findIndex((p) => !p.startsWith('corner'))
    const edits = withPatternChanged(null, seeded, 'top', 'base', nonCornerIdx, 'pullouts_inside_doors', 1)

    const state = hydrateFromHypothesis(null, { layoutContract: contract, unitEdits: edits })
    const seq = displayedSequence(state.cabinetBoxes.units, 'top', 'base')
    expect(seq[nonCornerIdx]).toBe('pullouts_inside_doors')
  })
})

describe('the tally respects measured appliance footprints', () => {
  test('l-shape: the fridge wall carries fewer fill units than a fridge-less one', () => {
    const f = CONTRACT_FIXTURES.find((x) => x.id === 'l-shape')!
    const contract = floorPlanToLayout(f.build())
    const fridgeRunId = contract.appliances.find((a) => a.kind === 'fridge')!.runId
    const units = assembleUnits({ contract }).units

    const noFridgeContract = {
      ...contract,
      appliances: contract.appliances.filter((a) => a.kind !== 'fridge'),
    }
    const unitsNoFridge = assembleUnits({ contract: noFridgeContract }).units
    expect(units.filter((u) => u.runId === fridgeRunId).length).toBeLessThan(
      unitsNoFridge.filter((u) => u.runId === fridgeRunId).length
    )
  })
})
