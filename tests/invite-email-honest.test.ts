/**
 * IMP-08: the invite action tells the maker when the invite email did not go
 * out — and still creates the invite (Decision 4: never refuse an invite).
 *
 * The link is always on the maker's screen; email is the convenience. So a
 * provider that refused the message, or a server with nothing set up to send,
 * leaves a working invite and one calm line: the email did not go out, send
 * the link below yourself. The provider's status is logged; the full address
 * and the link never are.
 *
 * The real action runs; its edges are faked — the maker session, the account,
 * project and token stores, request headers, revalidation, and `sendEmail`
 * (no provider is ever called).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SendResult } from '@/lib/notify/send'

const h = vi.hoisted(() => ({
  state: {
    result: { ok: true, outcome: 'sent', provider: 'resend', status: 200 } as SendResult,
    sends: 0,
  },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'app.example' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/dal', () => ({
  requireMaker: async () => ({
    accountId: 'maker-1',
    role: 'maker',
    email: 'studio@example.test',
    name: 'Stolarija Horvat',
    locale: 'hr-HR',
  }),
}))
vi.mock('@/lib/auth/accounts', () => ({
  ensureCustomerAccount: async (input: { email: string }) => ({
    id: 'cust-1',
    role: 'customer',
    email: input.email,
    status: 'pending',
  }),
}))
vi.mock('@/lib/auth/projects', () => ({
  createProject: async () => ({ id: '55555555-5555-4555-8555-555555555555' }),
}))
vi.mock('@/lib/auth/magic-link', () => ({
  recentTokenCount: async () => 0,
  revokeOpenInvites: async () => {},
  issueToken: async () => ({ raw: 'INVITETOKEN9', hash: 'h', expiresAt: new Date() }),
}))
vi.mock('@/lib/db/supabase', () => ({
  supabaseAdmin: () => ({}),
  TABLES: { projects: 'softclose_projects', accounts: 'softclose_accounts' },
}))
vi.mock('@/lib/notify/send', () => ({
  sendEmail: async () => {
    h.state.sends += 1
    return h.state.result
  },
}))

import { inviteCustomer, type InviteState } from '@/app/dashboard/actions'
import { InviteLinkBox } from '@/app/dashboard/InviteForm'
import { hrHR } from '@/lib/i18n/locales/hr-HR'

const EMAIL = 'ana.kovac@example.com'
const LINK = 'https://app.example/auth/verify?token=INVITETOKEN9'

function form(): FormData {
  const f = new FormData()
  f.set('email', EMAIL)
  f.set('name', 'Ana Kovač')
  return f
}

const invite = () => inviteCustomer({ status: 'idle' }, form())
const box = (state: InviteState) =>
  renderToStaticMarkup(
    createElement(InviteLinkBox, {
      url: state.link!,
      emailed: Boolean(state.emailed),
      emailFailed: Boolean(state.emailFailed),
      customerName: state.customerName,
    })
  )

let logs: string[]
beforeEach(() => {
  logs = []
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  }
  vi.stubEnv('APP_URL', 'https://app.example')
  vi.stubEnv('NODE_ENV', 'production')
  h.state.sends = 0
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function expectNoSecretsLogged() {
  const all = logs.join('\n')
  expect(all).not.toContain(EMAIL)
  expect(all).not.toContain('INVITETOKEN9')
}

describe('invite email that did not go out', () => {
  test.each([
    ['the provider refused it', { ok: false, outcome: 'failed', provider: 'resend', status: 422 }, 'resend failed 422'],
    ['nothing set up to send', { ok: false, outcome: 'skipped', provider: 'none' }, 'none skipped'],
  ] as Array<[string, SendResult, string]>)('%s: the invite stands, the maker is told', async (_, result, logged) => {
    h.state.result = result
    const state = await invite()
    // Never a refusal: created, with the link to send by hand.
    expect(state).toEqual({
      status: 'created',
      link: LINK,
      customerName: 'Ana Kovač',
      emailed: false,
      emailFailed: true,
    })
    expect(h.state.sends).toBe(1)

    const line = logs.find((l) => l.includes('email not sent'))
    expect(line).toBeDefined()
    expect(line).toContain('a***@example.com')
    expect(line).toContain(logged)
    expectNoSecretsLogged()

    const html = box(state)
    expect(html).toContain(hrHR['dashboard.invite.notEmailed'])
    expect(html).toContain(hrHR['dashboard.invite.ready'].replace('{name}', 'Ana Kovač'))
    expect(html).not.toContain(hrHR['dashboard.invite.sent'].replace('{name}', 'Ana Kovač'))
    expect(html).toContain(LINK)
  })

  test('accepted by the provider: "emailed", no warning', async () => {
    h.state.result = { ok: true, outcome: 'sent', provider: 'resend', status: 200 }
    const state = await invite()
    expect(state).toMatchObject({ status: 'created', link: LINK, emailed: true, emailFailed: false })
    const html = box(state)
    expect(html).toContain(hrHR['dashboard.invite.sent'].replace('{name}', 'Ana Kovač'))
    expect(html).not.toContain(hrHR['dashboard.invite.notEmailed'])
    expect(logs.join('\n')).toContain('invite created a***@example.com resend sent 200')
    expectNoSecretsLogged()
  })

  test('development console: the link on screen is the delivery, not a failure', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    h.state.result = { ok: false, outcome: 'logged', provider: 'console' }
    const state = await invite()
    expect(state).toMatchObject({ status: 'created', link: LINK, emailed: false, emailFailed: false })
    const html = box(state)
    expect(html).toContain(hrHR['dashboard.invite.ready'].replace('{name}', 'Ana Kovač'))
    expect(html).not.toContain(hrHR['dashboard.invite.notEmailed'])
  })
})
