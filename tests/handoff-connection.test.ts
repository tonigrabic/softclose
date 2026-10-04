/**
 * Funnel → builder → maker connection (LOOP.md B2).
 *
 * The journey's two handoff seams, exercised for real:
 *  1. Builder entry: contract from the Part-1 plan + null hypothesis must
 *     hydrate a working state (the calm "start without AI" path).
 *  2. Maker handoff: buildHandoffBundle prices the range from the homeowner's
 *     real build (BOM totals, band ≤ ±20%) and from nothing else. A skipped
 *     builder yields no range at all — never a number made of no inputs.
 *     Targets the pure builder rather than the route: the route now reads a
 *     session, which vitest cannot provide, and the estimate logic — the part
 *     worth guarding — lives in the pure function either way.
 *
 * What this deliberately does NOT cover: the live browser walk (vision
 * quality, hypothesis content with real API keys). That stays a manual check
 * — see WORKLOG for the click-path.
 */
import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { computeBom } from '@/lib/builder/bom'

function builderStateFromFixture(id: string) {
  const fixture = CONTRACT_FIXTURES.find((f) => f.id === id)
  if (!fixture) throw new Error(`unknown fixture ${id}`)
  const contract = floorPlanToLayout(fixture.build())
  const s = hydrateFromHypothesis(null, { layoutContract: contract })
  // Maker supplies the goods, so the all-in "with appliances" figure exists.
  return {
    ...s,
    appliances: { ...s.appliances, supply: 'maker_supplies' as const },
    sinkTaps: { ...s.sinkTaps, supply: 'maker_supplies' as const },
  }
}


describe('maker handoff — estimate comes from the real build', () => {
  test('brief WITH builderState: estimate is the BOM', () => {
    const builderState = builderStateFromFixture('l-shape')
    const bom = computeBom(builderState)

    const bundle = buildHandoffBundle({ brief: { builderState } })

    // Headline is kitchen-only (works); the all-in figure rides in withAppliances.
    expect(bundle.estimate!.low).toBe(bom.sections.works.low)
    expect(bundle.estimate!.high).toBe(bom.sections.works.high)
    expect(bundle.estimate!.withAppliances).toEqual({ low: bom.total.low, high: bom.total.high })
    // The promise survives the handoff seam too.
    expect(bundle.estimate!.bandPct).toBeLessThanOrEqual(20)
  })

  test('the brief carries the build line by line, and the lines add up to its ranges', () => {
    const builderState = builderStateFromFixture('l-shape')
    const { estimate } = buildHandoffBundle({ brief: { builderState } })
    const lines = estimate!.lines!

    // The maker sees what the range is made of, not just the range.
    expect(lines.map((l) => l.key)).toEqual(expect.arrayContaining(['fronts', 'boards', 'worktop']))
    expect(lines.every((l) => l.detail.length > 0)).toBe(true)

    const sum = (section: string, side: 'low' | 'high') =>
      lines.filter((l) => l.section === section).reduce((n, l) => n + l[side], 0)
    expect(sum('works', 'low')).toBeCloseTo(estimate!.low, 0)
    expect(sum('works', 'high')).toBeCloseTo(estimate!.high, 0)
    expect(sum('works', 'low') + sum('goods', 'low')).toBeCloseTo(estimate!.withAppliances!.low, 0)
  })

  // IMP-01. Skipping the builder used to fall back to a USD scope-count table
  // whose inputs no step sets any more, so it always said 12,000 ±20% —
  // 9,600–14,400 € — on the wrap-up, the kitchen home, the dashboard and the
  // maker's email subject. No build, no range.
  test('brief WITHOUT builderState: no estimate at all', () => {
    expect(buildHandoffBundle({ brief: {} }).estimate).toBeNull()
    // Whatever else the journey holds — a scope, a stray old budget band from a
    // saved snapshot — none of it is a price.
    const legacy = { scope: { cabinets: true, installation: true }, budgetRange: '15k_30k' }
    expect(buildHandoffBundle({ brief: legacy as never }).estimate).toBeNull()
  })
})

describe('no currency stand-ins in the source', () => {
  // The stub was a table of USD midpoints shown with a € sign. Every price in
  // the product is euros from a dated source; a USD constant means a made-up one.
  test('no USD constant anywhere in src/', () => {
    const src = resolve(__dirname, '..', 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full)
      }
    }
    walk(src)
    const offenders = files.filter((f) => /\bUSD\b|_USD\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
