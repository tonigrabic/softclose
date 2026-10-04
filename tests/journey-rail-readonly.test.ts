/**
 * The maker looking in read-only (/kitchen/<projectId>, readOnly when the
 * session is not the customer's) got the homeowner's journey rail beside the
 * wrap-up: "VAŠ SAŽETAK · Vaš prostor · Gradnja · Vaša ponuda". It said "your"
 * about the customer's things, in the formal "Vaš" the rest of the product
 * does not use, and called the range a quote ("ponuda"), which it never is:
 * the maker sends the quote. The mobile pill said the same ("Vaša ponuda ✓"),
 * and under the rail mid-journey the maker read "{maker} vidi tvoj napredak
 * dok radiš" about themselves.
 *
 * Now the rail and the pill speak to the maker wherever the maker sees them —
 * the wrap-up, the steps, the builder: "Kupčev sažetak · Kupčev prostor ·
 * Gradnja · Želje i logistika", and under the rail "Samo za gledanje — kuhinju
 * mijenja kupac." The customer's rail says "tvoj" like the rest of the
 * product, and its third act is named by what it holds too (Toni,
 * 2026-10-04): "Tvoj sažetak · Tvoj prostor · Gradnja · Želje i logistika".
 *
 * Rendered statically (no DOM), like tests/wrapup-readonly.test.ts. The intake
 * restores its journey in an effect, so its first paint is the first step; the
 * wrap-up's own rail is rendered directly, and its mount checked at the source.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { JourneyNavRail, RAIL_COPY, journeyPillLabel, type RailVoice } from '@/components/JourneyNavRail'
import { KitchenIntake, type KitchenIntakeProps } from '@/components/kitchen-intake'
import type { FlowStepId } from '@/lib/flow'
import type { BuilderScreenId } from '@/lib/builder/inventory'
import type { Locale } from '@/lib/i18n/core'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

const MAKER = 'Stolarija Horvat'

/** Its props default to `{}` (the anonymous funnel), which createElement's
 *  overloads cannot infer through. */
const Intake: FunctionComponent<KitchenIntakeProps> = KitchenIntake

function rail(
  props: {
    voice?: RailVoice
    funnelStepId?: FlowStepId
    builderGroupId?: BuilderScreenId
    journeyDone?: boolean
    locale?: Locale
  } = {}
) {
  const { funnelStepId = 'contact', ...rest } = props
  return renderToStaticMarkup(createElement(JourneyNavRail, { funnelStepId, profile: {}, ...rest }))
}

/** A line as renderToStaticMarkup escapes it ("The customer&#x27;s", "&amp;"). */
const esc = (line: string) => line.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')

/** The wrap-up's rail, exactly as the intake mounts it there. */
const wrapUpRail = (voice?: RailVoice, locale?: Locale) => rail({ voice, journeyDone: true, locale })

/** Nothing in the maker's rail says "your", formally or not, or "quote". */
function expectNoHomeownerWords(html: string) {
  expect(html).not.toMatch(/\bva[šs]/i)
  expect(html).not.toMatch(/\btvo[jgm]/i)
  expect(html).not.toMatch(/ponud/i)
}

describe('the wrap-up rail speaks to the maker looking in', () => {
  test('"Kupčev sažetak · Kupčev prostor · Gradnja · Želje i logistika"', () => {
    const html = wrapUpRail('maker')
    expect(html).toContain(`aria-label="${hrHR['journey.readOnly.brief']}"`)
    expect(html).toContain(`>${hrHR['journey.readOnly.brief']}</p>`)
    expect(html).toContain(hrHR['journey.readOnly.act.space'])
    expect(html).toContain(hrHR['journey.readOnly.act.build'])
    expect(html).toContain(hrHR['journey.readOnly.act.offer'])
    // In that order, under the heading.
    const at = (key: keyof typeof hrHR) => html.indexOf(`>${hrHR[key]}<`)
    expect(at('journey.readOnly.brief')).toBeLessThan(at('journey.readOnly.act.space'))
    expect(at('journey.readOnly.act.space')).toBeLessThan(at('journey.readOnly.act.build'))
    expect(at('journey.readOnly.act.build')).toBeLessThan(at('journey.readOnly.act.offer'))
  })

  test('nothing of the customer’s own: no "Tvoj sažetak", "Tvoj prostor"', () => {
    const html = wrapUpRail('maker')
    expect(html).not.toContain(hrHR['journey.brief'])
    expect(html).not.toContain(hrHR['journey.act.space'])
    expectNoHomeownerWords(html)
  })

  test('en-US: "The customer’s brief", no "your", no "offer"', () => {
    const html = wrapUpRail('maker', 'en-US')
    expect(html).toContain(`aria-label="${esc(enUS['journey.readOnly.brief'])}"`)
    expect(html).toContain(esc(enUS['journey.readOnly.act.space']))
    expect(html).toContain(esc(enUS['journey.readOnly.act.build']))
    expect(html).toContain(esc(enUS['journey.readOnly.act.offer']))
    expect(html).not.toMatch(/\byour\b/i)
    expect(html).not.toMatch(/\b(offer|quote)\b/i)
  })

  test('the customer keeps theirs: "Tvoj sažetak · Tvoj prostor · Gradnja · Želje i logistika"', () => {
    for (const html of [wrapUpRail(), wrapUpRail('homeowner')]) {
      expect(html).toContain(`aria-label="${hrHR['journey.brief']}"`)
      expect(html).toContain(hrHR['journey.act.space'])
      expect(html).toContain(hrHR['journey.act.build'])
      expect(html).toContain(hrHR['journey.act.offer'])
      expect(html).not.toContain(hrHR['journey.readOnly.brief'])
      expect(html).not.toContain(hrHR['journey.readOnly.act.space'])
      // Informal like the rest of the product, and never a quote.
      expect(html).not.toMatch(/\bva[šs]/i)
      expect(html).not.toMatch(/ponud/i)
    }
  })
})

