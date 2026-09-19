/**
 * "End the ghosting" (AGENTS.md rule 8) starts with the maker actually hearing
 * that a brief arrived. One transactional email per persisted brief via the
 * Resend REST API (no SDK — one fetch). Dormant unless RESEND_API_KEY and
 * MAKER_NOTIFY_EMAIL are set; never throws into the handoff path.
 *
 * Env:
 *   RESEND_API_KEY      — from resend.com
 *   RESEND_FROM         — e.g. "softclose <brief@yourdomain.hr>" (verified domain);
 *                         defaults to Resend's onboarding sender, which only
 *                         delivers to the account owner's own address.
 *   MAKER_NOTIFY_EMAIL  — where new briefs go (comma-separated allowed)
 */
import type { HandoffBundle } from '@/lib/types'

export interface MakerNotifyInput {
  briefId: string
  bundle: HandoffBundle
  locale?: string | null
  /** Absolute origin of the app, e.g. https://softclose-lyart.vercel.app */
  baseUrl: string
}

export function makerNotifyEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAKER_NOTIFY_EMAIL)
}

function eur(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n).toLocaleString('hr-HR')} €`
}

export function buildMakerEmail(input: MakerNotifyInput): { subject: string; html: string; text: string } {
  const { briefId, bundle, baseUrl } = input
  const b = bundle.brief
  const e = bundle.estimate
  const link = `${baseUrl}/maker/${briefId}`
  const name = b.name?.trim() || 'Nepoznato ime'
  const contact = b.contactValue?.trim() || '—'
  const shape = b.floorPlan?.layoutShape ?? b.layoutShape ?? '—'
  const dims = b.floorPlan?.room ? `${Math.round(b.floorPlan.room.lengthCm)} × ${Math.round(b.floorPlan.room.widthCm)} cm` : '—'
  const range = e ? `${eur(e.low)} – ${eur(e.high)}${e.bandPct ? ` (±${e.bandPct}%)` : ''}` : 'nije dostupno'
  const allIn = e?.withAppliances ? `${eur(e.withAppliances.low)} – ${eur(e.withAppliances.high)}` : null
  const subject = `Novi sažetak kuhinje — ${name} · ${range}`
  const rows: Array<[string, string]> = [
    ['Homeowner', `${name} · ${contact}`],
    ['Raspored', `${shape} · ${dims}`],
    ['Kuhinja (izrada i montaža)', range],
    ...(allIn ? ([['Sve uključeno', allIn]] as Array<[string, string]>) : []),
    ['Rok', b.timeline ?? '—'],
  ]
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 8px">softclose · novi sažetak</p>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(name)} — kuhinja</h1>
<table style="border-collapse:collapse;width:100%;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:44%">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">Otvori sažetak</a></p>
<p style="font-size:12px;color:#666">Procjena je raspon koji izrađivač potvrđuje — nikad konačna ponuda. Ovaj link je privatan; ne prosljeđuj ga.</p>
</body></html>`
  const text = `Novi sažetak kuhinje\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nOtvori: ${link}\n`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Send. Resolves to true when Resend accepted the message. Never throws. */
export async function notifyMakerOfBrief(input: MakerNotifyInput): Promise<boolean> {
  if (!makerNotifyEnabled()) return false
  try {
    const { subject, html, text } = buildMakerEmail(input)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'softclose <onboarding@resend.dev>',
        to: String(process.env.MAKER_NOTIFY_EMAIL).split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        text,
      }),
    })
    if (!res.ok) {
      console.error('[maker-email] resend rejected:', res.status, (await res.text()).slice(0, 300))
      return false
    }
    return true
  } catch (err) {
    console.error('[maker-email] failed:', err instanceof Error ? err.message : err)
    return false
  }
}
