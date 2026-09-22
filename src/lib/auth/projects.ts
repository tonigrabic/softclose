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

/** The one kitchen a customer was invited to. Most recent first, in case a
 *  maker ever sends a second invite. */
export async function currentProjectForCustomer(customerId: string): Promise<Project | null> {
  const db = supabaseAdmin()
  if (!db) return null
  const { data } = await db
    .from(TABLES.projects)
    .select(COLUMNS)
    .eq('customer_id', customerId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? toProject(data as Parameters<typeof toProject>[0]) : null
}
