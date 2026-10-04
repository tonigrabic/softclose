import { apiAccount } from '@/lib/auth/dal'
import { unauthorized } from '@/lib/api/errors'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { resolveMedia, storageSigner } from '@/lib/db/media'
import { toCustomerBundle } from '@/lib/handoff/bundle'
import type { HandoffBundle } from '@/lib/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One answer for every "not yours / not there": the id's owner is not disclosed. */
const notFound = () => Response.json({ error: 'not_found' }, { status: 404 })

/**
 * The customer's own copy of their project's current brief (IMP-07): the
 * download on a revisit of the review, which no longer has a send's response
 * to save. Read only on that click.
 *
 * Only the project's customer: the maker reads briefs on their own pages
 * (requireBriefAccess). The stored bundle carries the maker-only money, so
 * it goes out through toCustomerBundle, like every handoff response; its
 * media are storage refs, swapped for short-lived signed links.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await apiAccount()
  if (!session) return unauthorized()

  const { id } = await ctx.params
  if (session.role !== 'customer' || !UUID_RE.test(id)) return notFound()

  const db = supabaseAdmin()
  if (!db) return notFound()

  const { data: project } = await db
    .from(TABLES.projects)
    .select('id, customer_id, current_brief_id')
    .eq('id', id)
    .maybeSingle()
  if (!project || project.customer_id !== session.accountId || !project.current_brief_id) return notFound()

  const briefId = project.current_brief_id as string
  const { data: brief } = await db.from(TABLES.briefs).select('id, bundle').eq('id', briefId).maybeSingle()
  if (!brief?.bundle) return notFound()

  const customer = toCustomerBundle({ ...(brief.bundle as HandoffBundle), briefId })
  const signer = storageSigner()
  const body = signer ? await resolveMedia(customer, signer) : customer
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}
