/**
 * IMP-32 Done-when 2: with "keep this layout", the tally after the render
 * equals the tally before it.
 *
 * "Before" is the tally of the working plan the room step commits. "After" is
 * every tally a homeowner sees or is priced on once the render and its read
 * have landed: the confirm step (seeded from the plan), the builder's "what
 * we counted" screen, the builder seed and every resume's relock — all fed
 * the decor-only read, as index.tsx hands it out once the room step is done.
 * Compared deep — ids, types, patterns, widths — across every hypothesis
 * fixture and a read that contradicts the room on every layout fact.
 */
import { describe, expect, test } from 'vitest'
import { MOCK_SPACE_VISION } from '@/lib/api/mock-fixtures/space-vision'
import { decorHypothesis, type BuilderHypothesis } from '@/lib/builder/hypothesis'
import { HYPOTHESIS_FIXTURES, hypothesisFixtureById } from '@/lib/builder/hypothesis-fixtures'
import { hydrateFromHypothesis, relockBuilderState } from '@/lib/builder/state'
import { assembleUnits, hintsFromHypothesis } from '@/lib/builder/unit-assembly'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { seedConfirmPlan } from '@/lib/derive-layout'
import {
  counterWalls,
  isRoomMeasured,
  roomPlanFromVision,
  validate,
  withMeasuredWall,
  workingPlanFromRoom,
  type FloorPlan,
} from '@/lib/floor-plan'

/** The mock L, measured A = 420, D = 300 — what commitRoom stores as the room. */
function measuredRoom(): FloorPlan {
  let p = roomPlanFromVision(MOCK_SPACE_VISION)!
  p = withMeasuredWall(p, 'top', 420, { hasPhotos: true })
  p = withMeasuredWall(p, 'left', 300, { hasPhotos: true })
  return validate(p)
}

/** What the confirm step's tally runs: the plan's contract plus the read as index.tsx hands it out. */
const confirmTally = (plan: FloorPlan, h: BuilderHypothesis | null) =>
  assembleUnits({ contract: floorPlanToLayout(validate(plan)), hints: hintsFromHypothesis(decorHypothesis(h)) }).units

/** A render read that contradicts the room on every layout fact. */
const HOSTILE: BuilderHypothesis = {
  usable: true,
  summary: 'U-shaped kitchen with an island and tall towers on every wall.',
  layout: {
    shape: { value: 'u_shape', confidence: 'H' },
    hasIsland: { value: true, confidence: 'H' },
    ceilingHeightCm: { value: 240, confidence: 'H' },
    runs: (['top', 'left', 'right'] as const).map((id) => ({
      id,
      label: id,
      lengthCm: { value: 500, confidence: 'H' as const },
      hasBase: { value: true, confidence: 'H' as const },
      hasWall: { value: false, confidence: 'H' as const },
      hasTall: { value: true, confidence: 'H' as const },
    })),
  },
  cabinetBoxes: {
    carcassMaterial: { value: 'colored_melamine', confidence: 'H' },
    cornerSolution: { value: 'magic_corner', confidence: 'H' },
    unitCounts: { base: { value: 12, confidence: 'H' }, tall: { value: 3, confidence: 'H' } },
    unitPatterns: [
      { runId: 'top', positionPctAlongRun: 70, pattern: 'drawer_bank', confidence: 'H' },
      { runId: 'top', positionPctAlongRun: 60, pattern: 'open_shelves', confidence: 'H' },
      { runId: 'left', positionPctAlongRun: 20, pattern: 'trash_pullout', confidence: 'H' },
    ],
  },
  features: {
    tallPantry: { present: { value: true, confidence: 'H' }, runId: 'left' },
    windowOnRun: { runId: 'top', widthCm: { value: 120, confidence: 'H' } },
    openShelving: { value: true, confidence: 'H' },
  },
  appliances: {
    fridge: { present: { value: true, confidence: 'H' }, integrated: { value: true, confidence: 'H' } },
    fridgeIntegrated: { value: true, confidence: 'H' },
    oven: { value: 'single', confidence: 'H' },
    extractor: { value: 'chimney', confidence: 'H' },
  },
}

