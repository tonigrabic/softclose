import { notFound } from 'next/navigation'
import type { HandoffBundle } from '@/lib/types'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { MakerBriefView } from './MakerBriefView'

export const dynamic = 'force-dynamic'

/**
 * The maker's side of the product: one persisted brief, opened by its id.
 * No auth yet — the id is an unguessable uuid handed to the maker by email/
 * link. Opening it stamps maker_viewed_at so the homeowner-facing status can
 * later say "your designer has opened your brief" (AGENTS.md rule 8).
 */
export default async function MakerBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  if (!db) notFound()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const { data, error } = await db
    .from(TABLES.briefs)
    .select('id, created_at, bundle, maker_status, maker_viewed_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) notFound()

  if (!data.maker_viewed_at) {
    await db
      .from(TABLES.briefs)
      .update({ maker_viewed_at: new Date().toISOString(), maker_status: data.maker_status === 'new' ? 'viewed' : data.maker_status })
      .eq('id', id)
  }

  return <MakerBriefView bundle={data.bundle as HandoffBundle} briefId={data.id as string} createdAt={data.created_at as string} />
}
