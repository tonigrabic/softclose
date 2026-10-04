/**
 * The maker looking in read-only (/kitchen/<projectId>, readOnly when the
 * session is not the customer's) gets the homeowner's wrap-up, and must never
 * send from it. Sending is the customer's act: /api/handoff answers anyone
 * else 404. The wrap-up used to POST on mount whenever the project had no
 * brief yet, and offered "Pošalji izmjene" whenever it had one, both to the
 * maker — two 404s, and a screen that said it was about to send.
 *
 * Now a read-only wrap-up never sends (no mount POST, no re-submit, no
 * beforeSubmit/onSent) and says where the brief got to in one calm line.
 *
 * Its header is the maker's too. The homeowner's — "Evo tvog sažetka", the
 * thank-you the interview stored ("…na putu prema izrađivaču"), "Pregledaj što
 * šaljemo — ispravi sve što ne valja" — sat right above "Kupac još nije poslao
 * sažetak", and offered a fix to someone who can only look.
 *
 * So are the sections that said "tvoj": "Tvoj koncept render", "…fotografiju
 * tvog prostora … tvoj dizajner je izvor istine", "Tvoj prostor", "Okvirna
 * skica prema onome što si podijelio — dizajner će je potvrditi" (the maker IS
 * the designer), and the sink that "you agree with your maker".
 *
 * Rendered statically: the first paint, before any effect. The effect itself
 * is checked at the source (there is no DOM in this suite).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { READ_ONLY_COPY, WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import type { ConceptRender, LeadProfile } from '@/lib/types'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/** The thank-you as the snapshot stores it: written for the homeowner, in the
 *  locale it was generated in. */
const THANK_YOU = 'Hvala — tvoj sažetak je spreman i na putu prema izrađivaču.'

const PLAN = CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()

/** A build on the profile, so the estimate card is past "build your kitchen". */
const BUILT = {
  builderState: hydrateFromHypothesis(null, {
    layoutContract: floorPlanToLayout(PLAN),
  }),
}

const RENDER: ConceptRender = {
  id: 'r1',
  imageDataUrl: 'data:image/png;base64,AAAA',
  prompt: '',
  modelVersion: 'test',
  anchorPhotoIndex: 0,
  nudges: [],
  inputs: [],
  generatedAt: '2026-10-04T08:00:00.000Z',
}

/** Everything the sections that said "tvoj" need: a chosen render, the plan,
 *  and a sink that moves to a spot nobody has drawn yet. */
const SECTIONS: LeadProfile = {
  ...BUILT,
  floorPlan: PLAN,
  conceptRenders: [RENDER],
  conceptRenderChosenId: RENDER.id,
  trades: { plumbing: { sinkPosition: 'moving' } },
}

function wrapUp(
  props: { readOnly?: boolean; hasExistingBrief?: boolean; built?: boolean; profile?: LeadProfile } = {}
) {
  const { built = true, profile, ...rest } = props
  return renderToStaticMarkup(
    createElement(WrapUpScreen, {
      data: { thankYouMessage: THANK_YOU, summaryLines: [] },
      profile: profile ?? (built ? BUILT : {}),
      explorationRefs: [],
      transcript: [],
      projectId: 'p1',
      ...rest,
    })
  )
}

/** Nothing on the page sends, or says it is about to. */
function expectNoSendControls(html: string) {
  expect(html).not.toContain(hrHR['wrapup.resubmit.title'])
  expect(html).not.toContain(hrHR['wrapup.resubmit.cta'])
  expect(html).not.toContain(hrHR['wrapup.resubmit.sending'])
  expect(html).not.toContain(hrHR['wrapup.estimate.loading'])
  expect(html).not.toContain(hrHR['wrapup.estimate.afterResend'])
  expect(html).not.toContain(hrHR['wrapup.actions.download'])
}

