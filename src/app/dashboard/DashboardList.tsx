'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { InviteForm } from './InviteForm'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
import { RangeLine, type RangeLineValue } from '@/components/range/RangeLine'
import type { MakerDecision } from '@/lib/project/decision'
import type { DashboardGroup, ProjectDisplayStatus } from '@/lib/project/status'
import { cn } from '@/lib/utils'

export interface DashboardItem {
  projectId: string
  customerName: string
  customerEmail: string
  display: ProjectDisplayStatus
  stepLabel: string | null
  /** Pre-formatted on the server — see the note on DashboardList. */
  updatedLabel: string
  briefId: string | null
  /** The current brief's works range; null before a brief or without a build. */
  range: RangeLineValue | null
  /** The maker formally quoted the current brief — so an edit after it is a v2. */
  quoted: boolean
  /** The maker's decision on the current brief, if any (IMP-03). */
  decision: MakerDecision | null
  /** Pre-formatted on the server; set only when quoted: "6.200 €". */
  quotedLabel: string | null
  /** Where the row sits in the list — see dashboardGroup(). */
  group: DashboardGroup
}

const STATUS_KEY: Record<ProjectDisplayStatus, string> = {
  invited: 'dashboard.status.invited',
  opened: 'dashboard.status.opened',
  in_progress: 'dashboard.status.inProgress',
  submitted: 'dashboard.status.submitted',
  changed_since_submit: 'dashboard.status.changed',
  archived: 'dashboard.status.archived',
}

const STATUS_TONE: Record<ProjectDisplayStatus, string> = {
  invited: 'bg-muted text-muted-foreground',
  opened: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  submitted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  changed_since_submit: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  archived: 'bg-muted text-muted-foreground',
}

const DECISION_KEY: Record<MakerDecision, TranslationKey> = {
  quoted: 'dashboard.decision.quoted',
  clarify: 'dashboard.decision.clarify',
  declined: 'dashboard.decision.declined',
}

const DECISION_TONE: Record<MakerDecision, string> = {
  quoted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  clarify: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  declined: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
}

const chipClass = 'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium'

/** One project in the list. Exported for the static render test. */
export function DashboardListRow({ item }: { item: DashboardItem }) {
  const { t } = useTranslations()
  // Mid-flow there is no brief to open; the live view is the destination.
  const href = item.briefId ? `/maker/${item.briefId}` : `/dashboard/project/${item.projectId}`

  return (
    <a
      href={href}
      className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/15"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.customerName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.stepLabel ? `${item.stepLabel} · ` : ''}
          {item.updatedLabel}
        </p>
      </div>
      {/* The one range line (IMP-04), compact, in the maker's voice. Spans
          only, so it is valid inside this link. */}
      <RangeLine
        range={item.range}
        voice="maker"
        size="compact"
        className="hidden w-56 shrink-0 sm:block lg:w-72"
      />
      {item.decision ? (
        <span className={cn(chipClass, DECISION_TONE[item.decision])}>
          {t(DECISION_KEY[item.decision]).replace('{amount}', item.quotedLabel ?? '—')}
        </span>
      ) : null}
      {/* "arhivirano" next to "odbijeno" says the same thing twice. */}
      {item.display === 'archived' && item.decision === 'declined' ? null : (
        <span className={cn(chipClass, STATUS_TONE[item.display])}>
          {t(STATUS_KEY[item.display] as Parameters<typeof t>[0])}
          {item.display === 'changed_since_submit' && item.quoted ? ' · v2' : ''}
        </span>
      )}
    </a>
  )
}

/**
 * Every time on this screen is formatted on the SERVER and passed down as a
 * string.
 *
 * Formatting them here instead would mismatch on hydration — the server's clock
 * and timezone are not the viewer's — and there is no upside: `router.refresh()`
 * re-runs the server component, so the labels refresh with everything else.
 */
export function DashboardList({
  items,
  makerName,
  generatedAtLabel,
}: {
  items: DashboardItem[]
  makerName: string
  generatedAtLabel: string
}) {
  const { t } = useTranslations()
  const router = useRouter()


  // Refresh-on-load plus a slow tick, and only while the tab is actually being
  // looked at. A maker leaves this open all day; polling a hidden tab would
  // burn function invocations to show nobody anything.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }, 30_000)
    return () => clearInterval(tick)
  }, [router])

  const inGroup = (g: DashboardGroup) => items.filter((i) => i.group === g)
  const groups: Array<[TranslationKey, DashboardItem[]]> = [
    ['dashboard.group.attention', inGroup('attention')],
    ['dashboard.group.decided', inGroup('decided')],
    ['dashboard.group.active', inGroup('active')],
    ['dashboard.group.waiting', inGroup('waiting')],
  ]
  // Declined and archived projects: kept, out of the way. The archive toggle
  // and counts are IMP-18.
  const closed = inGroup('closed')

  return (
    <AuthShell wide signedIn>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{makerName}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('dashboard.subtitle').replace('{n}', String(items.length))}
          </p>
        </div>
        <button type="button" onClick={() => router.refresh()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          {t('dashboard.refresh')}
        </button>
      </div>

      <InviteForm />

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">{t('dashboard.empty.title')}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t('dashboard.empty.body')}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {groups.map(([key, group]) =>
            group.length ? (
              <section key={key}>
                <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(key)}
                </h2>
                <div className="space-y-2">
                  {group.map((item) => (
                    <DashboardListRow key={item.projectId} item={item} />
                  ))}
                </div>
              </section>
            ) : null
          )}
          {closed.length ? (
            <details className="group">
              <summary className="mb-2 cursor-pointer list-none text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                {t('dashboard.group.closed')}
              </summary>
              <div className="space-y-2">
                {closed.map((item) => (
                  <DashboardListRow key={item.projectId} item={item} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}

      <p className="mt-8 text-center text-[0.6875rem] text-muted-foreground">
        {t('dashboard.updated').replace('{when}', generatedAtLabel)}
      </p>
    </AuthShell>
  )
}
