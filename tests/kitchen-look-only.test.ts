/**
 * The maker looking in at a customer who has started but not finished
 * (/kitchen/<projectId>, "Pogledaj kuhinju") got the customer's own steps:
 * "Prva AI skica tvog prostora", Natrag/Nastavi, and every control live. Seen
 * in the browser (2026-10-04, dev:mock, local stack): opening on the concept
 * step fired /api/render-concept by itself (the paid render, capped at 5 per
 * session); Nastavi on the wishlist fired /api/translate-wishlist; "Pošalji
 * dizajneru" on the contact step fired /api/summarize-brief; the sink toggle,
 * the timeline, the wishlist text and the whole builder were editable; and the
 * builder, started by the maker, priced a kitchen the customer never built.
 *
 * And the maker's browser kept its own copy of the journey (IndexedDB), which
 * wins over the server's on the next look: the kitchen home said "korak 6/8"
 * while "Pogledaj kuhinju" opened step 4 — and once the maker had clicked
 * through, the wrap-up showed the timeline the maker picked as the customer's.
 *
 * Now the maker gets one page to look at, finished or not: KitchenLookOnly,
 * built from the server's copy, in the wrap-up's maker wording, with one line
 * saying where the customer is. No steps, no controls, no AI call, and this
 * browser's copy is neither read nor written.
 *
 * Rendered statically (no DOM), like tests/wrapup-readonly.test.ts and
 * tests/journey-rail-readonly.test.ts. The effects are checked at the source.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { KitchenIntake, type KitchenIntakeProps } from '@/components/kitchen-intake'
import { KitchenLookOnly, lookOnlyView } from '@/components/kitchen-intake/LookOnly'
import { WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { OMITTED_IMAGE } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { FlowStepId } from '@/lib/flow'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'
import type { ConceptRender, LeadProfile } from '@/lib/types'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

const MAKER = 'Stolarija Horvat'
const PLAN = CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()

/** A render as the server's copy holds it: the picture stripped to a marker. */
const RENDER: ConceptRender = {
  id: 'r1',
  imageDataUrl: OMITTED_IMAGE,
  prompt: '',
  modelVersion: 'test',
  anchorPhotoIndex: 0,
  nudges: [],
  inputs: [],
  generatedAt: '2026-10-04T08:00:00.000Z',
}

/** What the customer has committed by the wishlist: the room, a chosen
 *  render, the layout locked, a style. No build, no timeline yet. */
const SO_FAR: LeadProfile = {
  floorPlan: PLAN,
  roomConfirmed: { at: 1, fingerprint: 'room' },
  contractConfirmedAt: 2,
  stylePreferences: ['modern_minimal'],
  conceptRenders: [RENDER],
  conceptRenderChosenId: RENDER.id,
}

/** A drafted wish the customer has not sent on yet. Never the maker's to see
 *  as an answer, and never the wishlist step's text box. */
const DRAFT = 'Velika ladica za lonce'

function snapshot(over: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    currentStepId: 'wishlist',
    profile: SO_FAR,
    transcript: [],
    isDone: false,
    wrapUpData: null,
    spacePhotos: [OMITTED_IMAGE, OMITTED_IMAGE],
    spaceVision: null,
    floorPlan: PLAN,
    unitEdits: null,
    inspirationStyles: ['modern_minimal'],
    inspirationRefs: [],
    inspirationVision: null,
    conceptRenders: [RENDER],
    chosenRenderId: RENDER.id,
    productReferences: [],
    siteAccess: null,
    contactDraft: { name: '', contactType: 'email', contactValue: '' },
    mustHavesText: DRAFT,
    niceToHavesText: '',
    dealBreakersText: '',
    builderHypothesis: null,
    builderStartedNoAI: false,
    ...over,
  }
}

/** Its props default to `{}` (the anonymous funnel), which createElement's
 *  overloads cannot infer through. */
const Intake: FunctionComponent<KitchenIntakeProps> = KitchenIntake

const intake = (props: Partial<KitchenIntakeProps> = {}) =>
  renderToStaticMarkup(
    createElement(Intake, { projectId: 'p1', makerName: MAKER, readOnly: true, initialSnapshot: snapshot(), ...props })
  )

