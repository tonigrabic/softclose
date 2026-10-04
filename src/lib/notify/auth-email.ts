/**
 * The two emails that let someone in.
 *
 * Builders only — no sending, so they stay directly testable, the same split
 * `buildMakerEmail` already uses. Croatian, because the homeowner-facing app is.
 *
 * The invite is the single most important email this product sends: it is the
 * customer's first contact, and it arrives from a company they have never heard
 * of. So it leads with the maker's name, says plainly what happens next, and
 * promises nothing about price. It also says up front that an AI assistant
 * leads the steps and the maker reviews everything (EU AI Act Art. 50,
 * IMP-09), and links the privacy notice.
 */
import { renderEmail, type EmailContent } from './html'

/** The public privacy notice on the same origin as the link, or nothing when
 *  the link is not a URL we can read an origin from. */
function privacyUrl(link: string): string | null {
  try {
    return `${new URL(link).origin}/privatnost`
  } catch {
    return null
  }
}

export const LOGIN_LINK_MINUTES = 15
export const INVITE_LINK_DAYS = 14

export function buildLoginEmail(input: { url: string; minutes?: number }): EmailContent {
  const minutes = input.minutes ?? LOGIN_LINK_MINUTES
  const { html, text } = renderEmail({
    eyebrow: 'softclose',
    title: 'Prijava',
    intro: [
      'Klikni na gumb ispod da se prijaviš. Lozinka ti ne treba.',
      `Link vrijedi ${minutes} minuta i može se upotrijebiti jednom.`,
    ],
    cta: { label: 'Prijavi se', url: input.url },
    footnote:
      'Ako nisi ti zatražio prijavu, slobodno zanemari ovu poruku — bez klika se ništa ne događa. Link je osoban; ne prosljeđuj ga.',
  })
  return { subject: 'Prijava u softclose', html, text }
}

export function buildInviteEmail(input: {
  url: string
  makerName: string
  customerName?: string | null
  days?: number
}): EmailContent {
  const days = input.days ?? INVITE_LINK_DAYS
  const maker = input.makerName.trim() || 'Tvoj izrađivač'
  const greeting = input.customerName?.trim() ? `${input.customerName.trim()}, ` : ''
  const privacy = privacyUrl(input.url)

  const { html, text } = renderEmail({
    eyebrow: `softclose · poziv od ${maker}`,
    title: `${maker} te poziva da opišeš svoju kuhinju`,
    intro: [
      `${greeting}umjesto duge liste pitanja, proći ćeš kroz nekoliko koraka: fotografije prostora, inspiracija, pa zajedno složimo kuhinju.`,
      `Kroz korake te vodi AI asistent. ${maker} osobno pregledava sve što podijeliš.`,
      `Na kraju ${maker} dobiva uredan sažetak, a ti okvirni raspon cijene. Nije ponuda i ništa se ne naplaćuje.`,
      'Traje petnaestak minuta i možeš stati kad god želiš — nastavit ćeš gdje si stao.',
    ],
    cta: { label: 'Počni', url: input.url },
    footnote: `Link vrijedi ${days} dana i osoban je — ne prosljeđuj ga.`,
    ...(privacy ? { footerLink: { label: 'Kako postupamo s tvojim podacima', url: privacy } } : {}),
  })
  return { subject: `${maker} te poziva — opiši svoju kuhinju`, html, text }
}
