/**
 * IMP-09 Done-when: the AI disclosure renders on the kitchen home on first
 * load, the photo step says where photos go and links the notice, and the
 * privacy notice is reachable from every shell.
 *
 * EU AI Act Art. 50 has applied since August 2026: someone interacting with
 * an AI system must be told so, at the start. Before this, the only AI label
 * in the app was the render badge — the kitchen home, the invite and the
 * photo step never said an AI reads anything, and there was no privacy page.
 *
 * The notice copy is checked for the processors the code actually calls and
 * for what it must NOT show: an operator address that is not configured.
 */
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { KitchenHome, type KitchenHomeProps } from '@/app/kitchen/[projectId]/KitchenHome'
import { SpaceCapture } from '@/components/kitchen-intake/SpaceCapture'
import { AuthShell } from '@/components/AuthShell'
import { AppShell } from '@/components/AppShell'
import { PrivacyNotice } from '@/app/privatnost/PrivacyNotice'
import { SchachermayerBrowse } from '@/components/builder/SchachermayerBrowse'
import { appliancesForType, sinksFromCatalog, tapsFromCatalog } from '@/lib/catalog/hardware'
import PrivacyPage from '@/app/privatnost/page'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { hrHR } from '@/lib/i18n/locales/hr-HR'
import { enUS } from '@/lib/i18n/locales/en-US'

/** Visible text, tags dropped and entities decoded enough to read sentences. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const AI_LINE = 'Kroz korake te vodi AI asistent. Stolarija Horvat osobno pregledava sve što podijeliš.'
/** The maker looking in: the same disclosure, worded for them, never their own name. */
const READ_ONLY_AI_LINE = 'Kupca kroz korake vodi AI asistent. Sve što podijeli pregledavaš ti.'

const home = (props: Partial<KitchenHomeProps> = {}) =>
  renderToStaticMarkup(
    createElement(KitchenHome, {
      projectId: '55555555-5555-4555-8555-555555555555',
      makerName: 'Stolarija Horvat',
      stepLabel: null,
      submittedAt: null,
      makerViewedAt: null,
      briefId: null,
      range: null,
      savedEstimate: null,
      decision: null,
      closed: false,
      started: false,
      revision: 0,
      readOnly: false,
      snapshot: null,
      customerEmail: 'ana@example.test',
      customerName: 'Ana',
      ...props,
    })
  )

const noop = () => {}

describe('the kitchen home says an AI assistant leads, and the maker reviews', () => {
  test('on first load — before they start, no brief, no range', () => {
    const html = home()
    expect(text(html)).toContain(AI_LINE)
    expect(html).toContain('data-ai-disclosure')
    // Under the title, before the walkthrough and the start button.
    expect(html.indexOf('data-ai-disclosure')).toBeLessThan(html.indexOf(hrHR['kitchen.home.what']))
    expect(html.indexOf('data-ai-disclosure')).toBeLessThan(html.indexOf(hrHR['kitchen.home.cta.start']))
  })

  test.each<[string, Partial<KitchenHomeProps>]>([
    ['in progress', { started: true, stepLabel: 'korak 3/8' }],
    ['sent', { submittedAt: '3. 10. 2026.', briefId: 'b1', started: true }],
    [
      'ready to send',
      {
        started: true,
        snapshot: {
          isDone: true,
          wrapUpData: { thankYouMessage: 'Hvala', summaryLines: [], briefId: 'b1' },
        } as unknown as ProjectSnapshot,
      },
    ],
    ['closed', { closed: true, submittedAt: '3. 10. 2026.', briefId: 'b1', started: true }],
  ])('and in every later state: %s', (_label, props) => {
    expect(text(home(props))).toContain(AI_LINE)
  })

  test('the maker looking in: the disclosure worded for them, never their own name', () => {
    const out = text(home({ readOnly: true }))
    expect(out).toContain(READ_ONLY_AI_LINE)
    expect(out).not.toContain(AI_LINE)
    expect(out).not.toContain('Stolarija Horvat')
  })

  test('without a maker name the sentence still starts with a capital', () => {
    expect(text(home({ makerName: null }))).toContain('Tvoj izrađivač osobno pregledava sve što podijeliš.')
  })
})

