import type { LeadProfile } from '@/lib/types'

/**
 * Every way the maker can reach the homeowner, for everything that shows it:
 * the rail read-back, the wrap-up, the brief header, the maker email.
 *
 * Signed-in customers carry `email` (their account address, always) and an
 * optional `phone`. Briefs from the anonymous funnel carry one `contactValue`
 * instead, shown as-is so those briefs still read.
 */
export function contactChannels(p: Pick<LeadProfile, 'email' | 'phone' | 'contactValue'>): string[] {
  const channels = [p.email, p.phone].map((c) => c?.trim()).filter((c): c is string => Boolean(c))
  if (channels.length > 0) return channels
  const legacy = p.contactValue?.trim()
  return legacy ? [legacy] : []
}
