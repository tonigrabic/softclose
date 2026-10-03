/**
 * Vision wall reconciliation — the model's shape label bounds how many walls
 * carry counter. Pinned on the real 2026-09-19 read: `l_shape` + four wallRuns
 * became a 36-unit U-shape.
 */
import { describe, expect, test } from 'vitest'
import type { SpaceVisionResult } from '@/lib/types'
import {
  fromVision,
  normalizeVisionRead,
  reconcileCounterWalls,
  relabelPhotoView,
  shapeFromCounterWalls,
  wallsOf,
} from '@/lib/floor-plan'
import { TWO_ANGLE_L, TWO_ANGLE_L_SAME_WALL, TWO_ANGLE_L_UNDER_REPORTED } from './fixtures/vision-two-angle-l'

const full = { start: 0, end: 100 }
const run = (wall: 'top' | 'bottom' | 'left' | 'right') => ({ wall, spanPct: full })

const realRead: SpaceVisionResult = {
  lookedLikeKitchen: true,
  layoutShape: 'l_shape',
  hasIsland: false,
  lengthCm: 420,
  widthCm: 260,
  ceilingHeightCm: 250,
  wallRuns: [
    { wall: 'left', spanPct: { start: 0, end: 100 } },
    { wall: 'bottom', spanPct: { start: 0, end: 100 } },
    { wall: 'right', spanPct: { start: 55, end: 100 } },
    { wall: 'top', spanPct: { start: 35, end: 100 } },
  ],
  windows: [{ wall: 'top', positionPct: 67, widthPct: 28 }],
  features: {
    sink: { wall: 'bottom', positionPct: 56, confidence: 'H' },
    hob: { wall: 'bottom', positionPct: 50, confidence: 'L' },
    fridge: { wall: 'right', positionPct: 85, confidence: 'L' },
    dishwasher: { wall: 'bottom', positionPct: 78, confidence: 'L' },
    oven: { wall: 'bottom', positionPct: 84, confidence: 'L' },
    hood: { wall: 'bottom', positionPct: 50, confidence: 'L' },
  },
}

describe('reconcileCounterWalls', () => {
  test('l_shape with four listed walls keeps two adjacent walls, led by the evidence-heavy one', () => {
    const walls = reconcileCounterWalls(realRead)
    expect(walls).toHaveLength(2)
    expect(walls[0]).toBe('bottom') // sink H + hob/dw/oven/hood + full span
    expect(['left', 'right']).toContain(walls[1]) // must meet bottom at a corner
  })

  test('the derived plan is an L again, with counters on exactly two walls', () => {
    const plan = fromVision(realRead)
    expect(plan.layoutShape).toBe('l_shape')
    const counterWalls = (['top', 'bottom', 'left', 'right'] as const).filter((w) => plan.room.sides[w].hasCounter)
    expect(counterWalls).toHaveLength(2)
  })

  test('galley with three walls keeps two facing walls', () => {
    const walls = reconcileCounterWalls({
      lookedLikeKitchen: true,
      layoutShape: 'galley',
      wallRuns: [run('top'), run('bottom'), run('left')],
      features: { sink: { wall: 'top', positionPct: 50, confidence: 'H' } },
    })
    expect(walls).toEqual(['top', 'bottom'])
  })

  test('u_shape with four walls keeps three', () => {
    const walls = reconcileCounterWalls({
      lookedLikeKitchen: true,
      layoutShape: 'u_shape',
      wallRuns: [run('top'), run('bottom'), run('left'), run('right')],
      features: { sink: { wall: 'top', positionPct: 50, confidence: 'H' }, fridge: { wall: 'left', positionPct: 10, confidence: 'M' } },
    })
    expect(walls).toHaveLength(3)
    expect(walls).toContain('top')
    expect(walls).toContain('left')
  })

  test('fewer walls than the shape implies are never invented', () => {
    expect(reconcileCounterWalls({ lookedLikeKitchen: true, layoutShape: 'u_shape', wallRuns: [run('top')] })).toEqual(['top'])
    expect(reconcileCounterWalls({ lookedLikeKitchen: true, layoutShape: 'l_shape', wallRuns: [run('top'), run('left')] })).toEqual(['top', 'left'])
  })

  test('ambiguous shapes are left untouched', () => {
    const four = [run('top'), run('bottom'), run('left'), run('right')]
    expect(reconcileCounterWalls({ lookedLikeKitchen: true, layoutShape: 'unsure', wallRuns: four })).toHaveLength(4)
    expect(reconcileCounterWalls({ lookedLikeKitchen: true, layoutShape: 'open', wallRuns: four })).toHaveLength(4)
  })
})