describe('the photo step says where photos go, before they go', () => {
  test('a calm line under the drop zone, linking the notice in a new tab', () => {
    const html = renderToStaticMarkup(
      createElement(SpaceCapture, {
        photos: [],
        onPhotosChange: noop,
        visionResult: null,
        onVisionResult: noop,
        onSkip: noop,
        captureOnly: true,
      })
    )
    expect(text(html)).toContain(hrHR['space.processingNote'])
    expect(html).toMatch(/data-photo-notice[^>]*>[\s\S]*?<a href="\/privatnost" target="_blank" rel="noopener noreferrer"/)
    // It names who reads them: an AI assistant, and which one.
    expect(hrHR['space.processingNote']).toContain('AI asistent (OpenAI)')
  })
})

describe('the notice is one click away from every shell', () => {
  test('AuthShell (sign-in, kitchen home, maker screens) has a footer link', () => {
    const html = renderToStaticMarkup(createElement(AuthShell, null, createElement('p', null, 'x')))
    expect(html).toMatch(/<footer[\s\S]*href="\/privatnost"[\s\S]*<\/footer>/)
    expect(html).toContain(`>${hrHR['legal.privacy']}<`)
    // Outside the journey, a plain link: no new tab.
    expect(html).not.toContain('target="_blank"')
  })

  test('AppShell (the intake and builder rail) has it once, opening beside the journey', () => {
    // A props object rather than a third argument: AppShell types `children`
    // as a required prop, which createElement's overloads do not see.
    const props: ComponentProps<typeof AppShell> = {
      progressPercent: 10,
      nav: createElement('div', null, 'nav'),
      children: 'body',
    }
    const html = renderToStaticMarkup(createElement(AppShell, props))
    const links = [...html.matchAll(/<a href="\/privatnost"[^>]*>/g)].map((m) => m[0])
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('target="_blank"')
    expect(links[0]).toContain('rel="noopener noreferrer"')
  })
})