/** "korak 6/8, Lista želja" as the status line words it. */
function inProgressLine(n: number, stepId: FlowStepId, dict: Record<string, string> = hrHR) {
  return dict['wrapup.readOnly.inProgress']
    .replace('{step}', dict['dashboard.step'].replace('{n}', String(n)).replace('{total}', '8'))
    .replace('{label}', dict[`flow.${stepId}.label`])
}

/** Nothing on the page edits, moves through the steps, or sends. */
function expectNothingToOperate(html: string) {
  expect(html).not.toMatch(/<(input|textarea|select)\b/)
  // The one button in the shell is the language switch, outside <main>.
  const main = html.slice(html.indexOf('<main'))
  expect(main).not.toMatch(/<button\b/)
  for (const key of ['nav.continue', 'nav.back', 'wrapup.send.cta', 'nav.skip'] as const) {
    expect(html).not.toContain(`>${hrHR[key]}<`)
  }
}

/** None of the customer's step screens. */
function expectNoSteps(html: string) {
  for (const key of [
    'funnel.space_photos.title',
    'funnel.room.title',
    'funnel.inspiration.title',
    'funnel.concept_render.title',
    'funnel.confirm_look.title',
    'funnel.builderEntry.title',
    'funnel.wishlist.title',
    'funnel.logistics.title',
    'funnel.contact.title',
  ] as const) {
    expect(html).not.toContain(hrHR[key])
  }
}