describe('phantom island guard', () => {
  test('a zero-sized island object with hasIsland:false yields no island', () => {
    const plan = fromVision({
      ...realRead,
      hasIsland: false,
      features: { ...realRead.features, island: { positionPct: { x: 0, y: 0 }, sizePct: { w: 0, h: 0 } } },
    })
    expect(plan.hasIsland).toBe(false)
    expect(plan.island).toBeUndefined()
  })
  test('a real island with geometry is kept', () => {
    const plan = fromVision({
      ...realRead,
      hasIsland: true,
      features: { ...realRead.features, island: { positionPct: { x: 50, y: 50 }, sizePct: { w: 40, h: 25 } } },
    })
    expect(plan.hasIsland).toBe(true)
  })
})

// ─── IMP-31: all photos are one room ───────────────────────────────────────

const counterWallsOf = (plan: ReturnType<typeof fromVision>) =>
  (['top', 'bottom', 'left', 'right'] as const).filter((w) => plan.room.sides[w].hasCounter)

describe('photo views join the photos into one room', () => {
  test("the testers' two-angle L: two counter walls, each photo labelled", () => {
    const out = normalizeVisionRead(TWO_ANGLE_L, 2)
    expect(out.photoViews!.map((v) => v.shows)).toEqual(['top', 'left'])
    expect(out.photoViews!.map((v) => v.photoIndex)).toEqual([0, 1])
    const plan = fromVision(out)
    expect(plan.layoutShape).toBe('l_shape')
    expect(counterWallsOf(plan)).toEqual(['top', 'left'])
  })

  test('the second wall survives when the model under-reports its runs', () => {
    const plan = fromVision(normalizeVisionRead(TWO_ANGLE_L_UNDER_REPORTED, 2))
    expect(counterWallsOf(plan)).toEqual(['top', 'left'])
    expect(plan.layoutShape).toBe('l_shape')
  })

  test('both photos read as one wall → a single wall, until the homeowner corrects photo 2', () => {
    const out = normalizeVisionRead(TWO_ANGLE_L_SAME_WALL, 2)
    const before = fromVision(out)
    expect(counterWallsOf(before)).toEqual(['top'])
    expect(before.layoutShape).toBe('single_wall')

    const corrected = relabelPhotoView(out, 1, 'left')
    expect(corrected.photoViews![1]).toMatchObject({ shows: 'left', counterWalls: ['left'], source: 'homeowner', confidence: 'H' })
    const after = fromVision(corrected)
    expect(counterWallsOf(after)).toEqual(['top', 'left'])
    expect(after.layoutShape).toBe('l_shape')
  })

  test('a corrected view that carried no counter adds none', () => {
    const out = normalizeVisionRead(
      { ...TWO_ANGLE_L, photoViews: [TWO_ANGLE_L.photoViews![0], { photo: 2, shows: 'unclear', counterWalls: [], confidence: 'L' }] },
      2
    )
    expect(relabelPhotoView(out, 1, 'bottom').photoViews![1].counterWalls).toEqual([])
  })

  test('an over-read is still trimmed — now deterministically by what the photo shows', () => {
    const out = normalizeVisionRead(
      { ...realRead, photoViews: [{ photo: 1, shows: 'bottom_left', counterWalls: ['bottom', 'left', 'right', 'top'], confidence: 'H' }] },
      1
    )
    // A photo can only show its corner's two walls.
    expect(out.photoViews![0].counterWalls).toEqual(['bottom', 'left'])
    expect(reconcileCounterWalls(out).sort()).toEqual(['bottom', 'left'])
  })

  test('index hygiene: one view per photo, in order, out-of-range and repeats dropped', () => {
    const out = normalizeVisionRead(
      {
        ...TWO_ANGLE_L,
        photoViews: [
          { photo: 1, shows: 'top', counterWalls: ['top'], confidence: 'H' },
          { photo: 1, shows: 'right', counterWalls: ['right'], confidence: 'H' },
          { photo: 5, shows: 'left', counterWalls: ['left'], confidence: 'H' },
          { photo: 0, shows: 'left', counterWalls: ['left'], confidence: 'H' },
          { photo: 3, shows: 'nonsense', counterWalls: ['top'], confidence: 'Z' },
        ],
      },
      3
    )
    expect(out.photoViews).toEqual([
      { photoIndex: 0, shows: 'top', counterWalls: ['top'], confidence: 'H', source: 'ai_vision' },
      { photoIndex: 1, shows: 'unclear', counterWalls: [], confidence: 'L', source: 'ai_vision' },
      { photoIndex: 2, shows: 'unclear', counterWalls: [], confidence: 'L', source: 'ai_vision' },
    ])
  })

  test('a read without views reconciles exactly as before, and still gets one view per photo', () => {
    const legacy = normalizeVisionRead(realRead, 2)
    expect(legacy.photoViews!.every((v) => v.shows === 'unclear')).toBe(true)
    expect(reconcileCounterWalls({ ...legacy, photoViews: undefined })).toEqual(reconcileCounterWalls(realRead))
    expect(reconcileCounterWalls(legacy)).toEqual(reconcileCounterWalls(realRead))
  })

  test('dims outside the hard limits or the shape band are dropped', () => {
    expect(normalizeVisionRead({ ...TWO_ANGLE_L, lengthCm: 1500 }, 2).lengthCm).toBeUndefined()
    const galleyTooWide = normalizeVisionRead({ ...TWO_ANGLE_L, layoutShape: 'galley', lengthCm: 400, widthCm: 380 }, 2)
    expect(galleyTooWide.lengthCm).toBeUndefined()
    expect(galleyTooWide.widthCm).toBeUndefined()
    expect(normalizeVisionRead(TWO_ANGLE_L, 2).lengthCm).toBe(380)
  })

  test('wallsOf: walls, corners, unclear', () => {
    expect(wallsOf('left')).toEqual(['left'])
    expect(wallsOf('bottom_right')).toEqual(['bottom', 'right'])
    expect(wallsOf('unclear')).toEqual([])
  })
})

