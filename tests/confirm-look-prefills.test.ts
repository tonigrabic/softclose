/**
 * "AI prefilled this" banner honesty (LOOP.md B3 / app-analysis M3).
 *
 * The confirm-look banner claims the AI prefilled fields. It must show only
 * when VISION actually contributed a look field — never for a fully manual
 * journey (homeowner-tagged styles, hand-tapped chips). False provenance
 * claims are a trust break (messaging-implications.md trust scaffold).
 */
import { describe, expect, test } from 'vitest'
import { visionPrefilledLook } from '@/lib/derive-prefills'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'
import type { SpaceVisionResult } from '@/lib/types'

describe('visionPrefilledLook', () => {
  test('fully manual journey → no banner', () => {
    expect(visionPrefilledLook(null, null)).toBe(false)
  })

  test('inspiration vision with a look guess → banner', () => {
    const vision: InspirationVisionResult = { styleGuess: 'modern_minimal' }
    expect(visionPrefilledLook(vision, null)).toBe(true)
  })

  test('space vision with a door-material hint → banner', () => {
    const space: SpaceVisionResult = { lookedLikeKitchen: true, materialHints: ['shaker fronts, painted'] }
    expect(visionPrefilledLook(null, space)).toBe(true)
  })

  test('space vision with only layout reads (no look fields) → no banner', () => {
    const space: SpaceVisionResult = { lookedLikeKitchen: true, layoutShape: 'l_shape', hasIsland: true }
    expect(visionPrefilledLook(null, space)).toBe(false)
  })
})