describe('the maker looking in never sends', () => {
  test('an unsent project: "not sent yet", nothing in flight, no send controls', () => {
    const html = wrapUp({ readOnly: true })
    expect(html).toContain(hrHR['wrapup.readOnly.notSent'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.sent'])
    expectNoSendControls(html)
    // Still a way back, worded for the maker.
    expect(html).toContain('href="/kitchen/p1"')
    expect(html).toContain(hrHR['wrapup.actions.backToKitchenMaker'])
  })

  test('a project with a brief: "sent", and no "send the changes"', () => {
    const html = wrapUp({ readOnly: true, hasExistingBrief: true })
    expect(html).toContain(hrHR['wrapup.readOnly.sent'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.notSent'])
    expectNoSendControls(html)
  })

  test('no build either: the status line, not the homeowner’s "build your kitchen"', () => {
    const html = wrapUp({ readOnly: true, built: false })
    expect(html).toContain(hrHR['wrapup.readOnly.notSent'])
    expect(html).not.toContain(hrHR['wrapup.estimate.noBuild'])
    expect(html).not.toContain(hrHR['wrapup.estimate.openBuilder'])
    expectNoSendControls(html)
  })
})

/** The homeowner's header: nothing of it reaches the maker. */
function expectNoHomeownerHeader(html: string) {
  expect(html).not.toContain(hrHR['wrapup.title'])
  expect(html).not.toContain(THANK_YOU)
  expect(html).not.toContain(hrHR['wrapup.review'])
  expect(html).not.toContain('✓')
}

describe('the header speaks to the maker looking in', () => {
  test('an unsent project: the customer’s view, to look at — and "not sent yet" right under it', () => {
    const html = wrapUp({ readOnly: true })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expect(html).toContain(hrHR['wrapup.readOnly.lede'])
    expectNoHomeownerHeader(html)
    // The header comes first, the status line under it, and they agree.
    expect(html.indexOf(hrHR['wrapup.readOnly.lede'])).toBeLessThan(html.indexOf(hrHR['wrapup.readOnly.notSent']))
  })

  test('a project with a brief: the same header', () => {
    const html = wrapUp({ readOnly: true, hasExistingBrief: true })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expect(html).toContain(hrHR['wrapup.readOnly.lede'])
    expectNoHomeownerHeader(html)
  })

  test('no build either: the same header', () => {
    const html = wrapUp({ readOnly: true, built: false })
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expectNoHomeownerHeader(html)
  })

  test('the customer keeps theirs: the check, "here’s your brief", the thank-you, "review what we’re sending"', () => {
    for (const html of [wrapUp(), wrapUp({ hasExistingBrief: true })]) {
      expect(html).toContain('✓')
      expect(html).toContain(hrHR['wrapup.title'])
      expect(html).toContain(THANK_YOU)
      expect(html).toContain(hrHR['wrapup.review'])
      expect(html).not.toContain(hrHR['wrapup.readOnly.title'])
      expect(html).not.toContain(hrHR['wrapup.readOnly.lede'])
    }
  })
})

describe('the sections speak to the maker looking in', () => {
  test('the render, its note, the space, the plan’s caption and the sink: the maker’s words', () => {
    const html = wrapUp({ readOnly: true, hasExistingBrief: true, profile: SECTIONS })
    expect(html).toContain(hrHR['wrapup.readOnly.section.render'])
    expect(html).toContain(`alt="${hrHR['wrapup.readOnly.section.render']}"`)
    expect(html).toContain(hrHR['wrapup.readOnly.render.note'])
    expect(html).toContain(hrHR['wrapup.readOnly.section.space'])
    expect(html).toContain(hrHR['floorPlan.static.roughMaker'])
    expect(html).toContain(hrHR['wrapup.readOnly.trades.movesOpen'])

    expect(html).not.toContain(hrHR['wrapup.section.render'])
    expect(html).not.toContain(hrHR['wrapup.render.note'])
    expect(html).not.toContain(hrHR['wrapup.section.space'])
    expect(html).not.toContain(hrHR['floorPlan.static.rough'])
    expect(html).not.toContain(hrHR['wrapup.trades.movesOpen'])
  })

  test('a customer who chose not to measure: the maker takes the measurements', () => {
    const profile = { ...SECTIONS, floorPlan: { ...PLAN, measurementMethod: 'deferred_to_designer' as const } }
    const html = wrapUp({ readOnly: true, profile })
    expect(html).toContain(hrHR['floorPlan.static.deferredMaker'])
    expect(html).not.toContain(hrHR['floorPlan.static.deferred'])
  })

  test('nothing on the maker’s wrap-up says "tvoj" about the customer’s things', () => {
    for (const hasExistingBrief of [false, true]) {
      const html = wrapUp({ readOnly: true, hasExistingBrief, profile: SECTIONS })
      expect(html).not.toMatch(/\btvo[jgm]/i)
      expect(html).not.toMatch(/\bsi podijelio\b/)
    }
  })

  test('the customer keeps theirs: "Tvoj koncept render", "Tvoj prostor", "što si podijelio"', () => {
    const html = wrapUp({ hasExistingBrief: true, profile: SECTIONS })
    expect(html).toContain(hrHR['wrapup.section.render'])
    expect(html).toContain(hrHR['wrapup.render.note'])
    expect(html).toContain(hrHR['wrapup.section.space'])
    expect(html).toContain(hrHR['floorPlan.static.rough'])
    expect(html).toContain(hrHR['wrapup.trades.movesOpen'])
    for (const makerKey of Object.values(READ_ONLY_COPY)) expect(html).not.toContain(hrHR[makerKey])
    expect(html).not.toContain(hrHR['floorPlan.static.roughMaker'])
  })

  test('every rewording is a different line, in both languages', () => {
    for (const [homeowner, maker] of Object.entries(READ_ONLY_COPY)) {
      expect(hrHR[maker]).not.toBe(hrHR[homeowner as keyof typeof READ_ONLY_COPY])
      expect(enUS[maker]).not.toBe(enUS[homeowner as keyof typeof READ_ONLY_COPY])
    }
  })
})

describe('the customer still sends', () => {
  test('first arrival: the brief is on its way (the mount sends it)', () => {
    const html = wrapUp()
    expect(html).toContain(hrHR['wrapup.estimate.loading'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.notSent'])
  })

  test('a revisit with a brief out: "send the changes" is offered', () => {
    const html = wrapUp({ hasExistingBrief: true })
    expect(html).toContain(hrHR['wrapup.resubmit.cta'])
    expect(html).toContain(hrHR['wrapup.estimate.afterResend'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.sent'])
  })
})

describe('no send for the maker, at the source', () => {
  const src = source('src/components/kitchen-intake/WrapUpScreen.tsx')

  test('the mount effect returns before sending when read-only', () => {
    const effect = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\)/)
    expect(effect).not.toBeNull()
    const [body, deps] = [effect![0], effect![1]]
    expect(body).toMatch(/if \(readOnly \|\| hasExistingBrief\) return\s+void loadBundle\(\)/)
    expect(deps).toContain('readOnly')
  })

  test('loadBundle itself refuses when read-only, so retry and re-submit cannot reach the POST', () => {
    expect(src).toMatch(
      /const loadBundle = useCallback\(async \(\) => \{[^}]*?if \(readOnly \|\| inflight\.current\) return[\s\S]*?fetch\('\/api\/handoff'/
    )
    // The one POST in the file is the one loadBundle guards.
    expect(src.match(/fetch\(/g)).toHaveLength(1)
  })

  test('nothing is "loading" on a read-only first paint', () => {
    expect(src).toMatch(/useState\(!readOnly && !hasExistingBrief\)/)
  })

  test('the intake hands the maker no beforeSubmit and no onSent', () => {
    const intake = source('src/components/kitchen-intake/index.tsx')
    const mount = intake.match(/<WrapUpScreen[\s\S]*?\/>/)
    expect(mount).not.toBeNull()
    expect(mount![0]).toMatch(/beforeSubmit=\{\s*readOnly\s*\?\s*undefined/)
    expect(mount![0]).toMatch(/onSent=\{readOnly \? undefined/)
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the read-only header', () => {
    expect(hrHR['wrapup.readOnly.title']).toBe('Kupčev sažetak')
    expect(hrHR['wrapup.readOnly.lede']).toBe('Ovako ga vidi kupac — ti ga ovdje samo gledaš.')
    expect(enUS['wrapup.readOnly.title']).toBe("The customer's brief")
    expect(enUS['wrapup.readOnly.lede']).toBe("This is how the customer sees it — you're only looking here.")
  })

  test('the read-only sections', () => {
    expect(hrHR['wrapup.readOnly.section.render']).toBe('Koncept koji je kupac odabrao')
    expect(hrHR['wrapup.readOnly.render.note']).toBe(
      'AI koncept usidren na fotografiju kupčeva prostora. Smjer koji kupac želi, ne obvezujuća specifikacija.'
    )
    expect(hrHR['wrapup.readOnly.section.space']).toBe('Kupčev prostor')
    expect(hrHR['wrapup.readOnly.trades.movesOpen']).toBe('seli se — mjesto dogovaraš s kupcem')
    expect(hrHR['floorPlan.static.roughMaker']).toBe(
      'Okvirna skica prema onome što je kupac podijelio — mjere potvrđuješ na licu mjesta.'
    )
    expect(hrHR['floorPlan.static.deferredMaker']).toBe('Kupac je odlučio ne mjeriti — mjere uzimaš na licu mjesta.')
    expect(enUS['wrapup.readOnly.section.render']).toBe('The concept the customer chose')
    expect(enUS['wrapup.readOnly.render.note']).toBe(
      "AI concept anchored to a photo of the customer's space. The direction they want, not a binding spec."
    )
    expect(enUS['wrapup.readOnly.section.space']).toBe("The customer's space")
    expect(enUS['wrapup.readOnly.trades.movesOpen']).toBe('moves — you agree the spot with the customer')
    expect(enUS['floorPlan.static.roughMaker']).toBe(
      'Rough schematic from what the customer shared — you confirm the dimensions on site.'
    )
    expect(enUS['floorPlan.static.deferredMaker']).toBe(
      'The customer chose not to measure — you take the dimensions on site.'
    )
  })

  test('the read-only status lines', () => {
    expect(hrHR['wrapup.readOnly.notSent']).toBe('Kupac još nije poslao sažetak.')
    expect(hrHR['wrapup.readOnly.sent']).toBe('Kupac je poslao sažetak — otvori ga s popisa.')
    expect(enUS['wrapup.readOnly.notSent']).toBe("The customer hasn't sent the brief yet.")
    expect(enUS['wrapup.readOnly.sent']).toBe('The customer has sent the brief — open it from your list.')
  })
})
