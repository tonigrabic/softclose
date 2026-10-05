/**
 * IMP-08 Done-when: a mocked failed send shows the error state on the login
 * form.
 *
 * `requestLoginLink` used to answer "sent" whatever `sendEmail` returned, so a
 * provider refusing the message (bad from-address, quota, outage) still told
 * the person a link was on its way. Now a send that reaches nobody is an
 * error — "Slanje nije uspjelo, zatraži link od izrađivača" — logged with the
 * provider's status, never the full address or the link.
 *
 * What must not change: in development the link shown on the page
 * (dev-link.ts) is how every local check signs in, so no mail there is still
 * success-with-link; and an unknown address still reads "sent".
 *
 * The real action, dev-link gate, token helpers and login email run; only the
 * edges are faked — request headers, the account and token tables, the rate
 * limiter, and `sendEmail` (no provider is ever called).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SendResult } from '@/lib/notify/send'

const h = vi.hoisted(() => ({
  state: {
    account: null as null | { id: string; email: string; status: string },
    provider: 'resend' as 'resend' | 'mailpit' | 'console' | 'none',
    result: { ok: true, outcome: 'sent', provider: 'resend', status: 200 } as SendResult,
    issued: 0,
    sends: 0,
  },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'app.example' }),
}))
vi.mock('@/lib/auth/session', () => ({ authSecretConfigured: () => true }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true }) }))
vi.mock('@/lib/auth/accounts', () => ({
  findAccountByEmail: async () => h.state.account,
}))
vi.mock('@/lib/auth/magic-link', () => ({
  recentTokenCount: async () => 0,
  issueToken: async () => {
    h.state.issued += 1
    return { raw: 'RAWTOKEN123', hash: 'h', expiresAt: new Date(Date.now() + 900_000) }
  },
}))
vi.mock('@/lib/notify/send', () => ({
  emailProvider: () => h.state.provider,
  sendEmail: async () => {
    h.state.sends += 1
    return h.state.result
  },
}))

import { requestLoginLink, type LoginState } from '@/app/login/actions'
import { LoginFormView } from '@/app/login/LoginForm'
import { hrHR } from '@/lib/i18n/locales/hr-HR'

const EMAIL = 'ana.kovac@example.com'
const ACCOUNT = { id: 'acc-1', email: EMAIL, status: 'active' }

function form(email = EMAIL): FormData {
  const f = new FormData()
  f.set('email', email)
  return f
}

const ask = (email?: string) => requestLoginLink({ status: 'idle' }, form(email))
const render = (state: LoginState) =>
  renderToStaticMarkup(createElement(LoginFormView, { state, formAction: () => {} }))

let logs: string[]
beforeEach(() => {
  logs = []
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  }
  vi.stubEnv('APP_URL', 'https://app.example')
  h.state.account = ACCOUNT
  h.state.provider = 'resend'
  h.state.result = { ok: true, outcome: 'sent', provider: 'resend', status: 200 }
  h.state.issued = 0
  h.state.sends = 0
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Nothing in the server log that would hand over the account or the link. */
function expectNoSecretsLogged() {
  const all = logs.join('\n')
  expect(all).not.toContain(EMAIL)
  expect(all).not.toContain('RAWTOKEN123')
  expect(all).not.toContain('/auth/')
}

describe('production: a send that reaches nobody is an error', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))

  test('the provider refused the message: error state, provider status logged', async () => {
    h.state.result = { ok: false, outcome: 'failed', provider: 'resend', status: 422 }
    const state = await ask()
    expect(state).toEqual({ status: 'error', email: EMAIL, message: 'notSent' })
    expect(h.state.sends).toBe(1)
    const line = logs.find((l) => l.includes('login link not sent'))
    expect(line).toBeDefined()
    expect(line).toContain('a***@example.com')
    expect(line).toContain('resend failed 422')
    expectNoSecretsLogged()
  })

  test('the login form shows that error — the link is not on its way', async () => {
    h.state.result = { ok: false, outcome: 'failed', provider: 'resend', status: 500 }
    const html = render(await ask())
    expect(html).toContain('role="alert"')
    expect(html).toContain(hrHR['auth.login.notSent'])
    expect(hrHR['auth.login.notSent']).toMatch(/^Slanje nije uspjelo/)
    expect(hrHR['auth.login.notSent']).toMatch(/zatraži link od svog izrađivača/i)
    expect(html).not.toContain(hrHR['auth.login.sent.title'])
    // The address stays in the field, to try again.
    expect(html).toContain(`value="${EMAIL}"`)
  })

  test('a send the provider skipped is an error too', async () => {
    h.state.result = { ok: false, outcome: 'skipped', provider: 'resend' }
    const state = await ask()
    expect(state.status).toBe('error')
    expect(state.message).toBe('notSent')
    expect(logs.join('\n')).toContain('resend skipped no status')
    expectNoSecretsLogged()
  })

  test('no provider at all: the same error for every address, before any lookup or token', async () => {
    h.state.provider = 'none'
    const known = await ask()
    h.state.account = null
    const unknown = await ask('nobody@example.com')
    expect(known).toEqual({ status: 'error', email: EMAIL, message: 'notSent' })
    expect(unknown).toEqual({ status: 'error', email: 'nobody@example.com', message: 'notSent' })
    expect(h.state.issued).toBe(0)
    expect(h.state.sends).toBe(0)
    expectNoSecretsLogged()
  })

  test('accepted by the provider: sent, and no link on screen', async () => {
    const state = await ask()
    expect(state).toEqual({ status: 'sent', email: EMAIL, devLink: null })
    const html = render(state)
    expect(html).toContain(hrHR['auth.login.sent.title'])
    expect(html).not.toContain('RAWTOKEN123')
    expectNoSecretsLogged()
  })

  test('an unknown address still reads "sent" — nothing about who has an account', async () => {
    h.state.account = null
    h.state.result = { ok: false, outcome: 'failed', provider: 'resend', status: 500 }
    expect(await ask('nobody@example.com')).toEqual({ status: 'sent', email: 'nobody@example.com' })
    expect(h.state.sends).toBe(0)
  })
})

describe('development: the link on screen is the delivery', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'))

  test.each([
    ['console provider (no mail set up)', { ok: false, outcome: 'logged', provider: 'console' }],
    ['skipped', { ok: false, outcome: 'skipped', provider: 'console' }],
    ['local inbox refused it', { ok: false, outcome: 'failed', provider: 'mailpit', status: 500 }],
  ] as Array<[string, SendResult]>)('%s: sent, with the sign-in link shown', async (_, result) => {
    h.state.provider = result.provider
    h.state.result = result
    const state = await ask()
    expect(state.status).toBe('sent')
    expect(state.devLink).toBe('https://app.example/auth/verify?token=RAWTOKEN123')
    const html = render(state)
    expect(html).toContain(hrHR['auth.login.sent.title'])
    expect(html).toContain(hrHR['auth.login.devLink'])
    expect(html).toContain('href="https://app.example/auth/verify?token=RAWTOKEN123"')
    expect(html).not.toContain(hrHR['auth.login.notSent'])
  })

  test('a local inbox that accepted it: sent, no link on screen', async () => {
    h.state.provider = 'mailpit'
    h.state.result = { ok: true, outcome: 'sent', provider: 'mailpit', status: 200 }
    expect(await ask()).toEqual({ status: 'sent', email: EMAIL, devLink: null })
  })
})
