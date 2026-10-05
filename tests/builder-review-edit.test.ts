/**
 * The builder while editing from the review (IMP-07 review).
 *
 *  - Busy: "Natrag na pregled" (or Continue on the last group) builds the
 *    review with an AI summary call that takes seconds. The builder stayed
 *    mounted and fully live, with no sign of work: the button looked dead,
 *    and a pick made meanwhile reached the profile after the review had
 *    printed the one before it — the brief then went out under a print that
 *    was not its own, and the next visit offered it again as "changes".
 *    Now the screen, the re-render and the footer hold still and Continue
 *    says "Radim…" until the review is there.
 *  - A build that does not exist yet opens at the first group: a review fix
 *    or a rail click on "Rasvjeta" used to open a fresh build there, on
 *    defaults nobody saw, with "Natrag na pregled" offered from that screen.
 *
 * Rendered statically (node, no DOM).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { BuilderShell } from '@/components/builder/BuilderShell'
import { GROUP_MODULES } from '@/components/builder/groups/registry'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hrHR } from '@/lib/i18n/locales/hr-HR'

type Props = Parameters<typeof BuilderShell>[0]

const LAYOUT = floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build())
const SAVED = hydrateFromHypothesis(null, { layoutContract: LAYOUT })

const shell = (props: Partial<Props>) =>
  renderToStaticMarkup(
    createElement(BuilderShell, {
      hypothesis: null,
      layoutContract: LAYOUT,
      layoutPreconfirmed: true,
      ...props,
    })
  )

const BACK_TO_REVIEW = hrHR['nav.backToReview']
const WORKING = hrHR['nav.working']
/** The button whose own text is `label`. */
const button = (html: string, label: string) =>
  (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).find((b) => b.replace(/<[^>]+>/g, '').trim() === label)
const why = (group: string) => hrHR[`builder.groups.${group}.why` as keyof typeof hrHR]

describe('while the review is being built, the build holds still', () => {
  test('busy: the footer is disabled and says it is working; the screen and the right rail sit in disabled fieldsets', () => {
    const html = shell({ savedState: SAVED, initialGroupId: 'worktop', onBackToReview: () => {}, busy: true })
    expect(html).toContain(WORKING)
    expect(html).not.toContain(hrHR['builder.shell.continue'])
    // Every footer button is disabled: Back, "Natrag na pregled", Continue.
    for (const label of [hrHR['builder.shell.back'], BACK_TO_REVIEW, WORKING]) {
      expect(button(html, label), label).toMatch(/^<button[^>]*disabled=""/)
    }
    // The screen, and in the rail the re-render offer (above the render) and
    // the carousel (below it).
    expect((html.match(/<fieldset[^>]*disabled=""/g) ?? []).length).toBe(3)
    expect(html).toContain('data-builder-busy="true"')
  })

  test('not busy: live as ever', () => {
    const html = shell({ savedState: SAVED, initialGroupId: 'worktop', onBackToReview: () => {} })
    expect(html).not.toContain(WORKING)
    expect(html).toContain(hrHR['builder.shell.continue'])
    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/)
  })
})

describe('a build that does not exist yet starts at the first group', () => {
  test('no saved build: the group asked for is ignored — Korpusi ormarića, not Rasvjeta', () => {
    const html = shell({ initialGroupId: 'lighting' })
    expect(html).toContain(why('cabinetBoxes'))
    expect(html).not.toContain(why('lighting'))
  })

  test('a saved build resumes at its group (IMP-06)', () => {
    const html = shell({ savedState: SAVED, initialGroupId: 'lighting' })
    expect(html).toContain(why('lighting'))
  })

  test('"Natrag na pregled" only once there is a build to go back with', () => {
    expect(shell({ onBackToReview: () => {} })).not.toContain(BACK_TO_REVIEW)
    expect(shell({ savedState: SAVED, onBackToReview: () => {} })).toContain(BACK_TO_REVIEW)
  })
})

/**
 * Round 2 of the IMP-07 review: a review without a range offers "Sastavi
 * kuhinju", and the build it starts was opened with `reviewed` — every other
 * group done with a read-back of defaults nobody chose, the bar at 100 % on
 * the first group. The review never covered that build: it is walked as on
 * the first walk.
 */
describe('a build started from the review is walked, not shown as done', () => {
  /** Read-backs of groups the homeowner has not reached, from the defaults. */
  const UNSEEN = (['worktop', 'finishing'] as const).map((g) => GROUP_MODULES[g].readback(SAVED, 'hr-HR')!)
  const progress = (html: string) => Number(html.match(/role="progressbar" aria-valuenow="(\d+)"/)?.[1])

  test('no saved build: positional rail and bar, no read-backs of unseen defaults', () => {
    const html = shell({ reviewed: true, onBackToReview: () => {} })
    expect(progress(html)).toBeLessThan(100)
    for (const readback of UNSEEN) expect(html).not.toContain(readback)
  })

  test('a saved build being edited from its review: every step done, the bar full', () => {
    const html = shell({ reviewed: true, savedState: SAVED, initialGroupId: 'doors', onBackToReview: () => {} })
    expect(progress(html)).toBe(100)
    for (const readback of UNSEEN) expect(html).toContain(readback)
  })

  test('decided on mount: the first save of a new build does not make it "reviewed"', () => {
    const shellSource = readFileSync(join(__dirname, '..', 'src/components/builder/BuilderShell.tsx'), 'utf8')
    expect(shellSource).toMatch(/const \[newBuild\] = useState\(\(\) => !savedState\)/)
    expect(shellSource).toMatch(/reviewed=\{reviewed && !newBuild\}/)
  })
})

describe('the intake wires it', () => {
  test('the builder is busy while the review is built, and told when the review has been reached', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    const mount = intake.match(/<BuilderShell[\s\S]*?\n {6}\/>/)![0]
    expect(mount).toMatch(/busy=\{isFinalising\}/)
    expect(mount).toMatch(/reviewed=\{editing\}/)
  })
})
