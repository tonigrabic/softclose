import { notFound } from 'next/navigation'
import { requireProjectAccess } from '@/lib/auth/dal'
import { findAccountById } from '@/lib/auth/accounts'
import { supabaseAdmin, TABLES } from '@/lib/db/supabase'
import { buildHandoffBundle } from '@/lib/handoff/bundle'
import { DEFAULT_LOCALE, isLocale, tDynamic } from '@/lib/i18n/core'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import { stepProgress } from '@/lib/project/status'
import { LiveProjectView } from './LiveProjectView'

export const dynamic = 'force-dynamic'

function nowMs(): number {
  return Date.now()
}

function relativeTime(iso: string, locale: string, now: number): string {
  const mins = Math.round((now - Date.parse(iso)) / 60000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (mins < 1) return rtf.format(0, 'minute')
  if (mins < 60) return rtf.format(-mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

/**
 * What the maker can see while the customer is still working.
 *
 * The bundle is built from the live snapshot through `buildHandoffBundle` —
 * the SAME function the submitted brief uses — so the live range and the
 * brief's range can never disagree. Two code paths computing an estimate two
 * ways is how the ±20% promise quietly breaks.
 */
export default async function LiveProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, project } = await requireProjectAccess(id)
  if (session.role !== 'maker') notFound()

  const locale = isLocale(session.locale) ? session.locale : DEFAULT_LOCALE
  const db = supabaseAdmin()
  if (!db) notFound()

  const { data } = await db.from(TABLES.projects).select('snapshot').eq('id', id).maybeSingle()
  const snapshot = (data?.snapshot ?? null) as ProjectSnapshot | null
  if (!snapshot) notFound()

  const customer = project.customerId ? await findAccountById(project.customerId) : null
  const progress = stepProgress(project.step)

  // Images are not in the snapshot by design (checkpoints are image-free), so
  // what the maker sees mid-flow is the structure: layout, picks, scope, range.
  const bundle = buildHandoffBundle({
    brief: snapshot.profile,
    transcript: snapshot.transcript,
  })

  return (
    <LiveProjectView
      bundle={bundle}
      customerName={customer?.name || project.title || customer?.email || '—'}
      stepLabel={
        progress
          ? `${tDynamic('dashboard.step', locale)
              .replace('{n}', String(progress.current))
              .replace('{total}', String(progress.total))} · ${tDynamic(`flow.${progress.stepId}.label`, locale)}`
          : null
      }
      updatedLabel={relativeTime(project.updatedAt, locale, nowMs())}
    />
  )
}
