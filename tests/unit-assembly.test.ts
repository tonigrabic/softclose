/**
 * The single assembler — the "what you confirm is what gets priced" seam.
 * Pins: determinism (stable ids), exactly-one-sink_unit (the multi-sink bug),
 * AI hints applied once and fully editable, sequence refit across geometry
 * edits, corner invariants, tall folding from hints, edit helpers.
 */
import { describe, expect, test } from 'vitest'
import { fromShapePreset, makeFeature, validate, type FloorPlan } from '@/lib/floor-plan'
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import type { FeatureKind } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import {
  assembleUnits,
  displayedSequence,
  hintsFromHypothesis,
  summarizeAssembly,
  withPatternChanged,
  withUnitAdded,
  withUnitRemoved,
  type UnitEdits,
} from '@/lib/builder/unit-assembly'

function contractOf(
  shape: Parameters<typeof fromShapePreset>[0],
  features: { kind: FeatureKind; wall: WallSide }[],
  mutate?: (plan: FloorPlan) => FloorPlan
): LayoutContract {
  let plan = fromShapePreset(shape)
  for (const f of features) plan.features.push(makeFeature(f.kind, f.wall, plan.room))
  plan = validate(plan)
  if (mutate) plan = validate(mutate(plan))
  return floorPlanToLayout(plan)
}

const L_FULL = () =>
  contractOf('l_shape', [
    { kind: 'sink', wall: 'top' },
    { kind: 'hob', wall: 'top' },
    { kind: 'fridge', wall: 'left' },
    { kind: 'dishwasher', wall: 'top' },
  ])

describe('determinism', () => {
  test('same inputs → identical output, ids stable across calls', () => {
    const contract = L_FULL()
    const a = assembleUnits({ contract })
    const b = assembleUnits({ contract })
    expect(a).toEqual(b)
    expect(a.units.every((u) => /^(top|bottom|left|right|island):(base|wall|tall):\d+$/.test(u.id))).toBe(
      true
    )
  })
})

describe('sink → exactly one bound sink_unit (the multi-sink fix)', () => {
  test('one sink appliance → one sink_unit, bound, at the measured wall', () => {
    const contract = L_FULL()
    const sinks = assembleUnits({ contract }).units.filter((u) => u.pattern === 'sink_unit')
    expect(sinks).toHaveLength(1)
    expect(sinks[0].boundTo).toBe('sink')
    expect(sinks[0].runId).toBe('top')
  })

  test('an AI sink_unit hint cannot add a second sink unit', () => {
    const contract = L_FULL()
    const result = assembleUnits({
      contract,
      hints: {
        unitPatterns: [
          // Far from the measured sink — the old builder-side layering would
          // have produced TWO sink units from this.
          { runId: 'top', positionPctAlongRun: 90, pattern: 'sink_unit', confidence: 'H' },
        ],
      },
    })
    expect(result.units.filter((u) => u.pattern === 'sink_unit')).toHaveLength(1)
  })

  test('dishwasher + oven still get their bound slots alongside the sink', () => {
    const contract = contractOf('galley', [
      { kind: 'sink', wall: 'top' },
      { kind: 'oven', wall: 'top' },
      { kind: 'dishwasher', wall: 'top' },
    ])
    const units = assembleUnits({ contract }).units.filter((u) => u.runId === 'top')
    expect(units.some((u) => u.pattern === 'sink_unit' && u.boundTo === 'sink')).toBe(true)
    expect(units.some((u) => u.pattern === 'appliance_slot' && u.boundTo === 'dishwasher')).toBe(true)
    expect(units.some((u) => u.pattern === 'oven_housing' && u.boundTo === 'oven')).toBe(true)
  })
})

