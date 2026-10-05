/**
 * IMP-07: the rail on the review is a way back.
 *
 * On the wrap-up every act is done and none is current, and the rail expanded
 * only the current act — so not one step rendered, let alone one to click.
 * Steps were clickable only for builder groups while inside the builder. Now,
 * with `expandDone`, done acts show their steps, and with `onStepSelect` each
 * done step reopens: a funnel step as itself, a builder group as the builder
 * at that group. The mobile pill sheet renders this same nav node (AppShell),
 * and closes on any button in it.
 *
 * Rendered statically, and called as a function to read the click targets
 * (JourneyNavRail calls no hooks).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { JourneyNavRail, journeyPillLabel } from '@/components/JourneyNavRail'
import type { RailAct } from '@/components/JourneyRail'
import { BUILDER_GROUPS } from '@/lib/builder/inventory'
import { FLOW } from '@/lib/flow'
import { tDynamic, DEFAULT_LOCALE } from '@/lib/i18n'
import type { ReviewTarget } from '@/lib/review-nav'

type Props = Parameters<typeof JourneyNavRail>[0]
const t = (key: string) => tDynamic(key, DEFAULT_LOCALE)
const FUNNEL = FLOW.filter((s) => s.id !== 'builder')

const html = (props: Partial<Props>) =>
  renderToStaticMarkup(createElement(JourneyNavRail, { funnelStepId: 'contact', profile: {}, ...props }))
const buttons = (markup: string) => (markup.match(/<button\b/g) ?? []).length
/** The acts JourneyNavRail hands JourneyRail, with their click handlers. */
const acts = (props: Partial<Props>) =>
  (JourneyNavRail({ funnelStepId: 'contact', profile: {}, ...props }) as ReactElement<{ acts: RailAct[] }>).props.acts
const select = () => {
  const picked: ReviewTarget[] = []
  return { picked, onStepSelect: (target: ReviewTarget) => picked.push(target) }
}

describe('the review’s rail', () => {
  test('every done step is a button: 8 funnel steps and 8 builder groups', () => {
    expect(FUNNEL).toHaveLength(8)
    expect(BUILDER_GROUPS).toHaveLength(8)
    const out = html({ journeyDone: true, expandDone: true, onStepSelect: () => {} })
    expect(buttons(out)).toBe(FUNNEL.length + BUILDER_GROUPS.length)
    for (const s of FUNNEL) expect(out, s.id).toContain(t(`flow.${s.id}.label`))
    for (const g of BUILDER_GROUPS) expect(out, g.id).toContain(t(g.labelKey))
  })

  test('a funnel step reopens itself; a builder group opens the builder there', () => {
    const { picked, onStepSelect } = select()
    const steps = acts({ journeyDone: true, expandDone: true, onStepSelect }).flatMap((a) => a.steps ?? [])
    for (const s of steps) s.onSelect?.()
    expect(picked).toEqual([
      ...FUNNEL.slice(0, 5).map((s) => ({ step: s.id })),
      ...BUILDER_GROUPS.map((g) => ({ step: 'builder', group: g.id })),
      ...FUNNEL.slice(5).map((s) => ({ step: s.id })),
    ])
  })

  test('expanded but nobody may edit (no onStepSelect): the steps show, none is a button', () => {
    const out = html({ journeyDone: true, expandDone: true })
    expect(buttons(out)).toBe(0)
    expect(out).toContain(t('flow.logistics.label'))
  })

  test('without expandDone the done journey shows no step at all (the original bug)', () => {
    const out = html({ journeyDone: true, onStepSelect: () => {} })
    expect(buttons(out)).toBe(0)
    // The step's own label element: the act above it may contain the word
    // ("Logistika i kontakt" holds "Logistika").
    for (const s of FUNNEL) expect(out, s.id).not.toContain(`>${t(`flow.${s.id}.label`)}</span>`)
    // The acts themselves still show, all done.
    expect(out).toContain(t('journey.act.space'))
    expect(out).toContain(t('journey.act.offer'))
  })
})

