/**
 * One place that puts email on the wire.
 *
 * Three providers, picked at runtime — the same shape the eksakt project
 * already uses, because clicking a real link in a local inbox beats copying one
 * out of a terminal:
 *
 *   MAILPIT_URL      → a local inbox (docker run -p 8025:8025 axllent/mailpit)
 *   RESEND_API_KEY   → Resend, i.e. production
 *   neither          → the console, in development only
 *
 * Never throws. A failed send must not take down the thing that triggered it —
 * a brief still saves when the notification bounces.
 */
export type SendOutcome = 'sent' | 'logged' | 'skipped' | 'failed'

export interface SendResult {
  ok: boolean
  outcome: SendOutcome
  provider: 'resend' | 'mailpit' | 'console' | 'none'
  status?: number
}

export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  text: string
}

export function emailProvider(): SendResult['provider'] {
  if (process.env.MAILPIT_URL) return 'mailpit'
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.NODE_ENV !== 'production') return 'console'
  return 'none'
}

export function emailSendingEnabled(): boolean {
  return emailProvider() === 'resend' || emailProvider() === 'mailpit'
}

function fromAddress(): string {
  // Resend's onboarding sender only delivers to the account owner's own address,
  // which is a useful default and a bad production setting — hence RESEND_FROM.
  return process.env.RESEND_FROM || 'softclose <onboarding@resend.dev>'
}

function recipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : String(to).split(','))
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const provider = emailProvider()
  const to = recipients(msg.to)
  if (!to.length) return { ok: false, outcome: 'skipped', provider }

  try {
    if (provider === 'mailpit') {
      const base = String(process.env.MAILPIT_URL).replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: fromAddress().match(/<(.+)>/)?.[1] ?? fromAddress() },
          To: to.map((Email) => ({ Email })),
          Subject: msg.subject,
          HTML: msg.html,
          Text: msg.text,
        }),
      })
      if (!res.ok) {
        console.error('[email] mailpit rejected:', res.status, (await res.text()).slice(0, 300))
        return { ok: false, outcome: 'failed', provider, status: res.status }
      }
      return { ok: true, outcome: 'sent', provider, status: res.status }
    }

    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromAddress(), to, subject: msg.subject, html: msg.html, text: msg.text }),
      })
      if (!res.ok) {
        console.error('[email] resend rejected:', res.status, (await res.text()).slice(0, 300))
        return { ok: false, outcome: 'failed', provider, status: res.status }
      }
      return { ok: true, outcome: 'sent', provider, status: res.status }
    }

    if (provider === 'console') {
      console.info(`\n[email] (no provider configured — development only)\n  to: ${to.join(', ')}\n  subject: ${msg.subject}\n${msg.text}\n`)
      return { ok: false, outcome: 'logged', provider }
    }

    // Production with nothing configured. Say so loudly: sign-in is broken, and
    // silently printing links to the server log is not an acceptable fallback.
    console.error('[email] no provider configured in production — message dropped:', msg.subject)
    return { ok: false, outcome: 'skipped', provider }
  } catch (err) {
    console.error('[email] send failed:', err instanceof Error ? err.message : err)
    return { ok: false, outcome: 'failed', provider }
  }
}
