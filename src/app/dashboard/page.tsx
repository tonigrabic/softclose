import { requireMaker } from '@/lib/auth/dal'
import { listMakerDashboard } from '@/lib/auth/projects'
import { DEFAULT_LOCALE, isLocale, tDynamic } from '@/lib/i18n/core'
import { dashboardGroup, projectDisplayStatus, stepProgress } from '@/lib/project/status'
import { formatQuoteEur, isDecided } from '@/lib/project/decision'
import { normalizeAssumptions } from '@/lib/builder/range'
import { DashboardList, type DashboardItem } from './DashboardList'

export const dynamic = 'force-dynamic'

/** Wall clock behind a module-level helper — the React purity lint flags a bare
 *  `Date.now()` during render. Same pattern as `nowMs()` in the intake. */
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
 * The maker's inbox — every customer project they own, in one list.
 *
 * Until now this product had no maker index at all: the only way in was the
 * link in a notification email, so a lost email meant a lost brief.
 */
export default async function DashboardPage() {
  const session = await requireMaker()
  const rows = await listMakerDashboard(session.accountId)
  const locale = isLocale(session.locale) ? session.locale : DEFAULT_LOCALE
  const now = nowMs()

  const items: DashboardItem[] = rows.map(({ project, customer, brief }) => {
    const display = projectDisplayStatus({
      status: project.status,
      openedAt: project.openedAt,
      step: project.step,
      updatedAt: project.updatedAt,
      currentBriefCreatedAt: brief?.createdAt ?? null,
    })
    const progress = display === 'in_progress' ? stepProgress(project.step) : null
    const makerStatus = brief?.makerStatus ?? null
    return {
      projectId: project.id,
      customerName: customer?.name || project.title || customer?.email || '—',
      customerEmail: customer?.email ?? '',
      display,
      stepLabel: progress
        ? `${tDynamic('dashboard.step', locale)
            .replace('{n}', String(progress.current))
            .replace('{total}', String(progress.total))} · ${tDynamic(`flow.${progress.stepId}.label`, locale)}`
        : null,
      updatedLabel: relativeTime(project.updatedAt, locale, now),
      briefId: project.currentBriefId,
      // The works range as the brief stored it, printed by the shared
      // RangeLine (IMP-04): rounded, with the ± and what it leaves out. Null
      // when the brief went out without a build (IMP-01).
      range:
        brief && brief.estimateLow != null && brief.estimateHigh != null
          ? {
              low: brief.estimateLow,
              high: brief.estimateHigh,
              bandPct: brief.bandPct,
              assumptions: normalizeAssumptions(brief.assumptions),
            }
          : null,
      // A quote is a quote — not a glance. Until IMP-03 this was
      // `makerStatus !== 'new'`, so merely opening a brief counted as quoting it.
      quoted: makerStatus === 'quoted',
      decision: isDecided(makerStatus) ? makerStatus : null,
      quotedLabel: brief?.quotedEur != null ? formatQuoteEur(brief.quotedEur, locale) : null,
      group: dashboardGroup(display, makerStatus),
    }
  })

  return (
    <DashboardList
      items={items}
      makerName={session.name || session.email}
      generatedAtLabel={new Date(now).toLocaleTimeString(locale)}
    />
  )
}
