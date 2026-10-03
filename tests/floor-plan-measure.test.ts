/**
 * The room step (IMP-31): the homeowner confirms the shape and measures every
 * wall the kitchen stands on; the photo read's number is only a hint.
 */
import { describe, expect, test } from 'vitest'
import {
  cardForPlan,
  counterWalls,
  fromShapePreset,
  fromVision,
  hasAnyMeasuredWall,
  isRoomMeasured,
  missingWalls,
  normalizeVisionRead,
  parseCeilingCm,
  parseWallLengthCm,
  renderFloorPlanSvg,
  reseedRoomPlan,
  roomPlanFromVision,
  roomStepReady,
  validate,
  wallEstimateCm,
  withCeiling,
  withMeasuredWall,
  withShape,
  WALL_LETTER,
} from '@/lib/floor-plan'
import { seedConfirmPlan } from '@/lib/derive-layout'
import { TWO_ANGLE_L } from './fixtures/vision-two-angle-l'

const vision = normalizeVisionRead(TWO_ANGLE_L, 2) // L on top + left, 380 × 260
const photos = { hasPhotos: true }
const roomL = () => roomPlanFromVision(vision)!

function measureAll(plan: ReturnType<typeof roomL>, cm: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>) {
  return Object.entries(cm).reduce((p, [w, v]) => withMeasuredWall(p, w as 'top', v!, photos), plan)
}

describe('letters and counter walls', () => {
  test('fixed letters, clockwise from the top', () => {
    expect(WALL_LETTER).toEqual({ top: 'A', right: 'B', bottom: 'C', left: 'D' })
  })
  test('counter walls in letter order', () => {
    expect(counterWalls(roomL())).toEqual(['top', 'left'])
    expect(counterWalls(validate(fromShapePreset('u_shape')))).toEqual(['top', 'right', 'left'])
  })
})

describe('measured', () => {
  test('nothing, part, all', () => {
    expect(isRoomMeasured(null)).toBe(false)
    const plan = roomL()
    expect(isRoomMeasured(plan)).toBe(false)
    expect(missingWalls(plan)).toEqual(['top', 'left'])
    const half = withMeasuredWall(plan, 'top', 360, photos)
    expect(isRoomMeasured(half)).toBe(false)
    expect(missingWalls(half)).toEqual(['left'])
    expect(hasAnyMeasuredWall(half)).toBe(true)
    expect(isRoomMeasured(withMeasuredWall(half, 'left', 240, photos))).toBe(true)
  })

  test('seeding from the photo read never counts as measured', () => {
    const plan = roomL()
    expect(hasAnyMeasuredWall(plan)).toBe(false)
    expect(plan.room.confidence).toBe('M')
  })

  test('the ceiling is not required', () => {
    const plan = measureAll(roomL(), { top: 360, left: 240 })
    expect(plan.ceilingSource).not.toBe('homeowner')
    expect(isRoomMeasured(plan)).toBe(true)
  })

  test('a typed length sets its wall; the other axis is untouched', () => {
    const plan = withMeasuredWall(roomL(), 'top', 320, photos)
    expect(plan.room.lengthCm).toBe(320)
    expect(plan.room.widthCm).toBe(260)
    expect(plan.room.sides.top.measuredLengthCm).toBe(320)
  })

  test('H / homeowner only once every counter wall is typed', () => {
    const half = withMeasuredWall(roomL(), 'top', 320, photos)
    expect(half.room.confidence).toBe('M')
    const all = withMeasuredWall(half, 'left', 250, photos)
    expect(all.room.confidence).toBe('H')
    expect(all.room.source).toBe('homeowner')
    expect(all.measurementMethod).toBe('photo_plus_homeowner')
    const noPhotos = ['top', 'left'].reduce(
      (p, w) => withMeasuredWall(p, w as 'top', 300, { hasPhotos: false }),
      validate(fromShapePreset('l_shape'))
    )
    expect(noPhotos.measurementMethod).toBe('homeowner_only')
  })

  test("galley: the longer wall sets the room, the shorter keeps its own run", () => {
    const galley = validate(fromShapePreset('galley'))
    const plan = measureAll(galley, { top: 300, bottom: 280 })
    expect(plan.room.lengthCm).toBe(300)
    expect(plan.room.sides.bottom.counterLengthCm).toBe(280)
    expect(plan.room.sides.top.counterLengthCm).toBeUndefined()
    expect(isRoomMeasured(plan)).toBe(true)
  })

  test('elements the photo read placed move with the wall; homeowner ones stay', () => {
    const plan = roomL()
    const sink = plan.features.find((f) => f.kind === 'sink')!
    const resized = withMeasuredWall(plan, 'top', 190, photos)
    expect(resized.features.find((f) => f.kind === 'sink')!.centerCm).toBeCloseTo((sink.centerCm * 190) / 380, 5)

    const pinned = { ...plan, features: plan.features.map((f) => (f.kind === 'sink' ? { ...f, source: 'homeowner' as const } : f)) }
    expect(withMeasuredWall(pinned, 'top', 300, photos).features.find((f) => f.kind === 'sink')!.centerCm).toBe(sink.centerCm)
  })

  test('clearing a value un-measures the wall', () => {
    const plan = measureAll(roomL(), { top: 360, left: 240 })
    const cleared = withMeasuredWall(plan, 'left', null, photos)
    expect(cleared.room.sides.left.measuredLengthCm).toBeUndefined()
    expect(isRoomMeasured(cleared)).toBe(false)
  })
})