describe('single wall', () => {
  test('one counter wall reads as a single wall for wall layouts, not for island or unsure', () => {
    expect(shapeFromCounterWalls(['top'], 'l_shape')).toBe('single_wall')
    expect(shapeFromCounterWalls(['top'], 'single_wall')).toBe('single_wall')
    expect(shapeFromCounterWalls(['top'], 'island')).toBe('island')
    expect(shapeFromCounterWalls(['top'], 'unsure')).toBe('unsure')
  })
  test('a single_wall label keeps one wall', () => {
    expect(reconcileCounterWalls({ lookedLikeKitchen: true, layoutShape: 'single_wall', wallRuns: [run('top'), run('left')] })).toHaveLength(1)
  })
})

describe('review: a label moves the photo, it never invents runs', () => {
  test('picking the label a photo already has changes nothing', () => {
    const out = normalizeVisionRead(
      { ...TWO_ANGLE_L, photoViews: [{ photo: 1, shows: 'top_left', counterWalls: ['top'], confidence: 'H' }, TWO_ANGLE_L.photoViews![1]] },
      2
    )
    expect(relabelPhotoView(out, 0, 'top_left')).toBe(out)
  })

  test('a wall photo relabelled to a corner keeps only the runs it can show — no widening', () => {
    const out = normalizeVisionRead(TWO_ANGLE_L, 2)
    expect(relabelPhotoView(out, 0, 'top_right').photoViews![0].counterWalls).toEqual(['top'])
    expect(relabelPhotoView(out, 0, 'bottom_left').photoViews![0].counterWalls).toEqual([])
  })

  test('wall → wall and corner → corner turn the runs with the frame', () => {
    const out = normalizeVisionRead(
      { ...TWO_ANGLE_L, photoViews: [{ photo: 1, shows: 'top_left', counterWalls: ['top', 'left'], confidence: 'M' }, TWO_ANGLE_L.photoViews![1]] },
      2
    )
    expect(relabelPhotoView(out, 0, 'top_right').photoViews![0].counterWalls.sort()).toEqual(['right', 'top'])
    expect(relabelPhotoView(out, 1, 'bottom').photoViews![1].counterWalls).toEqual(['bottom'])
  })

  test('views without a run list still join the photos', () => {
    const plan = fromVision(normalizeVisionRead({ ...TWO_ANGLE_L, wallRuns: undefined, photoViews: [
      { photo: 1, shows: 'top', counterWalls: ['top'], confidence: 'H' },
      { photo: 2, shows: 'right', counterWalls: ['right'], confidence: 'H' },
    ] }, 2))
    expect((['top', 'bottom', 'left', 'right'] as const).filter((w) => plan.room.sides[w].hasCounter)).toEqual(['top', 'right'])
  })
})
