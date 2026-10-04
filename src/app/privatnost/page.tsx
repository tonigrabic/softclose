import type { Metadata } from 'next'
import { isEmail } from '@/lib/auth/tokens'
import { PrivacyNotice } from './PrivacyNotice'

// TODO(Toni, before launch): the operator's identity (company, address, OIB),
// the impressum and the controller/processor roles belong here (GDPR Art. 13).
// Nothing names an operator yet because nothing in the code backs one — do not
// invent it. The page is prerendered: PRIVACY_CONTACT_EMAIL is read at build,
// so a change needs a redeploy.

export const metadata: Metadata = {
  title: 'Privatnost · softclose',
  description: 'Što softclose sprema, tko to vidi i kako to izbrisati.',
}

/**
 * The privacy notice (IMP-09) — public, static, linked from every shell's
 * footer, the photo step and the invite email.
 *
 * Every sentence is backed by what the code does today: the services it
 * calls, the one cookie, the self-service delete. It claims no retention
 * period, region, legal role or certification the code does not back.
 *
 * The operator contact appears only when PRIVACY_CONTACT_EMAIL holds a real
 * address — never a placeholder. Until then the homeowner's maker is the
 * contact, which the notice says.
 */
export default function PrivacyPage() {
  const raw = process.env.PRIVACY_CONTACT_EMAIL?.trim()
  const contactEmail = raw && isEmail(raw) ? raw : null
  return <PrivacyNotice contactEmail={contactEmail} />
}
