/**
 * Vision wall reconciliation — the model's shape label bounds how many walls
 * carry counter. Pinned on the real 2026-09-19 read: `l_shape` + four wallRuns
 * became a 36-unit U-shape.
 */
import { describe, expect, test } from 'vitest'
import type { SpaceVisionResult } from '@/lib/types'
import { fromVision, reconcileCounterWalls } from '@/lib/floor-plan'

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
