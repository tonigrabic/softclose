/**
 * Hybrid layout derivation (the funnel⇄builder seam, post-merge): the layout we
 * PRICE comes from the AI render, anchored to the photo's true cm scale.
 *
 * These pin the authority split in lib/derive-layout.ts:
 *   scale + shell  ← the photo space-vision read
 *   shape + island ← the render hypothesis
 */
import { describe, expect, test } from 'vitest'
import type { SpaceVisionResult } from '@/lib/types'
import type { BuilderHypothesis } from '@/lib/builder/hypothesis'
import { spaceVisionWithRenderLayout, renderDerivedFloorPlan } from '@/lib/derive-layout'

const photoVision: SpaceVisionResult = {
  lookedLikeKitchen: true,
  layoutShape: 'galley', // existing kitchen is a plain galley…
  hasIsland: false, // …with no island
  lengthCm: 420,
  widthCm: 260,
}

// …but the render the homeowner fell for adds an island and reads as l-shape.
const renderWithIsland: BuilderHypothesis = {
  usable: true,
  layout: {
    shape: { value: 'l_shape', confidence: 'M' },
    hasIsland: { value: true, confidence: 'M' },
  },
}

describe('spaceVisionWithRenderLayout', () => {
  test('render owns shape + island; photo owns the cm scale', () => {
    const merged = spaceVisionWithRenderLayout(photoVision, renderWithIsland)
    expect(merged).not.toBeNull()
    // configuration from the render
    expect(merged!.layoutShape).toBe('l_shape')
    expect(merged!.hasIsland).toBe(true)
    // scale stays the photo's (the only true measurement)
    expect(merged!.lengthCm).toBe(420)
    expect(merged!.widthCm).toBe(260)
  })

  test('no render layout → photo vision passes through unchanged', () => {
    expect(spaceVisionWithRenderLayout(photoVision, { usable: true })).toEqual(photoVision)
    expect(spaceVisionWithRenderLayout(photoVision, null)).toEqual(photoVision)
  })

  test('an unsure render shape does not override the photo read', () => {
    const merged = spaceVisionWithRenderLayout(photoVision, {
      usable: true,
      layout: { shape: { value: 'unsure', confidence: 'L' } },
    })
    expect(merged!.layoutShape).toBe('galley')
  })

  test('synthesises a minimal result when there were no photos', () => {
    const merged = spaceVisionWithRenderLayout(null, renderWithIsland)
    expect(merged!.layoutShape).toBe('l_shape')
    expect(merged!.hasIsland).toBe(true)
  })

  // The phantom-island bug: the photo read thought there was an island, the
  // render does NOT confirm one, and the old merge let the stale flag through.
  test('render silent on island ⇒ NO island (kills the phantom)', () => {
    const photoThoughtIsland: SpaceVisionResult = {
      lookedLikeKitchen: true,
      layoutShape: 'island',
      hasIsland: true,
      lengthCm: 480,
      widthCm: 380,
      features: { island: { positionPct: { x: 50, y: 50 }, sizePct: { w: 30, h: 25 } } },
    }
    const renderNoIslandField: BuilderHypothesis = {
      usable: true,
      layout: { shape: { value: 'l_shape', confidence: 'M' } }, // no hasIsland
    }
    const merged = spaceVisionWithRenderLayout(photoThoughtIsland, renderNoIslandField)
    expect(merged!.hasIsland).toBe(false)
    expect(merged!.features?.island).toBeUndefined()
    // …and it carries through to the plan: no island object, no island run.
    const plan = renderDerivedFloorPlan(photoThoughtIsland, renderNoIslandField)
    expect(plan.hasIsland).toBe(false)
    expect(plan.island).toBeUndefined()
  })

  test('render explicitly says island:false ⇒ no island', () => {
    const merged = spaceVisionWithRenderLayout(photoVision, {
      usable: true,
      layout: { shape: { value: 'l_shape', confidence: 'M' }, hasIsland: { value: false, confidence: 'H' } },
    })
    expect(merged!.hasIsland).toBe(false)
  })

  // The "always missing hood + stove" fix: the render's appliance read seeds the
  // oven + extractor hood when the photo read didn't place them.
  test('seeds oven + hood from the render appliance read', () => {
    const renderWithCooking: BuilderHypothesis = {
      usable: true,
      layout: { shape: { value: 'l_shape', confidence: 'M' } },
      appliances: {
        oven: { value: 'single', confidence: 'M' },
        extractor: { value: 'chimney', confidence: 'M' },
      },
    }
    const merged = spaceVisionWithRenderLayout(photoVision, renderWithCooking)
    expect(merged!.features?.oven).toBeDefined()
    expect(merged!.features?.hood).toBeDefined()

    const plan = renderDerivedFloorPlan(photoVision, renderWithCooking)
    expect(plan.features.map((f) => f.kind)).toEqual(
      expect.arrayContaining(['oven', 'hood'])
    )
  })
})

describe('renderDerivedFloorPlan', () => {
  test('builds a plan with photo dimensions but a render-added island', () => {
    const plan = renderDerivedFloorPlan(photoVision, renderWithIsland)
    expect(plan.layoutShape).toBe('l_shape')
    expect(plan.hasIsland).toBe(true)
    expect(plan.island).toBeDefined()
    // Dimensions are the photo's (length ≥ width by the model's convention).
    expect(plan.room.lengthCm).toBe(420)
    expect(plan.room.widthCm).toBe(260)
  })

  test('with no render and no photos, falls back to an unsure preset plan', () => {
    const plan = renderDerivedFloorPlan(null, null)
    expect(plan.layoutShape).toBe('unsure')
    expect(plan.hasIsland).toBe(false)
  })
})
