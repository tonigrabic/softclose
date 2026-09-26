'use client'

import { ArrowLeft } from 'lucide-react'
import { MakerDashboardPreview } from '@/components/kitchen-intake/MakerDashboardPreview'
import { AuthShell } from '@/components/AuthShell'
import { useTranslations } from '@/lib/i18n'
import type { HandoffBundle } from '@/lib/types'

/**
 * A brief the customer is still writing.
 *
 * `MakerDashboardPreview` is reused untouched: it needs a complete-SHAPED
 * bundle, not complete content — every section of it is already conditionally
 * rendered — so a bundle built from a half-finished snapshot renders correctly
 * at any point in the flow.
 *
 * The warning lives in this wrapper rather than being threaded as a prop
 * through those 865 lines, which keeps that component's diff at zero.
 *
 * One hard rule: no quote / clarify / decline actions here. A mid-flow ±20%
 * range is computed from an incomplete build, and a maker quoting off it would
 * break AGENTS.md rule 6 (never a committed number). Those actions belong on
 * the submitted brief and nowhere else.
 */
export function LiveProjectView({
  bundle,
  customerName,
  stepLabel,
  updatedLabel,
}: {
  bundle: HandoffBundle
  customerName: string
  stepLabel: string | null
  updatedLabel: string
}) {
  const { t } = useTranslations()

  return (
    <AuthShell wide signedIn>
      <a
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t('live.back')}
      </a>

      <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('live.banner.title')}</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
          {t('live.banner.body')}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{customerName}</h1>
        <p className="text-xs text-muted-foreground">
          {stepLabel ? `${stepLabel} · ` : ''}
          {updatedLabel}
        </p>
      </div>

      <MakerDashboardPreview bundle={bundle} hideActions />
    </AuthShell>
  )
}
