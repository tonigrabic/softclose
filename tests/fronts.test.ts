/**
 * Fronts are quoted by material (maker testing, 2026-09-23): iveral at the
 * Elgrad decor's board price, lacquered MDF by profile, aluminium + glass as a
 * bought-in front. The RAL colour is a look, not a price.
 */
import { describe, expect, test } from 'vitest'
import { fromShapePreset, validate } from '@/lib/floor-plan'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'
import { frontFromStyle, normalizeBuilderState } from '@/lib/builder/normalize'
import { findRal, normalizeRalCode, RAL_KITCHEN_SHORTLIST } from '@/lib/catalog/ral'
import { decors } from '@/lib/catalog'
import type { BuilderState } from '@/lib/builder/inventory'

const base = () =>
  hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(validate(fromShapePreset('l_shape'))) })
const withFront = (s: BuilderState, doors: Partial<BuilderState['doors']>): BuilderState => ({
  ...s,
  doors: { ...s.doors, ...doors },
})
const fronts = (s: BuilderState) => computeBom(s).lineItems.find((l) => l.key === 'fronts')!

describe('fronts pricing', () => {
  const s = base()

  test('defaults to an iveral front in an Elgrad decor, labelled name + code', () => {
    expect(s.doors.material).toBe('iveral')
    expect(fronts(s).detail).toMatch(/\([A-Z]\d+ ST\d+\)$/)
  })

  test('lacquered MDF costs more than iveral; relief > inset > flat', () => {
    const iveral = fronts(s).low
    const [flat, inset, relief] = (['flat', 'inset', 'relief'] as const).map(
      (profile) => fronts(withFront(s, { material: 'lacquered_mdf', profile })).low
    )
    expect(flat).toBeGreaterThan(iveral)
    expect(inset).toBeGreaterThan(flat)
    expect(relief).toBeGreaterThan(inset)
  })

  test('the RAL colour does not move the price', () => {
    const a = fronts(withFront(s, { material: 'lacquered_mdf', ralCode: 'RAL 9016' }))
    const b = fronts(withFront(s, { material: 'lacquered_mdf', ralCode: 'RAL 7016' }))
    expect([a.low, a.high]).toEqual([b.low, b.high])
    expect(b.detail).toContain('RAL 7016')
  })

  test('lacquered fronts carry no ABS edge banding', () => {
    const edge = (st: BuilderState) => computeBom(st).lineItems.find((l) => l.key === 'edgeBanding')!.low
    expect(edge(withFront(s, { material: 'lacquered_mdf' }))).toBeLessThan(edge(s))
  })

  test('the kitchen band keeps the ±20% promise for every material', () => {
    for (const material of ['iveral', 'lacquered_mdf', 'alu_glass'] as const) {
      const w = computeBom(withFront(s, { material })).sections.works
      expect(Math.round(w.bandWidthPct / 2)).toBeLessThanOrEqual(20)
    }
  })
})

describe('legacy front "style" → material + profile', () => {
  test('shaker → lacquered inset, beaded → relief, the rest iveral', () => {
    expect(frontFromStyle('shaker')).toEqual({ material: 'lacquered_mdf', profile: 'inset' })
    expect(frontFromStyle('beaded')).toEqual({ material: 'lacquered_mdf', profile: 'relief' })
    expect(frontFromStyle('slab')).toEqual({ material: 'iveral', profile: 'flat' })
    expect(frontFromStyle(undefined)).toEqual({ material: 'iveral', profile: 'flat' })
  })

  test('a saved state with only `style` migrates and keeps its decor', () => {
    const s = base()
    const doors: Record<string, unknown> = { ...s.doors, style: 'shaker', decorCode: 'U708', decorStructure: 'ST9' }
    for (const k of ['material', 'ralCode', 'profile']) delete doors[k]
    const legacy = { ...s, doors } as unknown as BuilderState
    const n = normalizeBuilderState(legacy)
    expect(n.doors).toMatchObject({ material: 'lacquered_mdf', profile: 'inset', ralCode: 'RAL 9016', decorCode: 'U708' })
    expect(normalizeBuilderState(n)).toBe(n)
  })
})

describe('RAL lookup', () => {
  test('accepts how people type a code', () => {
    expect(normalizeRalCode('9016')).toBe('RAL 9016')
    expect(normalizeRalCode('ral9016')).toBe('RAL 9016')
    expect(normalizeRalCode(' RAL 9016 ')).toBe('RAL 9016')
    expect(normalizeRalCode('90')).toBeNull()
  })

  test('finds solids, refuses unknown and unshowable (pearl) codes', () => {
    expect(findRal('7016')?.hex).toMatch(/^#[0-9A-F]{6}$/i)
    expect(findRal('RAL 0000')).toBeNull()
    expect(findRal('RAL 1035')).toBeNull() // pearl beige
  })

  test('the kitchen shortlist is 25 solid colours', () => {
    expect(RAL_KITCHEN_SHORTLIST).toHaveLength(25)
    expect(RAL_KITCHEN_SHORTLIST.every((c) => c.finish === 'solid')).toBe(true)
  })
})

describe('curated Elgrad decors', () => {
  test('carry 18 mm board prices, never compact-worktop prices (the 2026-09-26 parser fix)', () => {
    for (const d of decors) {
      if (d.prices.iverica18 != null) expect(d.prices.iverica18, `${d.code} ${d.structure}`).toBeLessThan(60)
    }
  })

  test('include the classic white makers quote, W960 ST7', () => {
    expect(decors.find((d) => d.code === 'W960' && d.structure === 'ST7')?.prices.iverica18).toBe(17.3)
  })
})
