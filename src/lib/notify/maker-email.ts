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
 *
 * Every word in it comes from the locale files, in the maker's locale (hr-HR
 * unless their account says otherwise), and every stored option id is turned
 * into words — the maker reads "L-oblik" and "3–6 mjeseci", never `l_shape` or
 * `3_6_months` (IMP-08). An id the locale does not know is left out rather
 * than printed.
 */
import { escapeHtml } from './html'
import { emailSendingEnabled, sendEmail } from './send'
import { contactChannels } from '@/lib/contact'
import { assumptionKey, formatRange, normalizeAssumptions, withGoodsKey } from '@/lib/builder/range'
import { DEFAULT_LOCALE, isLocale, t, tDynamic, type Locale } from '@/lib/i18n/core'
import type { HandoffBundle } from '@/lib/types'

export interface MakerNotifyInput {
  briefId: string
  /** The project the brief belongs to, when a maker owns it: the email links
   *  the customer's kitchen next to the brief. Left out for an ownerless
   *  (legacy) brief, whose project nobody can open. */
  projectId?: string | null
  bundle: HandoffBundle
  /** The maker's own locale (their account's). hr-HR when unknown. */
  locale?: string | null
  /** Absolute origin of the app, e.g. https://softclose-lyart.vercel.app */
  baseUrl: string
  /** The owning maker's address. Falls back to MAKER_NOTIFY_EMAIL. */
  to?: string | null
}

export function makerNotifyEnabled(): boolean {
  return emailSendingEnabled() && Boolean(process.env.MAKER_NOTIFY_EMAIL)
}

/** `{slot}` filled with a function replacer, so a `$&` in a customer's name
 *  stays a `$&`. */
function fill(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in slots ? slots[name] : whole))
}

/** A stored option id as words, or null when the locale has no words for it —
 *  never the raw id. */
function optionLabel(family: string, value: string | null | undefined, locale: Locale): string | null {
  if (!value) return null
  const key = `${family}.${value}`
  const label = tDynamic(key, locale)
  return label === key ? null : label
}

export function buildMakerEmail(input: MakerNotifyInput): { subject: string; html: string; text: string } {
  const { briefId, bundle, baseUrl } = input
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE
  const b = bundle.brief
  const e = bundle.estimate
  const briefLink = `${baseUrl}/maker/${briefId}`
  // The customer's kitchen as the maker sees it (read-only since IMP-07):
  // where the brief stands, the decision, and any change sent after it.
  const projectLink = input.projectId ? `${baseUrl}/kitchen/${input.projectId}` : null
  const name = b.name?.trim() || t('makerEmail.anonymous', locale)
  const contact = contactChannels(b).join(' · ') || '—'

  // "Nisam siguran" is the homeowner's own answer; to the maker it reads as
  // an open question about the shape.
  const shapeId = b.floorPlan?.layoutShape ?? b.layoutShape
  const shape = shapeId === 'unsure' ? t('makerEmail.layout.unsure', locale) : optionLabel('layout.shape', shapeId, locale)
  const dims = b.floorPlan?.room
    ? `${Math.round(b.floorPlan.room.lengthCm)} × ${Math.round(b.floorPlan.room.widthCm)} cm`
    : null
  const layout = [shape, dims].filter(Boolean).join(' · ') || '—'
  const timeline = optionLabel('option.timeline', b.timeline, locale) ?? '—'

  // No build, no range: the homeowner skipped the builder. Say so in the
  // subject too — the maker triages from the inbox.
  // With a build: the one range line (IMP-04) — the same rounding, ± and
  // "raspon koji ti potvrđuješ" as the brief, then what it leaves out.
  const figures = e ? formatRange(e, locale) : null
  const band = e?.bandPct != null ? fill(t('range.band', locale), { pct: String(Math.round(e.bandPct)) }) : null
  const headline = figures ? [figures, band].filter(Boolean).join(' · ') : t('makerEmail.noRange', locale)
  const assumptions = e
    ? normalizeAssumptions(e.assumptions)
        .map((a) => t(assumptionKey(a), locale))
        .join(' · ')
    : null
  // The kitchen with the goods the maker supplies, labelled by what they are:
  // "with sink and tap" when the homeowner buys the appliances (IMP-04 review).
  const withGoods: Array<[string, string]> = e?.withAppliances
    ? [[t(withGoodsKey(e.lines), locale), formatRange(e.withAppliances, locale)]]
    : []

  const subject = fill(t('makerEmail.subject', locale), { name, headline })
  const rows: Array<[string, string]> = [
    [t('makerEmail.row.customer', locale), `${name} · ${contact}`],
    [t('makerEmail.row.layout', locale), layout],
    [
      t('makerEmail.row.kitchen', locale),
      e ? `${headline} · ${t('range.confirms.maker', locale)}` : t('makerEmail.noRange.noBuild', locale),
    ],
    ...(assumptions ? ([[t('makerEmail.row.assumptions', locale), assumptions]] as Array<[string, string]>) : []),
    ...withGoods,
    [t('makerEmail.row.timeline', locale), timeline],
  ]
  const footnote = [
    e?.priceBasis === 'gross-margin-v1' ? t('makerEmail.priceBasis', locale) : null,
    t('makerEmail.private', locale),
  ]
    .filter(Boolean)
    .join(' ')

  const html = `<!doctype html><html lang="${locale.slice(0, 2)}"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 8px">${escapeHtml(t('makerEmail.eyebrow', locale))}</p>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(fill(t('makerEmail.title', locale), { name }))}</h1>
<table style="border-collapse:collapse;width:100%;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:44%">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join('')}
</table>
<p style="margin:20px 0"><a href="${escapeHtml(briefLink)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">${escapeHtml(t('makerEmail.cta.brief', locale))}</a>${
    projectLink
      ? ` <a href="${escapeHtml(projectLink)}" style="display:inline-block;color:#111;text-decoration:underline;padding:10px 8px;font-weight:600">${escapeHtml(t('makerEmail.cta.project', locale))}</a>`
      : ''
  }</p>
<p style="font-size:12px;color:#666">${escapeHtml(footnote)}</p>
</body></html>`
  const links = [
    `${t('makerEmail.cta.brief', locale)}: ${briefLink}`,
    ...(projectLink ? [`${t('makerEmail.cta.project', locale)}: ${projectLink}`] : []),
  ]
  const text = `${t('makerEmail.heading', locale)}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${links.join('\n')}\n`
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
