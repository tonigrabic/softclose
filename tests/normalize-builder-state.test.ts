/**
 * Builder states saved before maker testing (2026-09-23) carry choices that no
 * longer exist. `normalizeBuilderState` maps them onto the current ones so a
 * resumed kitchen shows a selection and a saved brief prices the same kitchen.
 */
import { describe, expect, test } from 'vitest'
import { fromShapePreset, validate } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { normalizeBuilderState } from '@/lib/builder/normalize'
import { computeBom } from '@/lib/builder/bom'
import type { BuilderState } from '@/lib/builder/inventory'

const current = () =>
  hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(validate(fromShapePreset('l_shape'))) })

/** The same kitchen in the pre-testing shape. */
function legacy(): BuilderState {
  const s = current()
  const meta = { confidence: 'H', provenance: 'homeowner-edited' }
  return {
    ...s,
    cabinetBoxes: { ...s.cabinetBoxes, carcassMaterial: 'matched_to_door' },
    backsplash: { kind: 'wall_panel', decorCode: 'F186', heightCm: 90, meta: { kind: meta, heightCm: meta } },
    lighting: {
      underCabinetLed: false,
      plinthLed: true,
      pendantOverIsland: true,
      pendantCount: 2,
      smartControls: true,
      meta: { underCabinetLed: meta },
    },
    finishing: {
      plinthHeightMm: 120,
      plinthMaterial: 'black_recessed',
      corniceStyle: 'crown',
      endPanelsCount: 2,
      openShelvingMeters: 1,
      meta: { plinthHeightMm: meta, plinthMaterial: meta },
    },
  } as unknown as BuilderState
}

describe('normalizeBuilderState', () => {
  test('a current-shape state comes back untouched (same object)', () => {
    const s = current()
    expect(normalizeBuilderState(s)).toBe(s)
  })

  test('maps every retired value onto the nearest current choice', () => {
    const n = normalizeBuilderState(legacy())
    expect(n.cabinetBoxes.carcassMaterial).toBe('colored_melamine')
    expect(n.backsplash).toEqual({ kind: 'other', meta: { kind: { confidence: 'H', provenance: 'homeowner-edited' } } })
    // Any old LED layer means "yes, LED"; pendants / smart controls are dropped.
    expect(n.lighting.led).toBe(true)
    expect(n.finishing.plinthHeightMm).toBe(100)
    expect(n.finishing.plinthMaterial).toBe('plastic')
    expect(Object.keys(n.finishing)).toEqual(['plinthHeightMm', 'plinthMaterial', 'meta'])
  })

  test('is idempotent', () => {
    const once = normalizeBuilderState(legacy())
    expect(normalizeBuilderState(once)).toBe(once)
  })

  test('computeBom prices a legacy state without NaN lines', () => {
    const bom = computeBom(legacy())
    for (const l of bom.lineItems) {
      expect(Number.isFinite(l.low) && Number.isFinite(l.high)).toBe(true)
    }
    expect(bom.lineItems.map((l) => l.key)).toContain('lighting')
  })
})
