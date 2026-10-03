/**
 * The plan the confirm step opens with (IMP-32): the plan, never the picture.
 * The render is not read back into the layout, so the seed is the plan in
 * hand, then the profile's plan as it is, then the photo read.
 */
import { describe, expect, test } from 'vitest'
import type { SpaceVisionResult } from '@/lib/types'
import { counterWalls, fromShapePreset, fromVision, isRoomMeasured, validate } from '@/lib/floor-plan'
import { seedConfirmPlan } from '@/lib/derive-layout'

const photoVision: SpaceVisionResult = {
  lookedLikeKitchen: true,
  layoutShape: 'galley',
  hasIsland: false,
  lengthCm: 420,
  widthCm: 260,
}

describe('seedConfirmPlan', () => {
  test('the plan in hand wins over the profile plan and the photo read', () => {
    const current = validate(fromShapePreset('l_shape'))
    const profilePlan = validate(fromShapePreset('u_shape'))
    expect(seedConfirmPlan(current, profilePlan, photoVision)).toBe(current)
  })

  test('an unmeasured profile plan (a legacy journey) is kept as it is, not rebuilt', () => {
    const legacy = validate(fromShapePreset('u_shape', { hasIsland: true }))
    expect(isRoomMeasured(legacy)).toBe(false)
    expect(seedConfirmPlan(null, legacy, photoVision)).toBe(legacy)
    expect(seedConfirmPlan(undefined, legacy, null)).toBe(legacy)
  })

  test('with no plan at all, the photo read seeds it', () => {
    const seeded = seedConfirmPlan(null, null, photoVision)
    const fromPhotos = fromVision(photoVision)
    expect(seeded.layoutShape).toBe(fromPhotos.layoutShape)
    expect(counterWalls(seeded)).toEqual(counterWalls(fromPhotos))
    expect(seeded.room.lengthCm).toBe(420)
    expect(seeded.room.widthCm).toBe(260)
    expect(seeded.hasIsland).toBe(false)
  })

  test('with nothing at all, an unsure preset', () => {
    const seeded = seedConfirmPlan(null, undefined, undefined)
    expect(seeded.layoutShape).toBe('unsure')
    expect(seeded.hasIsland).toBe(false)
  })
})