describe('parsing what the homeowner types', () => {
  test.each([
    ['380', 380],
    ['380 cm', 380],
    ['3.8 m', 380],
    ['3,8', 380],
    ['3,80 m', 380],
    ['  412 ', 412],
  ])('%s → %d cm', (raw, cm) => expect(parseWallLengthCm(raw)).toBe(cm))

  test.each(['90', '1300', '', 'abc', '-3'])('%s is not a wall length', (raw) => {
    expect(parseWallLengthCm(raw)).toBeNull()
  })

  test('ceiling', () => {
    expect(parseCeilingCm('260')).toBe(260)
    expect(parseCeilingCm('2,6')).toBe(260)
    expect(parseCeilingCm('120')).toBeNull()
  })
})

describe('the photo hint', () => {
  test('anchored dims only, longer on top/bottom', () => {
    expect(wallEstimateCm(vision, 'top')).toBe(380)
    expect(wallEstimateCm(vision, 'left')).toBe(260)
    expect(wallEstimateCm({ ...vision, lengthCm: 300, widthCm: undefined }, 'left')).toBeNull()
    expect(wallEstimateCm(null, 'top')).toBeNull()
  })
})

describe('ceiling', () => {
  test('typed is homeowner; cleared falls back to the photo read', () => {
    const typed = withCeiling(roomL(), 255)
    expect(typed).toMatchObject({ ceilingHeightCm: 255, ceilingSource: 'homeowner' })
    expect(withCeiling(typed, null, 270)).toMatchObject({ ceilingHeightCm: 270, ceilingSource: 'ai_vision' })
    expect(withCeiling(typed, null).ceilingSource).toBeUndefined()
  })
})

describe('shape cards', () => {
  test('the plan reads as its card', () => {
    expect(cardForPlan(roomL())).toBe('l_shape')
    expect(cardForPlan(validate(fromShapePreset('galley')))).toBe('galley')
    expect(cardForPlan(validate(fromShapePreset('u_shape')))).toBe('u_shape')
    expect(cardForPlan(validate(fromShapePreset('single_wall')))).toBe('single_wall')
    expect(cardForPlan(validate(fromShapePreset('island')))).toBe('island')
    expect(cardForPlan(null)).toBeNull()
  })

  test('a picked card keeps the walls it can and every typed length', () => {
    const measured = measureAll(roomL(), { top: 360, left: 240 })
    const u = withShape(measured, 'u_shape')
    // The U that keeps both walls of the L, in its conventional orientation.
    expect(counterWalls(u)).toEqual(['top', 'right', 'left'])
    expect(u.room.sides.top.measuredLengthCm).toBe(360)
    const single = withShape(measured, 'single_wall')
    expect(counterWalls(single)).toHaveLength(1)
    expect(single.layoutShape).toBe('single_wall')
  })

  test('island card adds an island and keeps the walls; other cards remove it', () => {
    const island = withShape(roomL(), 'island')
    expect(island.hasIsland).toBe(true)
    expect(counterWalls(island)).toEqual(['top', 'left'])
    expect(cardForPlan(island)).toBe('island')
    expect(withShape(island, 'l_shape').hasIsland).toBe(false)
  })

  test('without a plan a card is its preset', () => {
    expect(cardForPlan(withShape(null, 'galley'))).toBe('galley')
  })
})

