import 'server-only'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { toProject, type Project } from './dal'

export interface CreateProjectInput {
  makerId: string
  customerId: string
  title?: string | null
  locale?: string | null
}

const COLUMNS =
  'id, maker_id, customer_id, status, step, revision, snapshot_version, current_brief_id, opened_at, submitted_at, updated_at, title'

export async function createProject(input: CreateProjectInput): Promise<Project | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from(TABLES.projects)
    .insert({
      maker_id: input.makerId,
      customer_id: input.customerId,
      title: input.title ?? null,
      locale: input.locale ?? null,
      status: 'invited',
    })
    .select(COLUMNS)
    .single()
  if (error) {
    console.error('[auth] createProject failed', error.message)
    return null
  }
  return toProject(data as Parameters<typeof toProject>[0])
}

/**
 * Stamp the first open of an invite.
 *
 * Mirrors what `/maker/[id]` already does with `maker_viewed_at`, and gives the
 * maker's list the distinction that actually matters to them: invited and never
 * opened (chase it) versus opened and stalled (something in the flow lost them).
 */
export async function markProjectOpened(projectId: string): Promise<void> {
  const db = supabaseAdmin()
  if (!db) return
  await db
    .from(TABLES.projects)
    .update({ opened_at: new Date().toISOString(), status: 'in_progress' })
    .eq('id', projectId)
    .is('opened_at', null)
}

export async function listProjectsForMaker(makerId: string, limit = 100): Promise<Project[]> {
  const db = supabaseAdmin()
  if (!db) return []
  // Never selects `snapshot` — it is megabytes once renders land in it, and the
  // list needs none of it.
  const { data, error } = await db
    .from(TABLES.projects)
    .select(COLUMNS)
    .eq('maker_id', makerId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[auth] listProjectsForMaker failed', error.message)
    return []
  }
  return (data ?? []).map((row) => toProject(row as Parameters<typeof toProject>[0]))
}

/**
 * The one kitchen a customer was invited to. Most recent first, in case a
 * maker ever sends a second invite.
 *
 * An open project always wins. Failing that, the latest archived one: a
 * maker's decline archives the project (IMP-03), and the customer must land on
 * their kitchen with the maker's answer on it — not on "Nema aktivne
 * kuhinje", which would be the ghosting rule 8 forbids, just quieter.
 */
export async function currentProjectForCustomer(customerId: string): Promise<Project | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const latest = (archived: boolean) => {
    const q = db.from(TABLES.projects).select(COLUMNS).eq('customer_id', customerId)
    return (archived ? q.eq('status', 'archived') : q.neq('status', 'archived'))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }
  const { data: open } = await latest(false)
  if (open) return toProject(open as Parameters<typeof toProject>[0])
  const { data: closed } = await latest(true)
  return closed ? toProject(closed as Parameters<typeof toProject>[0]) : null
}

export interface DashboardRow {
  project: Project
  customer: { id: string; email: string; name: string | null } | null
  brief: {
    id: string
    createdAt: string
    makerStatus: string
    estimateLow: number | null
    estimateHigh: number | null
    bandPct: number | null
    /**
     * What the range assumes (`BomAssumption` keys), read from the stored
     * bundle by one JSON path. Raw: null on a brief from before IMP-04 or one
     * sent without a build; the page normalises it (`normalizeAssumptions`).
     */
    assumptions: unknown
    /** When the maker quoted, asked or declined (0007). */
    decidedAt: string | null
    /** The maker's quote for the works, in euros; set only when quoted (0007). */
    quotedEur: number | null
  } | null
}

/**
 * Everything the maker's list needs, in three flat queries.
 *
 * Three rather than one embedded select on purpose: `softclose_projects` has
 * two foreign keys into `softclose_accounts` (maker and customer), which makes
 * an embed ambiguous and dependent on PostgREST's schema cache. Three indexed
 * lookups are boring and predictable.
 *
 * None of them select `snapshot`. That column is the whole journey including
 * render references, and pulling it for a list of a hundred projects is the
 * difference between a 40 KB response and a 30 MB one.
 */
export async function listMakerDashboard(makerId: string, limit = 100): Promise<DashboardRow[]> {
  const db = supabaseAdmin()
  if (!db) return []

  const projects = await listProjectsForMaker(makerId, limit)
  if (!projects.length) return []

  const customerIds = [...new Set(projects.map((p) => p.customerId).filter((id): id is string => Boolean(id)))]
  const briefIds = [...new Set(projects.map((p) => p.currentBriefId).filter((id): id is string => Boolean(id)))]

  const [{ data: accounts }, { data: briefs }] = await Promise.all([
    customerIds.length
      ? db.from(TABLES.accounts).select('id, email, name').in('id', customerIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    briefIds.length
      ? db
          .from(TABLES.briefs)
          // One JSON path out of the bundle (the range line's assumptions),
          // never the bundle itself: it carries the whole build and transcript.
          .select(
            'id, created_at, maker_status, estimate_low, estimate_high, band_pct, assumptions:bundle->estimate->assumptions, decided_at, quoted_eur'
          )
          .in('id', briefIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const byAccount = new Map((accounts ?? []).map((a) => [a.id as string, a]))
  const byBrief = new Map((briefs ?? []).map((b) => [b.id as string, b]))

  return projects.map((project) => {
    const a = project.customerId ? byAccount.get(project.customerId) : undefined
    const b = project.currentBriefId ? byBrief.get(project.currentBriefId) : undefined
    return {
      project,
      customer: a
        ? { id: a.id as string, email: a.email as string, name: (a.name as string | null) ?? null }
        : null,
      brief: b
        ? {
            id: b.id as string,
            createdAt: b.created_at as string,
            makerStatus: b.maker_status as string,
            estimateLow: (b.estimate_low as number | null) ?? null,
            estimateHigh: (b.estimate_high as number | null) ?? null,
            bandPct: (b.band_pct as number | null) ?? null,
            assumptions: b.assumptions ?? null,
            decidedAt: (b.decided_at as string | null) ?? null,
            // numeric(12,2): PostgREST may hand it back as a string (see dal.ts).
            quotedEur: b.quoted_eur === null || b.quoted_eur === undefined ? null : Number(b.quoted_eur),
          }
        : null,
    }
  })
}