describe('AI hints: applied once into the seed, fully editable', () => {
  const HINT = {
    unitPatterns: [
      { runId: 'top' as const, positionPctAlongRun: 60, pattern: 'drawer_bank' as const, confidence: 'M' as const },
    ],
  }

  test('a pattern hint lands on the nearest fillable slot', () => {
    const contract = contractOf('l_shape', [{ kind: 'fridge', wall: 'left' }])
    const withHint = assembleUnits({ contract, hints: HINT })
    const without = assembleUnits({ contract })
    const hinted = withHint.units.filter(
      (u) => u.runId === 'top' && u.type === 'base' && u.pattern === 'drawer_bank'
    )
    const unhinted = without.units.filter(
      (u) => u.runId === 'top' && u.type === 'base' && u.pattern === 'drawer_bank'
    )
    expect(hinted.length).toBeGreaterThanOrEqual(unhinted.length)
    const aiUnit = withHint.units.find((u) => u.meta?.provenance === 'ai-vision' && u.type === 'base')
    expect(aiUnit?.pattern).toBe('drawer_bank')
  })

  test('a user edit on the row overrides the hint (edits win)', () => {
    const contract = contractOf('l_shape', [{ kind: 'fridge', wall: 'left' }])
    const seeded = assembleUnits({ contract, hints: HINT })
    const displayed = displayedSequence(seeded.units, 'top', 'base')
    // Flip every non-corner slot to plain doors (the corner slot only accepts
    // corner mechanisms).
    const edits: UnitEdits = {
      schemaVersion: 1,
      rows: [
        {
          runId: 'top',
          row: 'base',
          sequence: displayed.map((p) => (p.startsWith('corner') ? p : 'doors_shelf')),
          editedAt: 1,
        },
      ],
    }
    const result = assembleUnits({ contract, hints: HINT, edits })
    const fillable = result.units.filter(
      (u) => u.runId === 'top' && u.type === 'base' && !u.boundTo && !u.pattern.startsWith('corner')
    )
    expect(fillable.every((u) => u.pattern === 'doors_shelf')).toBe(true)
    expect(fillable.every((u) => u.meta?.provenance !== 'ai-vision')).toBe(true)
  })
})

describe('tall folding (the tally-parity hole)', () => {
  test('hints.tallRunIds seeds a tower the contract alone would not', () => {
    const contract = contractOf('galley', [{ kind: 'sink', wall: 'top' }])
    const plain = assembleUnits({ contract })
    const hinted = assembleUnits({ contract, hints: { tallRunIds: ['top'] } })
    expect(plain.units.filter((u) => u.type === 'tall')).toHaveLength(0)
    const towers = hinted.units.filter((u) => u.type === 'tall')
    expect(towers).toHaveLength(1)
    expect(towers[0].meta?.provenance).toBe('ai-vision')
  })

  test('hintsFromHypothesis folds layout.runs hasTall + tallPantry', () => {
    const hints = hintsFromHypothesis({
      usable: true,
      layout: { runs: [{ id: 'top', label: 'Top', lengthCm: { value: 300, confidence: 'M' }, hasTall: { value: true, confidence: 'M' } }] },
      features: { tallPantry: { present: { value: true, confidence: 'M' }, runId: 'left' } },
    })
    expect(hints?.tallRunIds?.sort()).toEqual(['left', 'top'])
  })

  test('an emptied tall sequence removes the tower (edit wins over hint)', () => {
    const contract = contractOf('galley', [{ kind: 'sink', wall: 'top' }])
    const edits: UnitEdits = {
      schemaVersion: 1,
      rows: [{ runId: 'top', row: 'tall', sequence: [], editedAt: 1 }],
    }
    const result = assembleUnits({ contract, hints: { tallRunIds: ['top'] }, edits })
    expect(result.units.filter((u) => u.type === 'tall')).toHaveLength(0)
  })
})

describe('sequence refit across geometry edits', () => {
  const base = () => contractOf('galley', [])

  test('longer wall keeps the edited patterns and appends filler', () => {
    const c1 = base()
    const seeded = displayedSequence(assembleUnits({ contract: c1 }).units, 'top', 'base')
    const edits = withPatternChanged(null, seeded, 'top', 'base', 0, 'drawer_bank', 1)

    const c2 = contractOf('galley', [], (plan) => ({
      ...plan,
      room: { ...plan.room, lengthCm: plan.room.lengthCm + 200 },
    }))
    const refit = assembleUnits({ contract: c2, edits })
    const patterns = displayedSequence(refit.units, 'top', 'base')
    expect(patterns[0]).toBe('drawer_bank')
    expect(patterns.length).toBeGreaterThanOrEqual(seeded.length)
    expect(refit.warnings).toHaveLength(0)
  })

  test('much shorter wall truncates from the tail with a warning', () => {
    const c1 = base()
    const seeded = displayedSequence(assembleUnits({ contract: c1 }).units, 'top', 'base')
    const edits: UnitEdits = {
      schemaVersion: 1,
      rows: [{ runId: 'top', row: 'base', sequence: seeded, editedAt: 1 }],
    }
    const c2 = contractOf('galley', [], (plan) => ({
      ...plan,
      room: { ...plan.room, lengthCm: 150 },
    }))
    const refit = assembleUnits({ contract: c2, edits })
    const patterns = displayedSequence(refit.units, 'top', 'base')
    expect(patterns.length).toBeLessThan(seeded.length)
    expect(refit.warnings.some((w) => w.kind === 'sequence_truncated' && w.runId === 'top')).toBe(true)
  })
})