describe('the maker looking in mid-journey gets one page to look at', () => {
  test('the customer’s summary so far, in the maker’s words, and where they are', () => {
    const html = intake()
    expect(html).toContain(hrHR['wrapup.readOnly.title'])
    expect(html).toContain(hrHR['wrapup.readOnly.ledeSoFar'])
    expect(html).toContain(inProgressLine(6, 'wishlist'))
    // What the customer committed, worded for the maker.
    expect(html).toContain(hrHR['wrapup.readOnly.section.space'])
    expect(html).toContain(hrHR['floorPlan.static.roughMaker'])
    expect(html).toContain(hrHR['style.modern_minimal'])
    // Not "Ovako ga vidi kupac": mid-journey the customer sees steps, not this.
    expect(html).not.toContain(hrHR['wrapup.readOnly.lede'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.notSent'])
  })

  test('no step screens, no controls, nothing to send', () => {
    const html = intake()
    expectNoSteps(html)
    expectNothingToOperate(html)
  })

  test('the rail and the pill stand at the customer’s step, in the maker’s words', () => {
    const html = intake()
    expect(html).toContain(`aria-label="${hrHR['journey.readOnly.brief']}"`)
    expect(html).toContain(hrHR['flow.wishlist.label'])
    expect(html).toContain(hrHR['kitchen.home.readOnly.note'])
    expect(html).not.toContain(hrHR['journey.brief'])
    expect(html).not.toContain(hrHR['kitchen.makerSees'].replace('{maker}', MAKER))
  })

  test('nothing on it says "tvoj" about the customer’s things', () => {
    for (const step of ['concept_render', 'confirm_look', 'builder', 'wishlist', 'contact'] as const) {
      const html = intake({ initialSnapshot: snapshot({ currentStepId: step }) })
      expect(html).not.toMatch(/\btvo[jgm]/i)
      expect(html).not.toMatch(/\bsi podijelio\b/)
    }
  })

  test('the answers, never the drafts: a wish not yet sent on is not shown', () => {
    expect(intake()).not.toContain(DRAFT)
  })

  test('the render the server keeps no picture of: a line, not a broken image', () => {
    const html = intake()
    expect(html).toContain(hrHR['wrapup.readOnly.section.render'])
    expect(html).toContain(hrHR['wrapup.readOnly.render.notStored'])
    expect(html).not.toContain(OMITTED_IMAGE)
    expect(html).not.toMatch(/<img\b/)
  })

  test('a customer back from a sent brief, editing again: "sent — open it from your list"', () => {
    const html = intake({ currentBriefId: 'b1' })
    expect(html).toContain(hrHR['wrapup.readOnly.sent'])
    expect(html).not.toContain(inProgressLine(6, 'wishlist'))
    expectNothingToOperate(html)
  })

  test('the step is where the journey resumes, as the kitchen home says: unmeasured → the room', () => {
    const unmeasured = snapshot({
      currentStepId: 'concept_render',
      profile: { ...SO_FAR, roomConfirmed: undefined, contractConfirmedAt: undefined, floorPlan: undefined },
    })
    expect(lookOnlyView(unmeasured).stepId).toBe('room')
    expect(intake({ initialSnapshot: unmeasured })).toContain(inProgressLine(2, 'room'))
  })

  test('the builder counts as the step it follows, as on the kitchen home', () => {
    const html = intake({ initialSnapshot: snapshot({ currentStepId: 'builder' }) })
    expect(html).toContain(inProgressLine(5, 'builder'))
    expectNoSteps(html)
    // Not the builder: no live panel pricing a build, nothing to pick.
    expect(html).not.toContain(hrHR['builder.shell.bom.material'])
    expectNothingToOperate(html)
  })
})

describe('before the customer starts, and after they finish', () => {
  test('nothing saved yet: "when they start, you will see it here", the rail at the first step', () => {
    const html = intake({ initialSnapshot: null })
    expect(html).toContain(hrHR['kitchen.home.readOnly.notStarted'])
    expect(html).toContain(`${hrHR['journey.readOnly.act.space']} · ${hrHR['flow.space_photos.label']} · 1/5`)
    expectNoSteps(html)
    expectNothingToOperate(html)
  })

  test('finished: the wrap-up as before — "how the customer sees it", "not sent yet", the TL;DR', () => {
    const done = snapshot({
      currentStepId: 'contact',
      isDone: true,
      wrapUpData: { thankYouMessage: 'Hvala — tvoj sažetak je spreman.', summaryLines: ['L-kuhinja 4,2 × 3 m'] },
    })
    const html = intake({ initialSnapshot: done })
    expect(html).toContain(hrHR['wrapup.readOnly.lede'])
    expect(html).toContain(hrHR['wrapup.readOnly.notSent'])
    expect(html).toContain('L-kuhinja 4,2 × 3 m')
    expect(html).toContain(`${hrHR['journey.readOnly.act.offer']} ✓`)
    expect(html).not.toContain(hrHR['wrapup.readOnly.ledeSoFar'])
    expect(html).not.toContain('Hvala — tvoj sažetak je spreman.')
    expectNothingToOperate(html)
  })

  test('mid-journey after an earlier finish: no TL;DR of a kitchen since changed', () => {
    const reopened = snapshot({ wrapUpData: { thankYouMessage: '', summaryLines: ['Stari sažetak'] } })
    expect(intake({ initialSnapshot: reopened })).not.toContain('Stari sažetak')
  })

  test('the wrap-up words the line from `progress` alone; en-US is the same template', () => {
    const html = renderToStaticMarkup(
      createElement(WrapUpScreen, {
        data: { thankYouMessage: '', summaryLines: [] },
        profile: SO_FAR,
        explorationRefs: [],
        transcript: [],
        projectId: 'p1',
        readOnly: true,
        progress: { current: 6, total: 8, stepId: 'wishlist' },
      })
    )
    // The suite runs in hr-HR; the en-US line is the same template.
    expect(inProgressLine(6, 'wishlist', enUS)).toBe(
      'The customer is still describing the kitchen — last saved: step 6/8, Wishlist.'
    )
    expect(html).toContain(inProgressLine(6, 'wishlist'))
  })
})

describe('the customer keeps their steps', () => {
  test('the customer’s first paint is the first step, with its controls', () => {
    const html = intake({ readOnly: false, initialSnapshot: null })
    expect(html).toContain(hrHR['funnel.space_photos.title'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.title'])
  })

  test('a render the server keeps no picture of: no broken image, no maker line', () => {
    const html = renderToStaticMarkup(
      createElement(WrapUpScreen, {
        data: { thankYouMessage: '', summaryLines: [] },
        profile: SO_FAR,
        explorationRefs: [],
        transcript: [],
        projectId: 'p1',
        onFileBriefId: 'b1',
      })
    )
    expect(html).not.toContain(OMITTED_IMAGE)
    expect(html).not.toContain(hrHR['wrapup.section.render'])
    expect(html).not.toContain(hrHR['wrapup.readOnly.render.notStored'])
  })
})

describe('no call, no edit and no local copy for the maker, at the source', () => {
  const lookOnly = source('src/components/kitchen-intake/LookOnly.tsx')
  const intakeSrc = source('src/components/kitchen-intake/index.tsx')

  test('the look-only page fetches nothing and mounts no step, no builder, no form', () => {
    expect(lookOnly).not.toMatch(/fetch\(|requestSpaceVision|session-store|useProjectCheckpoint/)
    expect(lookOnly).not.toMatch(
      /ConceptRender|SpaceCapture|Inspiration|RoomStep|ConfirmToggles|LayoutConfirm|LayoutReview|BuilderShell|ContactForm|LiveBOMPanel|Textarea/
    )
    // Read-only by construction, and built from the server's copy alone.
    expect(lookOnly).toMatch(/<WrapUpScreen[\s\S]*?\breadOnly\b[\s\S]*?\/>/)
    expect(lookOnly).toMatch(/const view = lookOnlyView\(snapshot\)/)
  })

  test('the intake hands the maker the look-only page before any step or the builder', () => {
    const early = intakeSrc.indexOf('if (readOnly) {\n    return (\n      <KitchenLookOnly')
    expect(early).toBeGreaterThan(0)
    expect(intakeSrc.slice(early)).toMatch(/snapshot=\{initialSnapshot\}/)
    for (const later of ['if (isDone && wrapUpData)', '<BuilderShell', '<StepBody', '<BuilderEntryBody']) {
      expect(intakeSrc.indexOf(later)).toBeGreaterThan(early)
    }
  })

  test('this browser’s copy is neither loaded nor saved for the maker', () => {
    const load = intakeSrc.match(/useEffect\(\(\) => \{[\s\S]*?loadSnapshot<IntakeSnapshot>/)
    expect(load).not.toBeNull()
    expect(load![0]).toMatch(/if \(readOnly\) return\s+let cancelled/)
    expect(intakeSrc).toMatch(/if \(readOnly \|\| !persistenceReady\.current\) return/)
  })

  test('the hypothesis prefetch never runs for the maker either', () => {
    expect(intakeSrc).toMatch(/if \(readOnly \|\| state\.currentStepId !== 'confirm_look'\) return/)
  })
})

describe('KitchenLookOnly on its own', () => {
  test('renders the same page the intake hands the maker', () => {
    const direct = renderToStaticMarkup(
      createElement(KitchenLookOnly, { snapshot: snapshot(), projectId: 'p1', makerName: MAKER })
    )
    expect(direct).toBe(intake())
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the look-only lines', () => {
    expect(hrHR['wrapup.readOnly.ledeSoFar']).toBe('Ono što je kupac dosad unio — ti ovdje samo gledaš.')
    expect(hrHR['wrapup.readOnly.inProgress']).toBe('Kupac još opisuje kuhinju — zadnje spremljeno: {step}, {label}.')
    expect(hrHR['wrapup.readOnly.render.notStored']).toBe('Slika koncepta stiže sa sažetkom — ovdje se ne sprema.')
    expect(enUS['wrapup.readOnly.ledeSoFar']).toBe("What the customer has entered so far — you're only looking here.")
    expect(enUS['wrapup.readOnly.inProgress']).toBe(
      'The customer is still describing the kitchen — last saved: {step}, {label}.'
    )
    expect(enUS['wrapup.readOnly.render.notStored']).toBe(
      "The concept picture comes with the brief — it isn't stored here."
    )
  })

  test('different from the finished lede, in both languages', () => {
    expect(hrHR['wrapup.readOnly.ledeSoFar']).not.toBe(hrHR['wrapup.readOnly.lede'])
    expect(enUS['wrapup.readOnly.ledeSoFar']).not.toBe(enUS['wrapup.readOnly.lede'])
  })
})
