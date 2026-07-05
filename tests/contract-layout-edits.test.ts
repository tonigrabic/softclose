/**
 * The contract-confirmation rework: shape is DERIVED from the counter-bearing
 * walls (never a stale stored label), the AI's wall runs decide WHICH wall
 * carries the counter (fixing "the run is on the wrong wall"), an island only
 * appears with positive evidence, and a measured oven lands in the per-wall
 * cabinet sequence. These pin the behaviour the confirm screen depends on.
 */
import { describe, expect, test } from 'vitest'
import type { SpaceVisionResult } from '@/lib/types'
import { fromVision, fromShapePreset, validate } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { summarizeContract } from '@/lib/builder/cabinet-suggest'

describe('shape derived from the walls', () => {
  test('toggling which walls carry counter re-derives the shape label', () => {
    const l = fromShapePreset('l_shape') // top + left by default
    expect(l.layoutShape).toBe('l_shape')

    // Move the second run from left to bottom → two OPPOSITE walls → galley.
    const galley = validate({
      ...l,
      room: {
        ...l.room,
        sides: {
          ...l.room.sides,
          left: { ...l.room.sides.left, hasCounter: false },
          bottom: { ...l.room.sides.bottom, hasCounter: true },
        },
      },
    })
    expect(galley.layoutShape).toBe('galley')

    // Add a third wall → U-shape.
    const u = validate({
      ...galley,
      room: {
        ...galley.room,
        sides: { ...galley.room.sides, right: { ...galley.room.sides.right, hasCounter: true } },
      },
    })
    expect(u.layoutShape).toBe('u_shape')
  })
})

describe('removing a wall (the contract card / canvas edit)', () => {
  test('dropping a counter wall turns a U into an L and removes its run', () => {
    // A U-shape: counter on top + left + right (the "AI added a third wall" case).
    const u = validate(fromShapePreset('u_shape'))
    expect(u.layoutShape).toBe('u_shape')
    expect(floorPlanToLayout(u).runs.length).toBe(3)

    // What the card's "Remove wall" button does: clear that side's counter.
    const l = validate({
      ...u,
      room: {
        ...u.room,
        sides: { ...u.room.sides, right: { ...u.room.sides.right, hasCounter: false } },
      },
    })
    // top + left remain (adjacent) → L, and the right run is gone from the contract.
    expect(l.layoutShape).toBe('l_shape')
    const contract = floorPlanToLayout(l)
    expect(contract.runs.length).toBe(2)
    expect(contract.runs.find((r) => r.id === 'right')).toBeUndefined()
  })
})

describe('fromVision — wall runs decide which wall, not a shape default', () => {
  test("the AI's wall runs put the counter on the wall it actually saw", () => {
    const vision: SpaceVisionResult = {
      lookedLikeKitchen: true,
      layoutShape: 'l_shape',
      lengthCm: 400,
      widthCm: 300,
      // AI saw runs on the TOP and the RIGHT — not the left the l-shape default assumes.
      wallRuns: [
        { wall: 'top', spanPct: { start: 0, end: 100 } },
        { wall: 'right', spanPct: { start: 0, end: 100 } },
      ],
    }
    const plan = fromVision(vision)
    expect(plan.room.sides.right.hasCounter).toBe(true)
    expect(plan.room.sides.left.hasCounter).toBe(false)
    // top + right are adjacent → still an L, but on the correct walls.
    expect(plan.layoutShape).toBe('l_shape')
  })
})

describe('fromVision — island only with positive evidence', () => {
  test('an "island" shape guess alone does NOT fabricate an island', () => {
    const vision: SpaceVisionResult = {
      lookedLikeKitchen: true,
      layoutShape: 'island',
      lengthCm: 480,
      widthCm: 380,
    }
    const plan = fromVision(vision)
    expect(plan.island).toBeUndefined()
    expect(plan.hasIsland).toBe(false)
  })

  test('an explicit hasIsland:true does create one', () => {
    const plan = fromVision({
      lookedLikeKitchen: true,
      layoutShape: 'l_shape',
      lengthCm: 480,
      widthCm: 380,
      hasIsland: true,
    })
    expect(plan.island).toBeDefined()
    expect(plan.hasIsland).toBe(true)
  })
})

describe('oven + hood reach the contract', () => {
  const vision: SpaceVisionResult = {
    lookedLikeKitchen: true,
    layoutShape: 'galley',
    lengthCm: 400,
    widthCm: 240,
    wallRuns: [{ wall: 'top', spanPct: { start: 0, end: 100 } }],
    features: {
      hob: { wall: 'top', positionPct: 40, confidence: 'H' },
      oven: { wall: 'top', positionPct: 40, confidence: 'M' },
      hood: { wall: 'top', positionPct: 40, confidence: 'M' },
      dishwasher: { wall: 'top', positionPct: 70, confidence: 'M' },
    },
  }

  test('all detected appliances — incl. oven + hood — become contract appliances', () => {
    const contract = floorPlanToLayout(fromVision(vision))
    expect(contract.appliances.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['hob', 'oven', 'hood', 'dishwasher'])
    )
  })

  test('the oven shows up as a housing unit in the wall\'s base sequence', () => {
    const contract = floorPlanToLayout(fromVision(vision))
    const summary = summarizeContract(contract)
    const topRow = summary.rows.find((r) => r.id === 'top')!
    expect(topRow.units.some((u) => u.pattern === 'oven_housing')).toBe(true)
    // dishwasher still seeds its appliance-front slot alongside the oven.
    expect(topRow.units.some((u) => u.pattern === 'appliance_slot')).toBe(true)
  })
})