describe('the funnel’s rail', () => {
  test('at contact: logistics (done) is a button, contact (current) is not', () => {
    const steps = acts({ onStepSelect: () => {} }).flatMap((a) => a.steps ?? [])
    expect(steps.find((s) => s.id === 'logistics')?.onSelect).toBeTypeOf('function')
    expect(steps.find((s) => s.id === 'contact')?.onSelect).toBeUndefined()
    // Collapsed done acts on the first walk: only the current act's done step.
    expect(buttons(html({ onStepSelect: () => {} }))).toBe(1)
  })

  test('editing (done acts expanded): every step before contact is a button', () => {
    const out = html({ expandDone: true, onStepSelect: () => {} })
    expect(buttons(out)).toBe(FUNNEL.length - 1 + BUILDER_GROUPS.length)
  })

  test('a step not reached yet never is', () => {
    const steps = acts({ funnelStepId: 'inspiration', expandDone: true, onStepSelect: () => {} }).flatMap(
      (a) => a.steps ?? []
    )
    const clickable = steps.filter((s) => s.onSelect).map((s) => s.id)
    expect(clickable).toEqual(['space_photos', 'room'])
  })

  test('inside the builder, groups navigate the builder; onStepSelect is not used', () => {
    const { picked, onStepSelect } = select()
    const navigated: string[] = []
    const steps = acts({
      funnelStepId: 'builder',
      builderGroupId: 'worktop',
      onBuilderNavigate: (id) => navigated.push(id),
      onStepSelect,
      expandDone: true,
    }).flatMap((a) => a.steps ?? [])
    for (const s of steps) s.onSelect?.()
    expect(picked).toEqual([])
    expect(navigated).toEqual(BUILDER_GROUPS.map((g) => g.id))
  })
})

describe('editing from the review: the journey stays done (IMP-07 review)', () => {
  // A section's "Nešto ispraviti?" on the photos reopens the first step. The
  // rail used to be positional: every later step "to do" and not a button,
  // the build and offer acts collapsed, the pill "1/5", the bar near 0 % — a
  // sent brief that looked started over, with no way on to "Popis želja".
  test('the step reopened is current; every other step is done and reopens', () => {
    const { picked, onStepSelect } = select()
    const all = acts({ funnelStepId: 'space_photos', reviewed: true, expandDone: true, onStepSelect })
    const steps = all.flatMap((a) => a.steps ?? [])
    expect(steps.filter((s) => s.status === 'current').map((s) => s.id)).toEqual(['space_photos'])
    expect(steps.filter((s) => s.status === 'todo')).toEqual([])
    for (const s of steps) s.onSelect?.()
    expect(picked).toHaveLength(FUNNEL.length - 1 + BUILDER_GROUPS.length)
    expect(picked).toContainEqual({ step: 'wishlist' })
    expect(picked).toContainEqual({ step: 'contact' })
    expect(picked).not.toContainEqual({ step: 'space_photos' })
  })

  test('the acts: the one reopened is current, the others done and open', () => {
    const all = acts({ funnelStepId: 'space_photos', reviewed: true, expandDone: true, onStepSelect: () => {} })
    expect(all.map((a) => [a.id, a.status, Boolean(a.expanded)])).toEqual([
      ['space', 'current', false],
      ['build', 'done', true],
      ['offer', 'done', true],
    ])
    // The current act counts its other steps done, not "0 of 5".
    expect(all[0].count).toEqual({ done: 4, total: 5 })
    expect(buttons(html({ funnelStepId: 'space_photos', reviewed: true, expandDone: true, onStepSelect: () => {} }))).toBe(
      FUNNEL.length - 1 + BUILDER_GROUPS.length
    )
  })

  test('inside the builder: the funnel steps show done (reached through "Natrag na pregled")', () => {
    const steps = acts({ funnelStepId: 'builder', builderGroupId: 'doors', reviewed: true }).flatMap((a) => a.steps ?? [])
    expect(steps.filter((s) => s.status === 'todo')).toEqual([])
    expect(steps.find((s) => s.id === 'doors')?.status).toBe('current')
  })

  test('the mobile pill names the step without a count', () => {
    expect(journeyPillLabel({ funnelStepId: 'space_photos', profile: {}, reviewed: true })).toBe(
      `${t('journey.act.space')} · ${t('flow.space_photos.label')}`
    )
    expect(journeyPillLabel({ funnelStepId: 'space_photos', profile: {} })).toMatch(/1\/5$/)
  })

  test('the intake and the builder keep the bar full and pass `reviewed` while editing', () => {
    const intake = readFileSync(join(__dirname, '..', 'src/components/kitchen-intake/index.tsx'), 'utf8')
    expect(intake).toMatch(/editing \? 100 : Math\.round/)
    expect(intake).toMatch(/journeyPillLabel\(\{ funnelStepId: state\.currentStepId, profile, voice: railVoice, reviewed: editing, locale \}\)/)
    expect((intake.match(/reviewed=\{editing\}/g) ?? []).length).toBe(2) // the funnel rail and BuilderShell
    const shell = readFileSync(join(__dirname, '..', 'src/components/builder/BuilderShell.tsx'), 'utf8')
    expect(shell).toMatch(/const progressPercent = reviewed \? 100 :/)
  })
})