describe('IMP-32: "keep this layout" — the render never moves the tally', () => {
  const room = measuredRoom()
  const working = workingPlanFromRoom(room, 'keep')
  const contract = floorPlanToLayout(validate(working))
  const before = assembleUnits({ contract })

  test('the room is the measured mock L, and keep works on it unchanged', () => {
    expect(isRoomMeasured(room)).toBe(true)
    expect(counterWalls(room)).toEqual(['top', 'left'])
    expect(working).toBe(room)
    expect(before.units.length).toBeGreaterThan(0)
  })

  const hyps: (readonly [string, BuilderHypothesis | null])[] = [
    ...HYPOTHESIS_FIXTURES.map((f) => [f.id, f.build(contract)] as const),
    ['hostile', HOSTILE] as const,
  ]

  for (const [id, h] of hyps) {
    describe(id, () => {
      test('the confirm step seeds the plan and its tally deep-equals the room-commit tally', () => {
        // floorPlan state carried from commitRoom, and the resume path (state
        // null, profile.floorPlan = the working plan).
        for (const seeded of [seedConfirmPlan(working, room, MOCK_SPACE_VISION), seedConfirmPlan(null, working, MOCK_SPACE_VISION)]) {
          expect(seeded).toBe(working)
          expect(confirmTally(seeded, h)).toEqual(before.units)
        }
      })

      test('the decor-only read carries no layout hint for either tally to fold', () => {
        expect(hintsFromHypothesis(decorHypothesis(h))).toBeNull()
      })

      test('the builder seeds exactly the confirmed tally — no tower, no fridge housing', () => {
        const state = hydrateFromHypothesis(decorHypothesis(h), { layoutContract: contract })
        expect(state.cabinetBoxes.units).toEqual(before.units)
        expect(state.layout.runs.map((r) => r.hasTall)).toEqual(contract.runs.map((r) => r.hasTall))
        expect(state.appliances.selections.find((s) => s.type === 'fridge')?.integrated ?? false).toBe(false)
      })

      test('every resume relocks to the same units', () => {
        const decor = decorHypothesis(h)
        const saved = hydrateFromHypothesis(decor, { layoutContract: contract })
        const relocked = relockBuilderState(saved, { layoutContract: contract, hypothesis: decor })
        expect(relocked.cabinetBoxes.units).toEqual(before.units)
        expect(relockBuilderState(relocked, { layoutContract: contract, hypothesis: decor }).cabinetBoxes.units).toEqual(
          before.units
        )
      })
    })
  }

  test('control: without the projection the same reads DO move the tally', () => {
    // Proves the parity above is held by decorHypothesis, not by fixtures that
    // happen to agree with the room.
    expect(assembleUnits({ contract, hints: hintsFromHypothesis(HOSTILE) }).units.length).toBeGreaterThan(
      before.units.length
    )
    const tower = hypothesisFixtureById('tall-tower').build(contract)
    expect(assembleUnits({ contract, hints: hintsFromHypothesis(tower) }).units.length).toBe(before.units.length + 1)
    const decorRaw = hypothesisFixtureById('decor').build(contract)
    const housed = hydrateFromHypothesis(decorRaw, { layoutContract: contract }).cabinetBoxes.units
    expect(housed.some((u) => u.boundTo === 'fridge' && u.type === 'tall')).toBe(true)
  })
})

describe('decorHypothesis keeps the decor', () => {
  test('fronts, worktop, hardware, appliance types and the dishwasher flag survive; the fridge flag does not', () => {
    const contract = floorPlanToLayout(validate(workingPlanFromRoom(measuredRoom(), 'keep')))
    const raw = hypothesisFixtureById('decor').build(contract)!
    const decor = decorHypothesis(raw)!
    expect(decor.layout).toBeUndefined()
    expect(decor.usable).toBe(true)
    expect(decor.summary).toBe(raw.summary)
    expect(decor.doors).toEqual(raw.doors)
    expect(decor.worktop).toEqual(raw.worktop)
    expect(decor.backsplash).toEqual(raw.backsplash)
    expect(decor.hardware).toEqual(raw.hardware)
    expect(decor.lighting).toEqual(raw.lighting)
    expect(decor.appliances?.hob).toEqual(raw.appliances?.hob)
    expect(decor.appliances?.oven).toEqual(raw.appliances?.oven)
    expect(decor.appliances?.extractor).toEqual(raw.appliances?.extractor)
    expect(decor.appliances?.fridge).toEqual({ present: raw.appliances!.fridge!.present })
    expect(decor.appliances?.dishwasher).toEqual(raw.appliances?.dishwasher)
    // The original is not mutated (it may be the stored read).
    expect(raw.layout).toBeDefined()
    expect(raw.appliances?.fridge?.integrated).toBeDefined()
  })

  test('drops every tally-moving field of the hostile read, keeps its carcass and colours', () => {
    const decor = decorHypothesis({
      ...HOSTILE,
      features: { ...HOSTILE.features, floorColorHint: 'light oak', wallColorHint: 'white', corniceVisible: { value: true, confidence: 'M' } },
    })!
    expect(decor.layout).toBeUndefined()
    expect(decor.cabinetBoxes).toEqual({ carcassMaterial: HOSTILE.cabinetBoxes!.carcassMaterial })
    expect(decor.features).toEqual({
      floorColorHint: 'light oak',
      wallColorHint: 'white',
      corniceVisible: { value: true, confidence: 'M' },
    })
    expect(decor.appliances?.fridgeIntegrated).toBeUndefined()
    expect(decor.appliances?.fridge?.integrated).toBeUndefined()
  })

  test('null in, null out', () => {
    expect(decorHypothesis(null)).toBeNull()
    expect(decorHypothesis(undefined)).toBeNull()
  })
})
