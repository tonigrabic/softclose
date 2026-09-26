import { notFound } from 'next/navigation'
import { requireProjectAccess } from '@/lib/auth/dal'
import { findAccountById } from '@/lib/auth/accounts'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { DEFAULT_LOCALE, isLocale, tDynamic } from '@/lib/i18n/core'
import { migrateSnapshot } from '@/lib/project/snapshot'
import { stepProgress } from '@/lib/project/status'
import { KitchenHome } from './KitchenHome'

export const dynamic = 'force-dynamic'

function money(low: number | null, high: number | null, locale: string): string | null {
  if (low == null || high == null) return null
  const f = (n: number) => Math.round(n).toLocaleString(locale)
  return `${f(low)} – ${f(high)} €`
}

/**
 * The customer's one kitchen.
 *
 * requireProjectAccess lets in the project's customer and its maker, and
 * answers notFound() for anyone else — including a signed-in customer poking
 * at another project's id.
 */
export default async function KitchenPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const { session, project } = await requireProjectAccess(projectId)
  const locale = isLocale(session.locale) ? session.locale : DEFAULT_LOCALE

  const maker = project.makerId ? await findAccountById(project.makerId) : null
  const makerName = maker?.name || maker?.email || tDynamic('kitchen.home.yourMaker', locale)
  // The customer's own account, not the session's: when the maker looks in,
  // the contact step must still show the customer's address.
  const customer = project.customerId ? await findAccountById(project.customerId) : null

  const db = supabaseAdmin()
  if (!db) notFound()

  // The server's copy of the journey, so a sign-in on a different device picks
  // up where the last one left off. migrateSnapshot refuses a snapshot written
  // by newer code rather than reading it with older assumptions.
  const { data: snapRow } = await db.from(TABLES.projects).select('snapshot').eq('id', project.id).maybeSingle()
  const migrated = snapRow?.snapshot
    ? migrateSnapshot(snapRow.snapshot, project.snapshotVersion)
    : null
  const snapshot = migrated && migrated.ok ? migrated.snapshot : null

  // The brief, when there is one — it drives the status panel.
  let brief: { createdAt: string; makerViewedAt: string | null; low: number | null; high: number | null } | null = null
  if (project.currentBriefId) {
    const { data } = await db
      .from(TABLES.briefs)
      .select('created_at, maker_viewed_at, estimate_low, estimate_high')
      .eq('id', project.currentBriefId)
      .maybeSingle()
    if (data) {
      brief = {
        createdAt: data.created_at as string,
        makerViewedAt: (data.maker_viewed_at as string | null) ?? null,
        low: (data.estimate_low as number | null) ?? null,
        high: (data.estimate_high as number | null) ?? null,
      }
    }
  }

  const progress = stepProgress(project.step)
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : null)

  return (
    <KitchenHome
      projectId={project.id}
      makerName={makerName}
      stepLabel={
        progress
          ? `${tDynamic('dashboard.step', locale)
              .replace('{n}', String(progress.current))
              .replace('{total}', String(progress.total))}`
          : null
      }
      started={Boolean(project.step)}
      submittedAt={date(project.submittedAt)}
      makerViewedAt={date(brief?.makerViewedAt ?? null)}
      briefId={project.currentBriefId}
      range={money(brief?.low ?? null, brief?.high ?? null, locale)}
      revision={project.revision}
      readOnly={session.role !== 'customer'}
      snapshot={snapshot}
      customerEmail={customer?.email ?? null}
      customerName={customer?.name ?? null}
    />
  )
}
