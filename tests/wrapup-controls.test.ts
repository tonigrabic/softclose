/**
 * IMP-05: the wrap-up is the homeowner's screen, and it offers nothing of the
 * maker's. It used to end with "Otvori pogled izrađivača" (a /maker/<id> link,
 * a 404 for a customer) and "Demo: pogledaj što vidi izrađivač", which rendered
 * the maker's dashboard, B2B cost box included, right inside the funnel.
 *
 * Now, in project mode, the one way on is back to the kitchen home
 * (/kitchen/<projectId>), which says where the brief got to. The maker looking
 * in read-only gets the same screen with the link worded for them. The
 * anonymous funnel (no project) has no kitchen home and gets no link. The demo
 * lives in the /builder harness only.
 *
 * Rendered statically: no effect runs, so nothing is sent; the actions block
 * renders regardless of the bundle.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(e.name) ? [full] : []
  })
}

function wrapUp(props: { projectId?: string; readOnly?: boolean } = {}) {
  return renderToStaticMarkup(
    createElement(WrapUpScreen, {
      data: { thankYouMessage: 'x', summaryLines: [] },
      profile: {},
      explorationRefs: [],
      transcript: [],
      ...props,
    })
  )
}

/** Nothing on the page reaches into the maker's side or shows their view. */
function expectNoMakerControls(html: string) {
  expect(html).not.toContain('/maker/')
  expect(html).not.toContain('Demo')
  expect(html).not.toContain(hrHR['maker.demo.banner'])
  expect(html).not.toContain(hrHR['maker.estimate.makerCost'])
}

describe('the wrap-up’s way on', () => {
  test('the homeowner: back to my kitchen, and no maker link or demo', () => {
    const html = wrapUp({ projectId: 'p1' })
    expect(html).toContain('href="/kitchen/p1"')
    expect(html).toContain(hrHR['wrapup.actions.backToKitchen'])
    expect(html).not.toContain(hrHR['wrapup.actions.backToKitchenMaker'])
    expectNoMakerControls(html)
  })

  test('the maker looking in: back to the customer’s kitchen, still no maker control', () => {
    const html = wrapUp({ projectId: 'p1', readOnly: true })
    expect(html).toContain('href="/kitchen/p1"')
    expect(html).toContain(hrHR['wrapup.actions.backToKitchenMaker'])
    expect(html).not.toContain('moju')
    expectNoMakerControls(html)
  })

  test('the anonymous funnel (no project): no kitchen link, no maker link', () => {
    const html = wrapUp()
    expect(html).not.toContain('/kitchen/')
    expect(html).not.toContain(hrHR['wrapup.actions.backToKitchen'])
    expectNoMakerControls(html)
  })

  test('the back link is a full page load, not next/link (same URL as KitchenHome’s entered state)', () => {
    const src = source('src/components/kitchen-intake/WrapUpScreen.tsx')
    expect(src).not.toMatch(/from ['"]next\/link['"]/)
    expect(src).toMatch(/<a\s+href=\{`\/kitchen\/\$\{projectId\}`\}/)
  })
})

describe('no maker view in the homeowner’s wrap-up, at the source', () => {
  test('WrapUpScreen mounts no maker dashboard and links nowhere on the maker side', () => {
    const src = source('src/components/kitchen-intake/WrapUpScreen.tsx')
    for (const needle of ['MakerDashboardPreview', 'makerPath', '/maker/', 'makerDemo', 'openMaker']) {
      expect(src, needle).not.toContain(needle)
    }
  })

  test('the maker dashboard is mounted only by the maker’s own pages and the /builder harness demo', () => {
    const mounts = sourceFiles(join(ROOT, 'src'))
      .filter((f) => !f.endsWith('MakerDashboardPreview.tsx'))
      .filter((f) => /from ['"][^'"]*MakerDashboardPreview['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .sort()
    expect(mounts).toEqual([
      'src/app/builder/harness.tsx',
      'src/app/dashboard/project/[id]/LiveProjectView.tsx',
      'src/app/maker/[id]/MakerBriefView.tsx',
    ])
  })

  test('the intake hands the maker’s read-only flag to the wrap-up', () => {
    expect(source('src/components/kitchen-intake/index.tsx')).toMatch(/<WrapUpScreen[\s\S]*?readOnly=\{readOnly\}/)
  })
})

describe('the copy, hr-HR first, en-US the same keys', () => {
  test('the maker controls’ keys are gone from both locales', () => {
    for (const dict of [hrHR, enUS] as Record<string, string>[]) {
      expect(dict).not.toHaveProperty('wrapup.actions.makerDemo')
      expect(dict).not.toHaveProperty('wrapup.actions.openMaker')
    }
  })

  test('the back links', () => {
    expect(hrHR['wrapup.actions.backToKitchen']).toBe('Natrag na moju kuhinju')
    expect(hrHR['wrapup.actions.backToKitchenMaker']).toBe('Natrag na kuhinju kupca')
    expect(enUS['wrapup.actions.backToKitchen']).toBe('Back to my kitchen')
    expect(enUS['wrapup.actions.backToKitchenMaker']).toBe("Back to the customer's kitchen")
  })
})