describe('a new photo read keeps what was typed', () => {
  test('lengths and ceiling come back', () => {
    const prev = withCeiling(measureAll(roomL(), { top: 360, left: 240 }), 250)
    const next = reseedRoomPlan(prev, vision, photos)!
    expect(next.room.sides.top.measuredLengthCm).toBe(360)
    expect(next.room.sides.left.measuredLengthCm).toBe(240)
    expect(next.ceilingSource).toBe('homeowner')
    expect(isRoomMeasured(next)).toBe(true)
  })
  test('photos removed: a measured plan stays, an unmeasured one goes', () => {
    expect(reseedRoomPlan(roomL(), null, photos)).toBeNull()
    expect(reseedRoomPlan(measureAll(roomL(), { top: 360 }), null, photos)).not.toBeNull()
  })
  test('an empty room or a non-kitchen read yields no plan', () => {
    expect(roomPlanFromVision({ ...vision, emptyRoom: true })).toBeNull()
    expect(roomPlanFromVision({ ...vision, lookedLikeKitchen: false })).toBeNull()
  })
})

describe('footer Continue on the room step', () => {
  test('shape screen needs a card and, for a kitchen, what to do with it', () => {
    expect(roomStepReady({ phase: 'shape', plan: null })).toBe(false)
    expect(roomStepReady({ phase: 'shape', plan: roomL() })).toBe(false)
    expect(roomStepReady({ phase: 'shape', plan: roomL(), layoutIntent: 'keep' })).toBe(true)
    expect(roomStepReady({ phase: 'shape', plan: roomL(), existingRoom: 'empty' })).toBe(true)
  })
  test('a shape with no wall carrying counter cannot move on — there would be nothing to measure', () => {
    const none = { ...roomL(), room: { ...roomL().room, sides: Object.fromEntries(Object.entries(roomL().room.sides).map(([w, sd]) => [w, { ...sd, hasCounter: false }])) as ReturnType<typeof roomL>['room']['sides'] } }
    expect(roomStepReady({ phase: 'shape', plan: none, layoutIntent: 'keep' })).toBe(false)
  })

  test('measure screen needs every wall typed — there is no "use the estimate"', () => {
    expect(roomStepReady({ phase: 'measure', plan: roomL(), layoutIntent: 'keep' })).toBe(false)
    expect(roomStepReady({ phase: 'measure', plan: measureAll(roomL(), { top: 360, left: 240 }) })).toBe(true)
  })
})

describe('the confirm step does not rebuild a measured room', () => {
  test('a measured plan is the seed; an unmeasured journey keeps the old render-derived seed', () => {
    const measured = measureAll(roomL(), { top: 360, left: 240 })
    expect(seedConfirmPlan(null, measured, vision, null)).toBe(measured)
    const legacy = seedConfirmPlan(null, null, vision, null)
    expect(counterWalls(legacy)).toEqual(counterWalls(fromVision(vision)))
    expect(seedConfirmPlan(measured, null, vision, null)).toBe(measured)
  })
})

describe('lettered plan picture', () => {
  test('letters render where asked, measured ones filled; default output unchanged', () => {
    const plan = roomL()
    const plain = renderFloorPlanSvg(plan)
    expect(plain).not.toContain('data-wall-letter')
    const lettered = renderFloorPlanSvg(plan, { wallLetters: { top: 'A', left: 'D' }, wallLettersDone: ['top'] })
    expect(lettered).toContain('data-wall-letter="top"')
    expect(lettered).toContain('data-wall-letter="left"')
    expect(lettered).not.toContain('data-wall-letter="right"')
    expect(lettered).toMatch(/data-wall-letter="top"><circle[^>]*fill="#1f2937"/)
    expect(lettered).toMatch(/data-wall-letter="left"><circle[^>]*fill="white"/)
  })
})

// ─── IMP-31 review round ──────────────────────────────────────────────────

