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

type ContactFields = Pick<LeadProfile, 'name' | 'email' | 'phone' | 'contactValue'>

/**
 * The contact step's patch says something the profile does not already: a
 * new name or channel. Passing the step unchanged — every walk back from the
 * review goes through it (IMP-07) — logs no second "Contact: …" turn into the
 * transcript the maker reads.
 */
export function contactPatchChanges(patch: Partial<ContactFields>, profile: ContactFields): boolean {
  return (Object.keys(patch) as (keyof ContactFields)[]).some((k) => (patch[k] ?? undefined) !== (profile[k] ?? undefined))
}
