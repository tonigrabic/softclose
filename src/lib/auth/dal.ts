import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { findAccountById } from './accounts'
import { loginUrl } from './redirect'
import { SESSION_COOKIE, verifySession, type Role } from './session'

/**
 * The Data Access Layer: every guard in the app, in one file.
 *
 * Next's own proxy reference is blunt about why this exists — Server Functions
 * POST to whatever route they are used on, so a change to the proxy's matcher
 * can silently remove authorization from code that looked covered. The proxy
 * here only redirects; these functions are what actually decide.
 *
 * Two rules worth stating once:
 *
 *  - Not signed in → redirect. Signed in but not yours → `notFound()`, never
 *    403. A 403 confirms that the id exists, which is a free enumeration oracle
 *    against a table of real customers' kitchens.
 *  - Route handlers use `apiAccount()` and answer 401. A redirect to an HTML
 *    login page in response to a fetch() would surface in the intake as a
 *    parse error, which is how you get a bug report that says "it broke".
 */

export interface Session {
  accountId: string
  role: Role
  email: string
  name: string | null
  /** The account's preferred locale, for server components that render copy. */
  locale: string | null
}

/**
 * Cached per render pass, so a layout and its page do not each pay a round trip.
 *
 * Never throws and never redirects — callers decide. The DB read is not
 * optional: it is what makes `status = 'disabled'` and a bumped `session_epoch`
 * take effect immediately rather than whenever the cookie happens to expire.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies()
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!claims) return null

  const account = await findAccountById(claims.sub)
  if (!account) return null
  if (account.status !== 'active') return null
  if (account.sessionEpoch !== claims.epoch) return null

  return {
    accountId: account.id,
    role: account.role,
    email: account.email,
    name: account.name,
    locale: account.locale,
  }
})

/** The path the proxy saw, so a redirect to /login can come back here afterwards. */
async function currentPath(): Promise<string | null> {
  const h = await headers()
  return h.get('x-sc-path')
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(loginUrl(await currentPath()))
  return session
}

export async function requireMaker(): Promise<Session> {
  const session = await requireSession()
  if (session.role !== 'maker') notFound()
  return session
}

export async function requireCustomer(): Promise<Session> {
  const session = await requireSession()
  if (session.role !== 'customer') notFound()
  return session
}

/** Non-redirecting guard for route handlers. Null means "answer 401". */
export async function apiAccount(): Promise<Session | null> {
  return getSession()
}

export interface Project {
  id: string
  makerId: string | null
  customerId: string | null
  status: string
  step: string | null
  revision: number
  snapshotVersion: number
  currentBriefId: string | null
  openedAt: string | null
  submittedAt: string | null
  updatedAt: string
  title: string | null
}

const PROJECT_COLUMNS =
  'id, maker_id, customer_id, status, step, revision, snapshot_version, current_brief_id, opened_at, submitted_at, updated_at, title'

/** Deliberately excludes `snapshot`: on a list or a guard it is dead weight, and
 *  a snapshot is megabytes once renders are in it. */
interface ProjectRow {
  id: string
  maker_id: string | null
  customer_id: string | null
  status: string
  step: string | null
  revision: number
  snapshot_version: number
  current_brief_id: string | null
  opened_at: string | null
  submitted_at: string | null
  updated_at: string
  title: string | null
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    makerId: row.maker_id,
    customerId: row.customer_id,
    status: row.status,
    step: row.step,
    revision: row.revision,
    snapshotVersion: row.snapshot_version,
    currentBriefId: row.current_brief_id,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    title: row.title,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for the project's customer (who may edit) and its maker (who may look). */
export function canAccessProject(session: Session, project: { makerId: string | null; customerId: string | null }): boolean {
  if (session.role === 'customer') return project.customerId === session.accountId
  return project.makerId === session.accountId
}

export async function requireProjectAccess(projectId: string): Promise<{ session: Session; project: Project }> {
  const session = await requireSession()
  if (!UUID_RE.test(projectId)) notFound()
  const db = supabaseAdmin()
  if (!db) notFound()

  const { data } = await db.from(TABLES.projects).select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle()
  if (!data) notFound()
  const project = toProject(data as ProjectRow)
  if (!canAccessProject(session, project)) notFound()
  return { session, project }
}

export interface BriefRow {
  id: string
  createdAt: string
  bundle: unknown
  makerStatus: string
  makerViewedAt: string | null
  projectId: string | null
  makerId: string | null
}

/**
 * Briefs carry `maker_id` directly rather than being joined through their
 * project, so opening one is a single indexed lookup.
 *
 * A brief with no owner — the handful written before auth existed — is denied
 * to everyone. `npm run maker -- adopt` is the fix; an "ownerless means anyone"
 * rule would long outlive the five rows it was written for.
 */
export async function requireBriefAccess(briefId: string): Promise<{ session: Session; brief: BriefRow }> {
  const session = await requireSession()
  if (session.role !== 'maker') notFound()
  if (!UUID_RE.test(briefId)) notFound()
  const db = supabaseAdmin()
  if (!db) notFound()

  const { data } = await db
    .from(TABLES.briefs)
    .select('id, created_at, bundle, maker_status, maker_viewed_at, project_id, maker_id')
    .eq('id', briefId)
    .maybeSingle()
  if (!data) notFound()
  if (!data.maker_id || data.maker_id !== session.accountId) notFound()

  return {
    session,
    brief: {
      id: data.id as string,
      createdAt: data.created_at as string,
      bundle: data.bundle,
      makerStatus: data.maker_status as string,
      makerViewedAt: (data.maker_viewed_at as string | null) ?? null,
      projectId: (data.project_id as string | null) ?? null,
      makerId: (data.maker_id as string | null) ?? null,
    },
  }
}
