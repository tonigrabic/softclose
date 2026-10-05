import { notFound } from 'next/navigation'
import { requireProjectAccess } from '@/lib/auth/dal'
import { findAccountById } from '@/lib/auth/accounts'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { DEFAULT_LOCALE, isLocale, tDynamic } from '@/lib/i18n/core'
import { migrateSnapshot } from '@/lib/project/snapshot'
import { changedSinceBrief, stepProgress } from '@/lib/project/status'
import { isDecided, isProjectClosed } from '@/lib/project/decision'
import { resumeStepId } from '@/lib/flow'
import { roomStepDone } from '@/lib/floor-plan'
import { savedEstimate } from '@/lib/handoff/saved-estimate'
import { KitchenHome, type KitchenHomeProps } from './KitchenHome'

export const dynamic = 'force-dynamic'

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
  // The maker's own name, or null: the client words the fallback ("Tvoj
  // izrađivač" heading a sentence, "tvoj izrađivač" inside the range line).
  const makerName = maker?.name || maker?.email || null
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

  // The brief, when there is one — it drives the status panel, and since
  // IMP-03 it carries the maker's decision. `quoted_eur` is deliberately not
  // read: it is the maker's number for the works only, kept to measure the
  // range against, and the real quote with its terms comes from the maker.
  // Of the stored bundle only the estimate is read (one JSON path, never the
  // whole bundle): the range line states its assumptions next to the figures,
  // and a revisit of the review shows it with its lines (IMP-07). It holds
  // the maker-only money too, so it reaches the client only through
  // savedEstimate, which builds the customer's copy from known fields.
  let brief: {
    createdAt: string
    makerViewedAt: string | null
    estimate: KitchenHomeProps['savedEstimate']
    makerStatus: string
    decidedAt: string | null
    makerNote: string | null
  } | null = null
  if (project.currentBriefId) {
    const { data } = await db
      .from(TABLES.briefs)
      .select(
        'created_at, maker_viewed_at, estimate_low, estimate_high, estimate_all_in_low, estimate_all_in_high, band_pct, estimate:bundle->estimate, maker_status, decided_at, maker_note'
      )
      .eq('id', project.currentBriefId)
      .maybeSingle()
    if (data) {
      brief = {
        createdAt: data.created_at as string,
        makerViewedAt: (data.maker_viewed_at as string | null) ?? null,
        estimate: savedEstimate(data.estimate, {
          low: (data.estimate_low as number | null) ?? null,
          high: (data.estimate_high as number | null) ?? null,
          bandPct: (data.band_pct as number | null) ?? null,
          allInLow: (data.estimate_all_in_low as number | null) ?? null,
          allInHigh: (data.estimate_all_in_high as number | null) ?? null,
        }),
        makerStatus: data.maker_status as string,
        decidedAt: (data.decided_at as string | null) ?? null,
        makerNote: (data.maker_note as string | null) ?? null,
      }
    }
  }

  // The maker's answer on the current brief (rule 8: the homeowner learns the
  // outcome). The date goes as the stored timestamp; KitchenHome prints it.
  const decision =
    brief && isDecided(brief.makerStatus)
      ? {
          status: brief.makerStatus,
          date: brief.decidedAt,
          note: brief.makerNote,
        }
      : null
  // Closed: the maker declined, or the project was archived. The handoff
  // refuses a re-send (409) on exactly the same test — isProjectClosed, which
  // reads the declined brief even when the archive write after it failed — so
  // the home must not offer an edit that could never reach anyone.
  const closed = isProjectClosed(project.status, brief?.makerStatus)

  // Where the journey will actually resume — a journey saved past the room
  // step without a measured room goes back to it (IMP-31), and the label on
  // the continue button must say so.
  const resumeStep = project.step
    ? resumeStepId(project.step, {
        roomMeasured: roomStepDone(snapshot?.profile),
        contractConfirmed: Boolean(snapshot?.profile?.contractConfirmedAt),
      })
    : null
  const progress = stepProgress(resumeStep)
  // The works range as the brief stored it — the same figures the maker sees —
  // printed by the shared RangeLine. Null when the brief went out without a
  // build (IMP-01): the home then offers the builder instead of a number.
  const estimate = brief?.estimate ?? null
  const range: KitchenHomeProps['range'] = estimate
    ? {
        low: estimate.low,
        high: estimate.high,
        bandPct: estimate.bandPct ?? null,
        // Only known keys reach the client; a brief from before IMP-04 gets
        // the legacy list (installation in, no demolition, no trades, …).
        assumptions: estimate.assumptions,
      }
    : null

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
      // Timestamps, not labels: the home dates them in the language on screen,
      // which the viewer may have switched since signing in.
      submittedAt={project.submittedAt}
      makerViewedAt={brief?.makerViewedAt ?? null}
      briefId={project.currentBriefId}
      // The kitchen changed since the brief went out, and the changes were
      // not sent: the same test as the maker's "izmijenjeno" (0008).
      unsentChanges={changedSinceBrief(project.contentChangedAt, brief?.createdAt ?? null)}
      range={range}
      savedEstimate={estimate}
      decision={decision}
      closed={closed}
      revision={project.revision}
      readOnly={session.role !== 'customer'}
      snapshot={snapshot}
      customerEmail={customer?.email ?? null}
      customerName={customer?.name ?? null}
    />
  )
}
