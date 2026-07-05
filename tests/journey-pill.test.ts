/**
 * The mobile progress pill mirrors the journey rail's linear model — funnel
 * steps, the builder step expanded into its component groups, acts as the
 * grouping. These pin the composition logic (act · label · pos/total), using
 * tDynamic for the copy so translation changes don't break the tests.
 */
import { describe, expect, test } from 'vitest'
import { journeyPillLabel } from '@/components/JourneyNavRail'
import { BUILDER_GROUPS } from '@/lib/builder/inventory'
import { tDynamic, DEFAULT_LOCALE } from '@/lib/i18n'

const t = (key: string) => tDynamic(key, DEFAULT_LOCALE)

describe('journeyPillLabel', () => {
  test('funnel step: act · step label · pos/total within the act', () => {
    const label = journeyPillLabel({ funnelStepId: 'space_photos', profile: {} })
    // Act 1 = space_photos + inspiration + concept_render + confirm_look.
    expect(label).toBe(`${t('journey.act.space')} · ${t('flow.space_photos.label')} · 1/4`)
  })

  test('act heading and step label are no longer identical (the "Vaš prostor · Vaš prostor" fix)', () => {
    expect(t('flow.space_photos.label')).not.toBe(t('journey.act.space'))
  })

  test('builder group: build act with groups + scope + wishlist as the total', () => {
    const label = journeyPillLabel({
      funnelStepId: 'builder',
      profile: {},
      builderGroupId: 'worktop',
    })
    const pos = BUILDER_GROUPS.findIndex((g) => g.id === 'worktop') + 1
    const total = BUILDER_GROUPS.length + 2 // + scope + wishlist
    expect(label).toBe(`${t('journey.act.build')} · ${t('builder.groups.worktop.label')} · ${pos}/${total}`)
  })

  test('journey done collapses to the offer act check', () => {
    expect(journeyPillLabel({ funnelStepId: 'contact', profile: {}, journeyDone: true })).toBe(
      `${t('journey.act.offer')} ✓`
    )
  })
})
