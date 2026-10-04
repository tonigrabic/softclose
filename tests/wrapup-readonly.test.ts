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
 * Rendered statically: the first paint, before any effect. The effect itself
 * is checked at the source (there is no DOM in this suite).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { WrapUpScreen } from '@/components/kitchen-intake/WrapUpScreen'
import { CONTRACT_FIXTURES } from '@/lib/builder/fixtures'
import { hydrateFromHypothesis } from '@/lib/builder/state'
import { floorPlanToLayout } from '@/lib/contract/layout-contract'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

const ROOT = join(__dirname, '..')
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/** A build on the profile, so the estimate card is past "build your kitchen". */
const BUILT = {
  builderState: hydrateFromHypothesis(null, {
    layoutContract: floorPlanToLayout(CONTRACT_FIXTURES.find((f) => f.id === 'l-shape')!.build()),
  }),
}

function wrapUp(props: { readOnly?: boolean; hasExistingBrief?: boolean; built?: boolean } = {}) {
  const { built = true, ...rest } = props
  return renderToStaticMarkup(
    createElement(WrapUpScreen, {
      data: { thankYouMessage: 'x', summaryLines: [] },
      profile: built ? BUILT : {},
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
  test('the read-only status lines', () => {
    expect(hrHR['wrapup.readOnly.notSent']).toBe('Kupac još nije poslao sažetak.')
    expect(hrHR['wrapup.readOnly.sent']).toBe('Kupac je poslao sažetak — otvori ga s popisa.')
    expect(enUS['wrapup.readOnly.notSent']).toBe("The customer hasn't sent the brief yet.")
    expect(enUS['wrapup.readOnly.sent']).toBe('The customer has sent the brief — open it from your list.')
  })
})