describe('the privacy notice', () => {
  const notice = (contactEmail: string | null) =>
    renderToStaticMarkup(createElement(PrivacyNotice, { contactEmail }))

  test('is marked as the current notice and names every processor the code calls', () => {
    const out = text(notice(null))
    expect(out).toContain('Trenutna obavijest o privatnosti')
    for (const name of ['OpenAI', 'Supabase', 'Vercel', 'Resend']) expect(out).toContain(name)
    // And says how to delete, with the button's own words.
    expect(out).toContain(hrHR['kitchen.delete.open'])
  })

  test('names the supplier behind every host the builder loads product images from', () => {
    // What the homeowner's browser fetches: the sink, tap and appliance lists
    // the builder renders (SchachermayerBrowse), all suppliers merged. A new
    // scrape that adds a host fails here until the notice names it.
    const SUPPLIER_BY_HOST: Record<string, string> = {
      'webshop.schachermayer.com': 'Schachermayer',
      'webshop.elgrad.hr': 'Elgrad',
    }
    const types = ['hob', 'oven', 'extractor', 'fridge', 'dishwasher', 'microwave'] as const
    const rendered = [...sinksFromCatalog(), ...tapsFromCatalog(), ...types.flatMap((ty) => appliancesForType(ty))]
    const hosts = new Set(rendered.flatMap((p) => (p.imageUrl ? [new URL(p.imageUrl).host] : [])))
    expect([...hosts].sort()).toEqual(['webshop.elgrad.hr', 'webshop.schachermayer.com'])
    for (const host of hosts) {
      const supplier = SUPPLIER_BY_HOST[host]
      expect(supplier, host).toBeDefined()
      expect(hrHR['privacy.who.productImages']).toContain(supplier)
      expect(enUS['privacy.who.productImages']).toContain(supplier)
    }
    expect(text(notice(null))).toContain(hrHR['privacy.who.productImages'])
  })

  test('supplier product images go out without a referrer', () => {
    const html = renderToStaticMarkup(
      createElement(SchachermayerBrowse, {
        products: [{ name: 'Sudoper', supplier: 'elgrad', imageUrl: 'https://webshop.elgrad.hr/assets/files/x.jpg' }],
      })
    )
    expect(html).toMatch(/<img[^>]*src="https:\/\/webshop\.elgrad\.hr[^>]*referrerpolicy="no-referrer"/i)
  })

  test('claims no AI label the code does not show everywhere — no "always marked"', () => {
    // The concept is badged where it is drawn (ConceptRender, the wrap-up),
    // not on every later surface (the rail card, the builder): the notice may
    // not say "always".
    expect(hrHR['privacy.ai.body']).not.toMatch(/uvijek/i)
    expect(enUS['privacy.ai.body']).not.toMatch(/always/i)
    expect(hrHR['privacy.ai.body']).toContain('AI koncept')
  })

  test('says what the code does with contact details: OpenAI sees them in the summary', () => {
    expect(hrHR['privacy.who.openai']).toContain('s imenom, e-mail adresom i telefonom')
  })

  test('without PRIVACY_CONTACT_EMAIL: no address at all — no mailto, no @', () => {
    const html = notice(null)
    expect(html).not.toContain('mailto:')
    expect(text(html)).not.toContain('@')
    expect(html).not.toContain('data-privacy-operator')
    // The maker is still named as the contact.
    expect(text(html)).toContain(hrHR['privacy.contact.maker'])
  })

  test('with a configured address: a mailto link', () => {
    const html = notice('privatnost@example.test')
    expect(html).toContain('href="mailto:privatnost@example.test"')
    expect(text(html)).toContain('piši nam na privatnost@example.test')
  })

  test('claims no retention period, region or certification', () => {
    const copy = Object.entries(hrHR)
      .filter(([k]) => k.startsWith('privacy.'))
      .map(([, v]) => v)
      .join(' ')
    expect(copy).not.toMatch(/\b\d+\s*(dan|mjesec|godin)/i)
    expect(copy).not.toMatch(/\bEU\b|Europsk|ISO|certifi|GDPR-/i)
  })

  test('"AI asistent", never "chatbot", in either language', () => {
    const keys = Object.keys(hrHR).filter(
      (k) => k.startsWith('privacy.') || k.startsWith('legal.') || k === 'kitchen.home.ai' || k === 'kitchen.home.readOnly.ai' || k === 'space.processingNote'
    ) as (keyof typeof hrHR)[]
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) {
      expect(hrHR[k], k).not.toMatch(/chatbot|chat bot/i)
      expect(enUS[k], k).not.toMatch(/chatbot|chat bot/i)
    }
  })
})

describe('/privatnost reads its contact address from the env, and only a real one', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  const contact = () => (PrivacyPage() as { props: { contactEmail: string | null } }).props.contactEmail

  test('unset → no contact', () => {
    vi.stubEnv('PRIVACY_CONTACT_EMAIL', undefined)
    expect(contact()).toBeNull()
  })

  test('not an address → no contact', () => {
    vi.stubEnv('PRIVACY_CONTACT_EMAIL', 'nope')
    expect(contact()).toBeNull()
    vi.stubEnv('PRIVACY_CONTACT_EMAIL', '   ')
    expect(contact()).toBeNull()
  })

  test('a valid address is passed on, trimmed', () => {
    vi.stubEnv('PRIVACY_CONTACT_EMAIL', '  privatnost@example.test ')
    expect(contact()).toBe('privatnost@example.test')
  })
})
