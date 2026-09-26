/**
 * "End the ghosting" (AGENTS.md rule 8) starts with the maker actually hearing
 * that a brief arrived. One transactional email per persisted brief. Dormant
 * unless a provider and a recipient exist; never throws into the handoff path.
 *
 * Sending itself lives in ./send (Resend / Mailpit / console); this module only
 * decides what to say and to whom.
 *
 * `MAKER_NOTIFY_EMAIL` is the pre-accounts fallback: once a brief has an owner,
 * `to` is that project's maker and this variable is only a BCC for our own
 * monitoring.
 */
import { escapeHtml } from './html'
import { emailSendingEnabled, sendEmail } from './send'
import { contactChannels } from '@/lib/contact'
import type { HandoffBundle } from '@/lib/types'

export interface MakerNotifyInput {
  briefId: string
  bundle: HandoffBundle
  locale?: string | null
  /** Absolute origin of the app, e.g. https://softclose-lyart.vercel.app */
  baseUrl: string
  /** The owning maker's address. Falls back to MAKER_NOTIFY_EMAIL. */
  to?: string | null
}

export function makerNotifyEnabled(): boolean {
  return emailSendingEnabled() && Boolean(process.env.MAKER_NOTIFY_EMAIL)
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
  const contact = contactChannels(b).join(' · ') || '—'
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

/** Send. Resolves to true when the provider accepted the message. Never throws. */
export async function notifyMakerOfBrief(input: MakerNotifyInput): Promise<boolean> {
  const to = input.to ?? process.env.MAKER_NOTIFY_EMAIL
  if (!to || !emailSendingEnabled()) return false
  const { subject, html, text } = buildMakerEmail(input)
  const result = await sendEmail({ to, subject, html, text })
  return result.ok
}
