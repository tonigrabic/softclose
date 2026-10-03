/**
 * The homeowner sees what they will pay, and nothing about how it was priced
 * (IMP-04, Decision 2026-10-03). PDV and the workshop margin are inside every
 * figure, so no homeowner surface has a VAT line, a margin line, a cost-price
 * line or an "all included" label that the assumptions contradict; and the
 * range is never called a quote ("ponuda"): the maker sends that.
 *
 * Guarded statically, from the source of the components that put a range in
 * front of the homeowner: every locale key they can render, in both languages.
 * Keys are read two ways: any quoted string that is a locale key (covers
 * `t('…')` and key tables like DECISION_COPY), and the static prefix of a
 * template key (`bom.lineItem.${key}` → every `bom.lineItem.*`).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

type Key = keyof typeof hrHR

const ROOT = join(__dirname, '..')
const HOMEOWNER_COMPONENTS = {
  RangeLine: 'src/components/range/RangeLine.tsx',
  LiveBOMPanel: 'src/components/builder/LiveBOMPanel.tsx',
  MobileRangeDock: 'src/components/builder/MobileRangeDock.tsx',
  WrapUpScreen: 'src/components/kitchen-intake/WrapUpScreen.tsx',
  KitchenHome: 'src/app/kitchen/[projectId]/KitchenHome.tsx',
} as const

const ALL_KEYS = Object.keys(hrHR) as Key[]
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

function keysUsedIn(file: string): Set<Key> {
  const src = source(file)
  const used = new Set<Key>()
  for (const m of src.matchAll(/['"]([A-Za-z][\w-]*(?:\.[\w-]+)+)['"]/g)) {
    if (m[1] in hrHR) used.add(m[1] as Key)
  }
  for (const m of src.matchAll(/`([A-Za-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g)) {
    for (const k of ALL_KEYS) if (k.startsWith(m[1])) used.add(k)
  }
  // RangeLine prints the assumptions through range.ts's `assumptionKey`.
  if (file === HOMEOWNER_COMPONENTS.RangeLine) {
    for (const k of ALL_KEYS) if (k.startsWith('range.')) used.add(k)
  }
  return used
}

/** How a price basis leaks into copy: VAT / PDV, margin / marža, cost price
 *  (nabavna cijena), B2B, and "all included" over a range that excludes things. */
const PRICE_BASIS = /PDV|\bVAT\b|marž|margin|nabavn|B2B|Sve uključeno|all-in/i

describe('homeowner copy says what they pay, not how it was priced', () => {
  test('the scan finds each component’s keys (a broken scan must not pass silently)', () => {
    const expected: Record<keyof typeof HOMEOWNER_COMPONENTS, Key> = {
      RangeLine: 'range.confirms.homeowner',
      LiveBOMPanel: 'builder.shell.bom.works',
      MobileRangeDock: 'builder.shell.bom.title',
      WrapUpScreen: 'wrapup.estimate.allInLabel',
      KitchenHome: 'kitchen.home.status.rangeLabel',
    }
    for (const [name, file] of Object.entries(HOMEOWNER_COMPONENTS)) {
      expect(keysUsedIn(file).has(expected[name as keyof typeof HOMEOWNER_COMPONENTS]), name).toBe(true)
    }
  })

  test.each(Object.entries(HOMEOWNER_COMPONENTS))('%s: no VAT, margin, cost-price or "all included" copy', (_, file) => {
    const offending = [...keysUsedIn(file)].flatMap((k) =>
      [hrHR[k], enUS[k]].filter((v) => PRICE_BASIS.test(v)).map((v) => `${k}: ${v}`)
    )
    expect(offending).toEqual([])
  })

  test('the range is never called a quote', () => {
    const offending = ALL_KEYS.filter((k) => k.startsWith('range.')).flatMap((k) =>
      [hrHR[k], enUS[k]].filter((v) => /ponud|\bquote/i.test(v)).map((v) => `${k}: ${v}`)
    )
    expect(offending).toEqual([])
  })

  test('the wrap-up labels the figure with appliances as what it is', () => {
    expect(hrHR['wrapup.estimate.allInLabel']).toBe('Kuhinja s uređajima')
    expect(enUS['wrapup.estimate.allInLabel']).toBe('Kitchen with appliances')
  })
})

describe('homeowner components never read the maker-only money', () => {
  test.each(Object.entries(HOMEOWNER_COMPONENTS))('%s reads no estimate.maker, makerCost or makerOnly', (_, file) => {
    // `.maker` as a property (estimate.maker), not makerName / makerPath.
    expect(source(file)).not.toMatch(/\.maker(?![\w'"`-])|\bmakerCost\b|\bmakerOnly\b/)
  })
})
