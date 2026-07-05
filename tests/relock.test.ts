/**
 * The escape hatch's return path: `relockBuilderState` re-derives everything
 * the contract owns (layout, units, worktop geometry, appliance presence)
 * while every specifics pick survives. Runs on every saved-state mount, so it
 * must be idempotent.
 */
import { describe, expect, test } from 'vitest'
import { fromShapePreset, makeFeature, validate, type FeatureKind } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { floorPlanToLayout, type LayoutContract } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis, relockBuilderState } from '@/lib/builder/state'
import { hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import { assembleUnits, hintsFromHypothesis, withPatternChanged, displayedSequence } from '@/lib/builder/unit-assembly'
import type { BuilderState, CarcassMaterial, WorktopFamily } from '@/lib/builder/inventory'

function contractOf(
  shape: Parameters<typeof fromShapePreset>[0],
  features: { kind: FeatureKind; wall: WallSide }[]
): LayoutContract {
  const plan = fromShapePreset(shape)
  for (const f of features) plan.features.push(makeFeature(f.kind, f.wall, plan.room))
  return floorPlanToLayout(validate(plan))
}

const C1 = () =>
  contractOf('l_shape', [
    { kind: 'sink', wall: 'top' },
    { kind: 'hob', wall: 'top' },
    { kind: 'fridge', wall: 'left' },
    { kind: 'dishwasher', wall: 'top' },
  ])

/** Hydrate + simulate a few homeowner specifics picks. */
function buildWithPicks(contract: LayoutContract): BuilderState {
  const hyp = hypothesisFixtureById('decor').build(contract)
  const state = hydrateFromHypothesis(hyp, { layoutContract: contract })
  return {
    ...state,
    doors: { ...state.doors, decorCode: 'PICKED-DOOR' },
    worktop: { ...state.worktop, family: 'quartz' as WorktopFamily },
    cabinetBoxes: { ...state.cabinetBoxes, carcassMaterial: 'colored_melamine' as CarcassMaterial },
    sinkTaps: { ...state.sinkTaps, tap: { ...state.sinkTaps.tap, finish: 'brass' } },
  }
}

describe('relockBuilderState', () => {
  test('specifics picks survive; layout, units and worktop geometry re-derive', () => {
    const c1 = C1()
    const saved = buildWithPicks(c1)

    // The homeowner went back and reshaped the kitchen into a galley.
    const c2 = contractOf('galley', [
      { kind: 'sink', wall: 'top' },
      { kind: 'hob', wall: 'bottom' },
    ])
    const hyp2 = hypothesisFixtureById('decor').build(c2)
    const relocked = relockBuilderState(saved, { layoutContract: c2, hypothesis: hyp2 })

    // Picks survive.
    expect(relocked.doors.decorCode).toBe('PICKED-DOOR')
    expect(relocked.worktop.family).toBe('quartz')
    expect(relocked.cabinetBoxes.carcassMaterial).toBe('colored_melamine')
    expect(relocked.sinkTaps.tap.finish).toBe('brass')

    // Layout + units follow the NEW contract, through the one assembler.
    expect(relocked.layout.shape).toBe(c2.shape)
    expect(relocked.layout.runs.map((r) => r.id)).toEqual(c2.runs.map((r) => r.id))
    const integratedFridge =
      relocked.appliances.selections.find((s) => s.type === 'fridge')?.integrated ?? false
    expect(relocked.cabinetBoxes.units).toEqual(
      assembleUnits({ contract: c2, hints: hintsFromHypothesis(hyp2), integratedFridge }).units
    )
    // Worktop geometry recomputed from the new runs.
    expect(relocked.worktop.totalLengthM).not.toBe(saved.worktop.totalLengthM)
    expect(relocked.layoutConfirmed).toBe(true)
  })

  test('a plan-deleted appliance drops; AI-only extras survive', () => {
    const c1 = C1()
    const saved = buildWithPicks(c1)
    // The decor hypothesis seeded an oven (AI-only, no measured width) and the
    // plan seeded a dishwasher (measured width).
    expect(saved.appliances.selections.some((s) => s.type === 'oven' && s.widthMm === undefined)).toBe(true)
    expect(saved.appliances.selections.some((s) => s.type === 'dishwasher' && s.widthMm !== undefined)).toBe(true)

    // Same kitchen, dishwasher deleted on the canvas.
    const c2 = contractOf('l_shape', [
      { kind: 'sink', wall: 'top' },
      { kind: 'hob', wall: 'top' },
      { kind: 'fridge', wall: 'left' },
    ])
    const relocked = relockBuilderState(saved, { layoutContract: c2 })
    expect(relocked.appliances.selections.some((s) => s.type === 'dishwasher')).toBe(false)
    expect(relocked.appliances.selections.some((s) => s.type === 'oven')).toBe(true)
    // …and no appliance_slot unit remains for it.
    expect(relocked.cabinetBoxes.units.some((u) => u.boundTo === 'dishwasher')).toBe(false)
  })

  test('a newly drawn appliance appears with its measured width', () => {
    const c1 = contractOf('galley', [{ kind: 'sink', wall: 'top' }])
    const saved = hydrateFromHypothesis(null, { layoutContract: c1 })
    const c2 = contractOf('galley', [
      { kind: 'sink', wall: 'top' },
      { kind: 'dishwasher', wall: 'top' },
    ])
    const relocked = relockBuilderState(saved, { layoutContract: c2 })
    const dw = relocked.appliances.selections.find((s) => s.type === 'dishwasher')
    expect(dw?.widthMm).toBeGreaterThan(0)
    expect(relocked.cabinetBoxes.units.some((u) => u.boundTo === 'dishwasher')).toBe(true)
  })

  test('homeowner unit edits replay through the relock', () => {
    const c1 = C1()
    const saved = buildWithPicks(c1)
    const seeded = displayedSequence(assembleUnits({ contract: c1 }).units, 'top', 'base')
    const idx = seeded.findIndex((p) => !p.startsWith('corner'))
    const edits = withPatternChanged(null, seeded, 'top', 'base', idx, 'wine_pullout', 1)

    const relocked = relockBuilderState(saved, { layoutContract: c1, unitEdits: edits })
    expect(displayedSequence(relocked.cabinetBoxes.units, 'top', 'base')[idx]).toBe('wine_pullout')
  })

  test('idempotent: relocking twice changes nothing material', () => {
    const c1 = C1()
    const saved = buildWithPicks(c1)
    const once = relockBuilderState(saved, { layoutContract: c1 })
    const twice = relockBuilderState(once, { layoutContract: c1 })
    expect(twice.cabinetBoxes.units).toEqual(once.cabinetBoxes.units)
    expect(twice.appliances.selections).toEqual(once.appliances.selections)
    expect(twice.layout).toEqual(once.layout)
    expect(twice.worktop.totalLengthM).toBe(once.worktop.totalLengthM)
  })
})
