/**
 * The two emails that let someone in, and the gate that decides whether a link
 * may be shown on screen instead.
 *
 * The escaping case is the one that matters most: the invite interpolates a
 * maker-supplied studio name and a customer-supplied first name into HTML that
 * a mail client renders. The dev-link case guards a deliberate backdoor — if
 * that check ever returns a URL in production, anyone who can type an email
 * address into /login owns that account.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INVITE_LINK_DAYS, LOGIN_LINK_MINUTES, buildInviteEmail, buildLoginEmail } from '@/lib/notify/auth-email'
import { devLinkIfAllowed } from '@/lib/auth/dev-link'
import { escapeHtml, renderEmail } from '@/lib/notify/html'

const URL_ = 'https://softclose.example/auth/verify?token=abc123'

describe('buildLoginEmail', () => {
  const mail = buildLoginEmail({ url: URL_ })

  it('is in Croatian and says what it is', () => {
    expect(mail.subject).toBe('Prijava u softclose')
    expect(mail.html).toContain('Prijavi se')
  })

  it('carries the link exactly once, as an href', () => {
    expect(mail.html.split(URL_).length - 1).toBe(1)
    expect(mail.html).toContain(`href="${URL_}"`)
  })

  it('states the expiry that the token actually has', () => {
    expect(mail.html).toContain(`${LOGIN_LINK_MINUTES} minuta`)
  })

  it('tells an unexpected recipient they can ignore it', () => {
    // A login mail nobody asked for is the first sign of someone probing.
    expect(mail.text).toContain('zanemari')
  })

  it('has a text part that is plain text and still usable', () => {
    expect(mail.text).toContain(URL_)
    expect(mail.text).not.toContain('<')
  })
})

describe('buildInviteEmail', () => {
  const mail = buildInviteEmail({ url: URL_, makerName: 'Stolarija Ana', customerName: 'Marko' })

  it('leads with the maker, because that is the name the customer recognises', () => {
    expect(mail.subject).toContain('Stolarija Ana')
    expect(mail.html).toContain('Stolarija Ana')
  })

  it('greets the customer when we know their name', () => {
    expect(mail.html).toContain('Marko')
  })

  it('promises a range and explicitly not a quote or a charge', () => {
    expect(mail.html).toContain('raspon')
    expect(mail.html).toContain('Nije ponuda')
    expect(mail.html).toContain('ne naplaćuje')
  })

  it('states the 14-day expiry and asks them not to forward it', () => {
    expect(mail.html).toContain(`${INVITE_LINK_DAYS} dana`)
    expect(mail.html).toContain('ne prosljeđuj')
  })

  it('works without a customer name', () => {
    const anon = buildInviteEmail({ url: URL_, makerName: 'Stolarija Ana', customerName: null })
    expect(anon.html).toContain('Stolarija Ana')
    expect(anon.subject).toContain('Stolarija Ana')
  })

  it('falls back when the maker has no name on file', () => {
    const noName = buildInviteEmail({ url: URL_, makerName: '   ' })
    expect(noName.subject).toContain('Tvoj izrađivač')
  })

  it('escapes a hostile maker name instead of rendering it', () => {
    const hostile = buildInviteEmail({
      url: URL_,
      makerName: 'Ana <script>alert(1)</script>',
      customerName: 'Marko" onload="alert(2)',
    })
    expect(hostile.html).not.toContain('<script>')
    expect(hostile.html).toContain('&lt;script&gt;')
    expect(hostile.html).not.toContain('onload="alert(2)"')
  })
})

describe('renderEmail', () => {
  it('escapes the CTA url so it cannot break out of the attribute', () => {
    const { html } = renderEmail({
      eyebrow: 'x',
      title: 'y',
      cta: { label: 'go', url: 'https://e.example/"><script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>')
  })

  it('omits empty sections rather than rendering empty tags', () => {
    const { html, text } = renderEmail({ eyebrow: 'x', title: 'y' })
    expect(html).not.toContain('<table')
    expect(html).not.toContain('<a ')
    expect(text.trim()).toBe('y')
  })
})

describe('escapeHtml', () => {
  it('covers every character that can break out of markup or an attribute', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('devLinkIfAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows the link in development when nothing sent it', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(devLinkIfAllowed(URL_, false)).toBe(URL_)
  })

  it('stays quiet in development once a provider took it', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(devLinkIfAllowed(URL_, true)).toBeNull()
  })

  it('NEVER shows the link in production, even when the send failed', () => {
    // The whole point of the gate. A failed send in production is an outage to
    // fix, not a reason to print credentials on a public page.
    vi.stubEnv('NODE_ENV', 'production')
    expect(devLinkIfAllowed(URL_, false)).toBeNull()
    expect(devLinkIfAllowed(URL_, true)).toBeNull()
  })
})
