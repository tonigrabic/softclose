/**
 * "Izbriši moju kuhinju" on screen (IMP-09): where it appears, and that both
 * steps are calm — the panel says what goes and what stays, "Odustani" sits
 * first, nothing counts down, and a failure says how to carry on.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { KitchenHome, type KitchenHomeProps } from '@/app/kitchen/[projectId]/KitchenHome'
import { DeleteAccount, DeleteKitchenView } from '@/app/kitchen/[projectId]/DeleteKitchen'
import { LoginFormView } from '@/app/login/LoginForm'
import { hrHR } from '@/lib/i18n/locales/hr-HR'

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
const panel = (over: Partial<Parameters<typeof DeleteKitchenView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(DeleteKitchenView, {
      makerName: 'Stolarija Horvat',
      submitted: false,
      asking: true,
      pending: false,
      failed: false,
      onOpen: noop,
      onCancel: noop,
      onConfirm: noop,
      ...over,
    })
  )

describe('where the delete link appears', () => {
  test('the customer sees it on their kitchen home', () => {
    const html = home()
    expect(html).toContain(hrHR['kitchen.delete.open'])
    // A quiet link, not the panel: nothing to confirm until they ask.
    expect(html).not.toContain(hrHR['kitchen.delete.confirm'])
  })

  test('also on a closed project — a declined kitchen is still theirs to erase', () => {
    expect(home({ closed: true, submittedAt: '3. 10. 2026.', briefId: 'b1' })).toContain(hrHR['kitchen.delete.open'])
  })

  test('never on the maker’s read-only view', () => {
    const html = home({ readOnly: true })
    expect(html).not.toContain(hrHR['kitchen.delete.open'])
    expect(html).not.toContain('data-delete-kitchen')
  })
})

describe('the confirmation panel', () => {
  test('says what goes, names the maker, and offers Odustani first', () => {
    const html = panel()
    expect(html).toContain(hrHR['kitchen.delete.title'])
    expect(html).toContain(hrHR['kitchen.delete.body'].replace('{maker}', 'Stolarija Horvat'))
    const cancelAt = html.indexOf(hrHR['kitchen.delete.cancel'])
    const confirmAt = html.indexOf(hrHR['kitchen.delete.confirm'])
    expect(cancelAt).toBeGreaterThan(-1)
    expect(confirmAt).toBeGreaterThan(cancelAt)
    expect(html).not.toContain('role="alert"')
    expect(html).not.toMatch(/\sdisabled=""/)
    // No checkbox to tick, no autofocus on the destructive button.
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toMatch(/autofocus/i)
  })

  test('without a maker name it reads "tvoj izrađivač" mid-sentence', () => {
    expect(panel({ makerName: null })).toContain(', a tvoj izrađivač ih više neće vidjeti')
  })

  test('the email-notice line only once a summary went out', () => {
    expect(panel({ submitted: false })).not.toContain(hrHR['kitchen.delete.sentNote'])
    expect(panel({ submitted: true })).toContain(hrHR['kitchen.delete.sentNote'])
  })

  test('a failure says so, as an alert, with how to carry on', () => {
    const html = panel({ failed: true })
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${hrHR['kitchen.delete.failed']}`))
  })

  test('while deleting: "Brišem…" and both buttons disabled', () => {
    const html = panel({ pending: true })
    expect(html).toContain(hrHR['kitchen.delete.pending'])
    expect(html).not.toContain(hrHR['kitchen.delete.confirm'])
    expect([...html.matchAll(/<button[^>]*\sdisabled=""/g)]).toHaveLength(2)
  })

  test('closed: just the link', () => {
    const html = panel({ asking: false })
    expect(html).toContain(hrHR['kitchen.delete.open'])
    expect(html).not.toContain(hrHR['kitchen.delete.title'])
  })
})

describe('the account panel — once no kitchen is left on the account', () => {
  test('the no-kitchen panel’s link reads "Izbriši moj račun"', () => {
    const html = renderToStaticMarkup(createElement(DeleteAccount))
    expect(html).toContain(hrHR['account.delete.open'])
    expect(html).not.toContain(hrHR['kitchen.delete.open'])
  })

  test('says what goes — the account, not a kitchen — with Odustani first and no maker note', () => {
    const html = panel({ variant: 'account', makerName: null, submitted: true })
    expect(html).toContain(hrHR['account.delete.title'])
    expect(html).toContain(hrHR['account.delete.body'])
    expect(html).not.toContain(hrHR['kitchen.delete.title'])
    expect(html).not.toContain(hrHR['kitchen.delete.sentNote'])
    expect(html.indexOf(hrHR['kitchen.delete.cancel'])).toBeLessThan(html.indexOf(hrHR['kitchen.delete.confirm']))
  })

  test('a failure on the no-kitchen panel says to try again', () => {
    const html = panel({ variant: 'account', failed: true })
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${hrHR['account.delete.failed']}`))
  })

  test('the kitchen went but the account step stopped: the panel says exactly that', () => {
    const html = panel({ variant: 'account', kitchenGone: true, failed: true })
    expect(html).toContain(hrHR['account.delete.title'])
    expect(html).toMatch(new RegExp(`role="alert"[^>]*>${hrHR['kitchen.delete.failedAccount']}`))
    // Not the "picks up where it stopped" line: the retry runs a different action.
    expect(html).not.toContain(hrHR['kitchen.delete.failed'] + '<')
  })
})

describe('where deleting lands: /login?deleted=1', () => {
  test('a calm notice instead of the sign-in form, with a way back for a second kitchen', () => {
    const html = renderToStaticMarkup(
      createElement(LoginFormView, { state: { status: 'idle' }, formAction: noop, deleted: true })
    )
    expect(html).toContain(hrHR['auth.deleted.title'])
    expect(html).toContain(hrHR['auth.deleted.body'])
    expect(html).toContain(hrHR['auth.deleted.signIn'])
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('name="email"')
  })

  test('?deleted=account: the account notice, and no "another kitchen" link', () => {
    const html = renderToStaticMarkup(
      createElement(LoginFormView, { state: { status: 'idle' }, formAction: noop, deleted: 'account' })
    )
    expect(html).toContain(hrHR['auth.deletedAccount.title'])
    expect(html).toContain(hrHR['auth.deletedAccount.body'])
    expect(html).not.toContain(hrHR['auth.deleted.title'])
    expect(html).not.toContain(hrHR['auth.deleted.signIn'])
    expect(html).not.toContain('name="email"')
  })

  test('without the flag it is the ordinary sign-in form', () => {
    const html = renderToStaticMarkup(createElement(LoginFormView, { state: { status: 'idle' }, formAction: noop }))
    expect(html).toContain('name="email"')
    expect(html).not.toContain(hrHR['auth.deleted.title'])
  })
})