describe('the rail mid-journey and in the builder speaks to the maker too', () => {
  test('a step: the maker’s heading and act, the step’s own name under it', () => {
    const html = rail({ voice: 'maker', funnelStepId: 'room' })
    expect(html).toContain(`aria-label="${hrHR['journey.readOnly.brief']}"`)
    expect(html).toContain(hrHR['journey.readOnly.act.space'])
    expect(html).toContain(hrHR['flow.room.label'])
    expectNoHomeownerWords(html)
  })

  test('the builder: the same heading, the build act current', () => {
    const html = rail({ voice: 'maker', funnelStepId: 'builder', builderGroupId: 'worktop' })
    expect(html).toContain(`aria-label="${hrHR['journey.readOnly.brief']}"`)
    expect(html).toContain(hrHR['journey.readOnly.act.build'])
    expect(html).toContain(hrHR['builder.groups.worktop.label'])
    expectNoHomeownerWords(html)
  })
})

describe('the mobile pill says the same', () => {
  test('the wrap-up: "Želje i logistika ✓"', () => {
    const pill = journeyPillLabel({ funnelStepId: 'contact', profile: {}, journeyDone: true, voice: 'maker' })
    expect(pill).toBe(`${hrHR['journey.readOnly.act.offer']} ✓`)
    expect(journeyPillLabel({ funnelStepId: 'contact', profile: {}, journeyDone: true, voice: 'maker', locale: 'en-US' })).toBe(
      `${enUS['journey.readOnly.act.offer']} ✓`
    )
  })

  test('a step and a builder group: the maker’s act, the same position', () => {
    expect(journeyPillLabel({ funnelStepId: 'room', profile: {}, voice: 'maker' })).toBe(
      `${hrHR['journey.readOnly.act.space']} · ${hrHR['flow.room.label']} · 2/5`
    )
    const builder = journeyPillLabel({ funnelStepId: 'builder', profile: {}, builderGroupId: 'worktop', voice: 'maker' })
    const homeowner = journeyPillLabel({ funnelStepId: 'builder', profile: {}, builderGroupId: 'worktop' })
    expect(builder.startsWith(`${hrHR['journey.readOnly.act.build']} · ${hrHR['builder.groups.worktop.label']} · `)).toBe(true)
    expect(builder.split(' · ').at(-1)).toBe(homeowner.split(' · ').at(-1))
  })

  test('the customer keeps theirs', () => {
    expect(journeyPillLabel({ funnelStepId: 'contact', profile: {}, journeyDone: true })).toBe(
      `${hrHR['journey.act.offer']} ✓`
    )
    expect(journeyPillLabel({ funnelStepId: 'room', profile: {} })).toBe(
      `${hrHR['journey.act.space']} · ${hrHR['flow.room.label']} · 2/5`
    )
  })
})