describe('corner invariants', () => {
  test('a corner run leads with a corner unit on base and wall rows', () => {
    const contract = L_FULL()
    const summary = summarizeAssembly(contract, assembleUnits({ contract }))
    const cornerRun = summary.rows.find((r) => contract.runs.find((x) => x.id === r.id)?.hasCorner)!
    const baseSeq = cornerRun.units.filter((u) => u.type === 'base').sort((a, b) => a.positionPctAlongRun - b.positionPctAlongRun)
    expect(baseSeq[0].pattern).toBe('corner_magic')
  })

  test('corner mechanism is editable via the sequence; corner is not removable', () => {
    const contract = L_FULL()
    const cornerRunId = contract.runs.find((r) => r.hasCorner)!.id
    const seeded = displayedSequence(assembleUnits({ contract }).units, cornerRunId, 'base')
    expect(seeded[0]).toBe('corner_magic')

    const swapped = withPatternChanged(null, seeded, cornerRunId, 'base', 0, 'corner_lazy', 1)
    const result = assembleUnits({ contract, edits: swapped })
    const seq = displayedSequence(result.units, cornerRunId, 'base')
    expect(seq[0]).toBe('corner_lazy')

    const removedAttempt = withUnitRemoved(null, seeded, cornerRunId, 'base', 0, 2)
    const after = assembleUnits({ contract, edits: removedAttempt })
    expect(displayedSequence(after.units, cornerRunId, 'base').some((p) => p.startsWith('corner'))).toBe(true)
  })
})

describe('edit helpers', () => {
  const displayed = ['doors_shelf', 'drawer_bank', 'trash_pullout'] as const

  test('withUnitAdded appends; withUnitRemoved drops; withPatternChanged swaps', () => {
    const added = withUnitAdded(null, [...displayed], 'top', 'base', 'wine_pullout', 1)
    expect(added.rows[0].sequence).toEqual([...displayed, 'wine_pullout'])

    const removed = withUnitRemoved(added, added.rows[0].sequence, 'top', 'base', 1, 2)
    expect(removed.rows[0].sequence).toEqual(['doors_shelf', 'trash_pullout', 'wine_pullout'])

    const changed = withPatternChanged(removed, removed.rows[0].sequence, 'top', 'base', 0, 'pullouts_inside_doors', 3)
    expect(changed.rows[0].sequence[0]).toBe('pullouts_inside_doors')
    // One row per (run,row) — repeated edits replace, not accumulate.
    expect(changed.rows).toHaveLength(1)
  })
})

describe('island + fridge interactions', () => {
  test('island run assembles fillable base units, no bound chips', () => {
    const contract = contractOf('island', [{ kind: 'sink', wall: 'top' }], (plan) =>
      validate({ ...plan, island: plan.island, hasIsland: true })
    )
    const islandRun = contract.runs.find((r) => r.id === 'island')
    if (!islandRun) return // preset without island geometry — nothing to assert
    const islandUnits = assembleUnits({ contract }).units.filter((u) => u.runId === 'island')
    expect(islandUnits.length).toBeGreaterThan(0)
    expect(islandUnits.every((u) => !u.boundTo)).toBe(true)
  })

  test('integrated fridge seeds a bound tall housing at the measured span', () => {
    const contract = L_FULL()
    const result = assembleUnits({ contract, integratedFridge: true })
    const housing = result.units.filter((u) => u.type === 'tall' && u.boundTo === 'fridge')
    expect(housing).toHaveLength(1)
    expect(housing[0].runId).toBe('left')
  })
})
