import { notFound } from 'next/navigation'
import type { HandoffBundle } from '@/lib/types'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { resolveMedia, storageSigner } from '@/lib/db/media'
import { requireBriefAccess } from '@/lib/auth/dal'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/core'
import { formatDecisionDate, formatQuoteEur } from '@/lib/project/decision'
import { MakerBriefView } from './MakerBriefView'

export const dynamic = 'force-dynamic'

/**
 * The maker's side of the product: one persisted brief, opened by its id.
 *
 * The id used to BE the credential — an unguessable uuid handed over by email.
 * It is now just an id: requireBriefAccess insists on a signed-in maker who
 * owns this brief, and answers notFound() for everyone else rather than 403,
 * which would confirm the id exists. Emailed links still work; a signed-out
 * click goes through /login?next=/maker/<id> and lands back here.
 *
 * Opening it stamps maker_viewed_at so the homeowner-facing status can say
 * "your designer has opened your brief" (AGENTS.md rule 8) — and now that only
 * makers can get here, that claim is finally true. It used to fire when the
 * homeowner opened their own link.
 */
export default async function MakerBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, brief } = await requireBriefAccess(id)

  const db = supabaseAdmin()
  if (!db) notFound()

  if (!brief.makerViewedAt) {
    await db
      .from(TABLES.briefs)
      .update({
        maker_viewed_at: new Date().toISOString(),
        maker_status: brief.makerStatus === 'new' ? 'viewed' : brief.makerStatus,
      })
      .eq('id', id)
  }

  // Images live in private Storage as storage:// refs; hand the dashboard
  // short-lived signed URLs (1 h) instead.
  const signer = storageSigner()
  const bundle = signer
    ? await resolveMedia(brief.bundle as HandoffBundle, signer)
    : (brief.bundle as HandoffBundle)

  // The decision's labels are formatted here, with the session locale, like
  // the dashboard's — the client formatting them would mismatch on hydration.
  const locale = isLocale(session.locale) ? session.locale : DEFAULT_LOCALE
  const decision = {
    status: brief.makerStatus,
    note: brief.makerNote,
    quotedLabel: brief.quotedEur !== null ? formatQuoteEur(brief.quotedEur, locale) : null,
    decidedLabel: brief.decidedAt ? formatDecisionDate(brief.decidedAt, locale) : null,
  }

  return <MakerBriefView bundle={bundle} briefId={brief.id} createdAt={brief.createdAt} decision={decision} />
}
