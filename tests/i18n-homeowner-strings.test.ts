/**
 * The homeowner UI is Croatian-first. Two ways it slipped back to English
 * (walked in hr-HR on 2026-09-23): strings hardcoded in components, and
 * server error text shown as-is. These guard the pieces that are easy to break
 * without noticing:
 *  - sentence keys carry {slots} the code fills — a translation that drops or
 *    renames one silently loses a chip or leaves "{wall}" on screen;
 *  - the floor-plan SVG draws its own words, so it must follow the locale;
 *  - failed requests map to a localized line, never the server's English.
 */
import { describe, expect, test } from 'vitest'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import { fromShapePreset, makeFeature, renderFloorPlanSvg, validate } from '@/lib/floor-plan'
import { ApiError, apiErrorKey } from '@/lib/api/client'
import { tDynamic } from '@/lib/i18n/core'
import { runLabel } from '@/components/builder/runLabel'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { builderPickLabels } from '@/lib/builder/pick-labels'

function slots(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe('locale placeholders', () => {
  test('every key uses the same {slots} in hr-HR and en-US', () => {
    const mismatched = (Object.keys(hrHR) as (keyof typeof hrHR)[])
      .filter((key) => slots(hrHR[key]).join() !== slots(enUS[key]).join())
      .map((key) => `${key}: hr {${slots(hrHR[key])}} vs en {${slots(enUS[key])}}`)
    expect(mismatched).toEqual([])
  })
})

describe('floor-plan SVG labels', () => {
  const plan = (() => {
    const base = fromShapePreset('island', { hasIsland: true })
    return validate({
      ...base,
      features: [...base.features, makeFeature('dishwasher', 'top', base.room)],
    })
  })()

  test('draws Croatian by default (the launch market)', () => {
    const svg = renderFloorPlanSvg(plan)
    expect(svg).toContain('>Otok<')
    expect(svg).toContain('>Perilica<')
    expect(svg).toContain('Skica — nije izmjera')
    expect(svg).not.toMatch(/>Island<|Schematic/)
  })

  test('follows an explicit locale', () => {
    const svg = renderFloorPlanSvg(plan, { locale: 'en-US' })
    expect(svg).toContain('>Island<')
    expect(svg).toContain('>DW<')
    expect(svg).toContain('aria-label="Schematic floor plan"')
  })
})

describe('runLabel', () => {
  const hr = (key: string) => tDynamic(key, 'hr-HR')

  test("translates the contract's default English side names", () => {
    expect(runLabel({ id: 'top', label: 'Top' }, hr)).toBe('Gornji zid')
    expect(runLabel({ id: 'island', label: 'Island' }, hr)).toBe('Otok')
  })

  test('keeps a wall name the homeowner typed', () => {
    expect(runLabel({ id: 'left', label: 'zid s prozorom' }, hr)).toBe('zid s prozorom')
  })
})

describe('apiErrorKey', () => {
  test('names the reason when the status gives one', () => {
    expect(apiErrorKey(new ApiError('Too many vision calls', 429), 'space.error.analyzeFailed')).toBe('api.error.tooMany')
    expect(apiErrorKey(new ApiError('x', 401, 'auth_required'), 'space.error.analyzeFailed')).toBe('api.error.session')
    expect(apiErrorKey(new ApiError('x', 413), 'space.error.analyzeFailed')).toBe('api.error.tooLarge')
  })

  test("falls back to the caller's own line for everything else", () => {
    expect(apiErrorKey(new ApiError('No structured result returned', 500), 'inspiration.error')).toBe('inspiration.error')
    expect(apiErrorKey(new TypeError('Failed to fetch'), 'inspiration.error')).toBe('inspiration.error')
  })

  test('a route can say what its own status means', () => {
    // render-concept answers 429 when the per-session render cap is used up.
    expect(
      apiErrorKey(new ApiError('x', 429), 'concept.error.renderFailed', { 429: 'concept.error.capReached' })
    ).toBe('concept.error.capReached')
  })
})

describe('builderPickLabels (wrap-up style rows)', () => {
  const built = () =>
    hydrateFromHypothesis(null, { layoutContract: floorPlanToLayout(validate(fromShapePreset('l_shape'))) })

  test('says what the builder said, in Croatian', () => {
    const s = built()
    expect(builderPickLabels(s, 'hr-HR')).toEqual({
      doors: 'Iveral · Bijela premium (W1000)',
      worktop: 'Laminat · Chicago beton svijetlo sivi (F186)',
      backsplash: 'U dekoru radne ploče',
    })
  })

  test('follows the locale, decor names included', () => {
    expect(builderPickLabels(built(), 'en-US')?.doors).toBe('Melamine board (iveral) · Premium white (W1000)')
  })

  test('lacquered MDF reads as RAL colour and profile, aluminium as itself', () => {
    const s = built()
    const lacquered = { ...s, doors: { ...s.doors, material: 'lacquered_mdf' as const, ralCode: 'RAL 9016', profile: 'inset' as const } }
    expect(builderPickLabels(lacquered, 'hr-HR')?.doors).toBe('Lakirani medijapan · RAL 9016 · S ukladom')
    const alu = { ...s, doors: { ...s.doors, material: 'alu_glass' as const } }
    expect(builderPickLabels(alu, 'hr-HR')?.doors).toBe('Aluminij sa staklom')
  })

  test('a stone worktop carries no laminate decor; typed cladding reads as typed', () => {
    const s = built()
    const picks = builderPickLabels(
      {
        ...s,
        worktop: { ...s.worktop, family: 'quartz' },
        backsplash: { ...s.backsplash, kind: 'other', otherDecor: '  zidne letve u hrastu ' },
      },
      'hr-HR'
    )
    expect(picks?.worktop).toBe('Kvarc')
    expect(picks?.backsplash).toBe('zidne letve u hrastu')
  })

  test('no builder run, no rows', () => {
    expect(builderPickLabels(undefined, 'hr-HR')).toBeNull()
  })
})
