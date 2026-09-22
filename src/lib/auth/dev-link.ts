/**
 * Whether a magic link may be shown on screen instead of emailed.
 *
 * One function, one test, one reason: this is a backdoor. In development it
 * turns "configure an email provider before you can sign in" into a click; in
 * production it would hand an account to whoever typed the address.
 *
 * Every caller goes through here rather than writing its own NODE_ENV check —
 * scattered environment checks are how a gate like this eventually rots.
 */
export function devLinkIfAllowed(url: string, sent: boolean): string | null {
  if (process.env.NODE_ENV === 'production') return null
  // A provider accepted it: the link is in an inbox, so showing it adds nothing.
  if (sent) return null
  return url
}
