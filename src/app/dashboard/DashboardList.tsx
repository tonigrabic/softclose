'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { InviteForm } from './InviteForm'
import { useTranslations } from '@/lib/i18n'
import { needsAttention, type ProjectDisplayStatus } from '@/lib/project/status'
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
  range: string | null
  /** A brief the maker already advanced past "new" — so an edit after it matters. */
  quoted: boolean
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

function Row({ item }: { item: DashboardItem }) {
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
      {item.range ? <p className="hidden shrink-0 text-sm tabular-nums text-foreground sm:block">{item.range}</p> : null}
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
          STATUS_TONE[item.display]
        )}
      >
        {t(STATUS_KEY[item.display] as Parameters<typeof t>[0])}
        {item.display === 'changed_since_submit' && item.quoted ? ' · v2' : ''}
      </span>
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

  const attention = items.filter((i) => needsAttention(i.display))
  const active = items.filter((i) => i.display === 'in_progress' || i.display === 'opened')
  const waiting = items.filter((i) => i.display === 'invited')

  const groups: Array<[string, DashboardItem[]]> = [
    ['dashboard.group.attention', attention],
    ['dashboard.group.active', active],
    ['dashboard.group.waiting', waiting],
  ]

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
                  {t(key as Parameters<typeof t>[0])}
                </h2>
                <div className="space-y-2">
                  {group.map((item) => (
                    <Row key={item.projectId} item={item} />
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      )}

      <p className="mt-8 text-center text-[0.6875rem] text-muted-foreground">
        {t('dashboard.updated').replace('{when}', generatedAtLabel)}
      </p>
    </AuthShell>
  )
}