describe('review: honest provenance and stable runs', () => {
  test('a galley or a single wall measures its runs, not the room depth: no H stamp', () => {
    const galley = measureAll(validate(fromShapePreset('galley')), { top: 380, bottom: 380 })
    expect(isRoomMeasured(galley)).toBe(true)
    expect(galley.room.confidence).not.toBe('H')
    expect(galley.room.source).not.toBe('homeowner')
    expect(galley.measurementMethod).toBe('photo_plus_homeowner')
    const single = withMeasuredWall(validate(fromShapePreset('single_wall')), 'top', 420, { hasPhotos: false })
    expect(single.room.confidence).toBe('L')
    expect(single.measurementMethod).toBe('homeowner_only')
  })

  test('a run length left from a facing pair never caps a wall that is now alone on its axis', () => {
    let plan = measureAll(validate(fromShapePreset('galley')), { top: 280, bottom: 300 })
    expect(plan.room.sides.top.counterLengthCm).toBe(280)
    plan = withShape(plan, 'l_shape')
    plan = withMeasuredWall(plan, 'left', 250, photos)
    plan = withMeasuredWall(plan, 'top', 320, photos)
    expect(counterWalls(plan)).toEqual(['top', 'left'])
    expect(plan.room.sides.top.counterLengthCm).toBeUndefined()
    expect(plan.room.lengthCm).toBe(320)
  })

  test('clearing a wall drops the run length its pair gave it', () => {
    const plan = measureAll(validate(fromShapePreset('galley')), { top: 300, bottom: 280 })
    expect(withMeasuredWall(plan, 'bottom', null, photos).room.sides.bottom.counterLengthCm).toBeUndefined()
  })

  test('a single-wall relabel never drops a run that followed the old default', () => {
    const l = validate(fromShapePreset('l_shape'))
    // The editor's "reset" puts a side back on the layout default…
    const reset = { ...l, room: { ...l.room, sides: { ...l.room.sides, left: { ...l.room.sides.left, hasCounter: undefined } } } }
    // …then the other run is switched off: one wall left, relabelled single wall.
    const off = validate({ ...reset, room: { ...reset.room, sides: { ...reset.room.sides, top: { ...reset.room.sides.top, hasCounter: false } } } })
    expect(off.layoutShape).toBe('single_wall')
    expect(counterWalls(off)).toEqual(['left'])
  })
})

describe('review round 2: typed lengths are reversible', () => {
  const windowOf = (p: ReturnType<typeof roomL>) => p.openings.find((o) => o.kind === 'window')!
  const fridge = (p: ReturnType<typeof roomL>) => p.features.find((f) => f.kind === 'fridge')!
  const hob = (p: ReturnType<typeof roomL>) => p.features.find((f) => f.kind === 'hob')!

  test('a typo and its correction land every element where a direct entry would', () => {
    const base = roomL()
    // Wall A: the window and the hob (near the far corner) — a 150 typo used to clamp them.
    const direct = withMeasuredWall(base, 'top', 340, photos)
    const viaTypo = withMeasuredWall(withMeasuredWall(base, 'top', 150, photos), 'top', 340, photos)
    expect(windowOf(viaTypo).startCm).toBeCloseTo(windowOf(direct).startCm, 6)
    expect(hob(viaTypo).centerCm).toBeCloseTo(hob(direct).centerCm, 6)
    // Wall D: the fridge.
    const d = withMeasuredWall(base, 'left', 290, photos)
    const dTypo = withMeasuredWall(withMeasuredWall(base, 'left', 125, photos), 'left', 290, photos)
    expect(fridge(dTypo).centerCm).toBeCloseTo(fridge(d).centerCm, 6)
  })

  test('editing one wall of a facing pair (cleared on the way) ends where a direct entry would', () => {
    const galley = measureAll(roomPlanFromVision({ ...vision, layoutShape: 'galley', wallRuns: [
      { wall: 'top', spanPct: { start: 0, end: 100 } }, { wall: 'bottom', spanPct: { start: 0, end: 100 } },
    ], photoViews: [] })!, { top: 380, bottom: 300 })
    const direct = withMeasuredWall(galley, 'top', 390, photos)
    const viaClear = withMeasuredWall(withMeasuredWall(galley, 'top', null, photos), 'top', 390, photos)
    for (const f of direct.features) {
      expect(viaClear.features.find((g) => g.kind === f.kind)!.centerCm).toBeCloseTo(f.centerCm, 6)
    }
  })

  test('taking a measurement back restores the estimate the stamp replaced', () => {
    const full = measureAll(roomL(), { top: 420, left: 300 })
    expect(full.room).toMatchObject({ confidence: 'H', source: 'homeowner' })
    const back = withMeasuredWall(full, 'left', null, photos)
    expect(back.room).toMatchObject({ confidence: 'M', source: 'ai_vision' })
    expect(withShape(back, 'single_wall').room.source).not.toBe('homeowner')
  })

  test('changing the card re-derives runs from the typed lengths (galley → L → galley)', () => {
    let plan = measureAll(validate(fromShapePreset('galley')), { top: 280, bottom: 300 })
    plan = withShape(plan, 'l_shape')
    plan = withShape(plan, 'galley')
    expect(plan.room.sides.top.counterLengthCm).toBe(280)
    expect(plan.room.lengthCm).toBe(300)
  })

  test('an island the homeowner put on the plan survives a new photo read', () => {
    const withIsland = withShape(measureAll(roomL(), { top: 360, left: 240 }), 'island')
    expect(reseedRoomPlan(withIsland, vision, photos)!.hasIsland).toBe(true)
  })
})