describe('the intake hands the maker’s voice to the rail', () => {
  const intake = (readOnly: boolean) =>
    renderToStaticMarkup(createElement(Intake, { projectId: 'p1', makerName: MAKER, readOnly }))

  test('the maker’s first paint: their rail and pill, and "only for looking" under the rail', () => {
    const html = intake(true)
    expect(html).toContain(`aria-label="${hrHR['journey.readOnly.brief']}"`)
    expect(html).toContain(`${hrHR['journey.readOnly.act.space']} · ${hrHR['flow.space_photos.label']} · 1/5`)
    expect(html).toContain(hrHR['kitchen.home.readOnly.note'])
    expect(html).not.toContain(hrHR['journey.brief'])
    expect(html).not.toContain(hrHR['journey.act.space'])
    // Not "Stolarija Horvat vidi tvoj napredak dok radiš" — to Stolarija Horvat.
    expect(html).not.toContain(hrHR['kitchen.makerSees'].replace('{maker}', MAKER))
  })

  test('the customer’s first paint is unchanged: their rail, and who can see their progress', () => {
    const html = intake(false)
    expect(html).toContain(`aria-label="${hrHR['journey.brief']}"`)
    expect(html).toContain(`${hrHR['journey.act.space']} · ${hrHR['flow.space_photos.label']} · 1/5`)
    expect(html).toContain(hrHR['kitchen.makerSees'].replace('{maker}', MAKER))
    expect(html).not.toContain(hrHR['journey.readOnly.brief'])
    expect(html).not.toContain(hrHR['kitchen.home.readOnly.note'])
  })

  test('every rail and every pill in the intake and the builder gets the voice', () => {
    const src = source('src/components/kitchen-intake/index.tsx')
    expect(src).toMatch(/const railVoice: RailVoice = readOnly \? 'maker' : 'homeowner'/)
    const rails = src.match(/<JourneyNavRail[\s\S]*?\/>/g) ?? []
    const pills = src.match(/journeyPillLabel\(\{[\s\S]*?\}\)/g) ?? []
    expect(rails).toHaveLength(2)
    expect(pills).toHaveLength(2)
    for (const r of rails) expect(r).toContain('voice={railVoice}')
    for (const p of pills) expect(p).toContain('voice: railVoice')
    // The wrap-up's rail among them.
    expect(rails.some((r) => r.includes('journeyDone'))).toBe(true)
    expect(src.match(/<BuilderShell[\s\S]*?\n\s*\/>/)?.[0]).toContain('railVoice={railVoice}')

    const builder = source('src/components/builder/BuilderShell.tsx')
    const builderRails = builder.match(/<JourneyNavRail[\s\S]*?\/>/g) ?? []
    const builderPills = builder.match(/journeyPillLabel\(\{[\s\S]*?\}\)/g) ?? []
    expect(builderRails).toHaveLength(1)
    expect(builderPills).toHaveLength(1)
    expect(builderRails[0]).toContain('voice={railVoice}')
    expect(builderPills[0]).toContain('voice: railVoice')
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the maker’s rail', () => {
    expect(hrHR['journey.readOnly.brief']).toBe('Kupčev sažetak')
    expect(hrHR['journey.readOnly.act.space']).toBe('Kupčev prostor')
    expect(hrHR['journey.readOnly.act.build']).toBe('Gradnja')
    expect(hrHR['journey.readOnly.act.offer']).toBe('Želje i logistika')
    expect(enUS['journey.readOnly.brief']).toBe("The customer's brief")
    expect(enUS['journey.readOnly.act.space']).toBe("The customer's space")
    expect(enUS['journey.readOnly.act.build']).toBe('The build')
    expect(enUS['journey.readOnly.act.offer']).toBe('Wishes & logistics')
  })

  test('the heading matches the wrap-up’s own title for the maker', () => {
    expect(hrHR['journey.readOnly.brief']).toBe(hrHR['wrapup.readOnly.title'])
    expect(enUS['journey.readOnly.brief']).toBe(enUS['wrapup.readOnly.title'])
    expect(hrHR['journey.readOnly.act.space']).toBe(hrHR['wrapup.readOnly.section.space'])
  })

  test('no act repeats a step or a builder group under it, for either voice, in either language', () => {
    // "Završni detalji" is the builder's finishing group: as the maker's third
    // act it would read "Gradnja › … Završni detalji" then "Završni detalji".
    for (const dict of [hrHR, enUS] as Record<string, string>[]) {
      const steps = new Set(Object.keys(dict).filter((k) => /^flow\.\w+\.label$|^builder\.groups\.\w+\.label$/.test(k)).map((k) => dict[k]))
      expect(steps.size).toBeGreaterThan(10)
      for (const voice of Object.values(RAIL_COPY)) {
        for (const act of [voice.space, voice.build, voice.offer]) expect(steps).not.toContain(dict[act])
      }
    }
  })

  test('the heading and the space are different lines from the customer’s, in both languages', () => {
    for (const key of ['brief', 'space'] as const) {
      expect(hrHR[RAIL_COPY.maker[key]]).not.toBe(hrHR[RAIL_COPY.homeowner[key]])
      expect(enUS[RAIL_COPY.maker[key]]).not.toBe(enUS[RAIL_COPY.homeowner[key]])
    }
  })

  test('the last act names what it holds, the same for both', () => {
    expect(hrHR['journey.readOnly.act.offer']).toBe(hrHR['journey.act.offer'])
    expect(enUS['journey.readOnly.act.offer']).toBe(enUS['journey.act.offer'])
  })

  test('the customer’s rail', () => {
    expect(hrHR['journey.brief']).toBe('Tvoj sažetak')
    expect(hrHR['journey.act.space']).toBe('Tvoj prostor')
    expect(hrHR['journey.act.build']).toBe('Gradnja')
    expect(hrHR['journey.act.offer']).toBe('Želje i logistika')
    expect(enUS['journey.brief']).toBe('Your brief')
    expect(enUS['journey.act.space']).toBe('Your space')
    expect(enUS['journey.act.build']).toBe('Build it')
    expect(enUS['journey.act.offer']).toBe('Wishes & logistics')
  })

  test('no rail line, in either voice, is formal or calls anything a quote', () => {
    for (const voice of Object.values(RAIL_COPY)) {
      for (const key of Object.values(voice)) {
        expect(hrHR[key]).not.toMatch(/\bva[šs]/i)
        expect(hrHR[key]).not.toMatch(/ponud/i)
        expect(enUS[key]).not.toMatch(/\b(offer|quote)\b/i)
      }
    }
  })
})
