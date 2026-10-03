'use client'

import type { HandoffBundle } from '@/lib/types'
import { MakerDashboardPreview } from '@/components/kitchen-intake/MakerDashboardPreview'
import { useTranslations } from '@/lib/i18n'
import { isDecided } from '@/lib/project/decision'
import { DecisionChip, DecisionPanel, type DecisionView } from './DecisionPanel'

/** Client wrapper so the server page can hand a serialized bundle to the (stateful) dashboard. */
export function MakerBriefView({
  bundle,
  briefId,
  createdAt,
  decision,
}: {
  bundle: HandoffBundle
  briefId: string
  createdAt: string
  decision: DecisionView
}) {
  const { t, locale } = useTranslations()
  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {t('maker.header.received')
            .replace('{id}', briefId.slice(0, 8))
            .replace('{when}', new Date(createdAt).toLocaleString(locale))}
        </p>
        <DecisionChip decision={decision} />
      </div>
      {isDecided(decision.status) && decision.note ? (
        <p className="mt-1.5 max-w-2xl whitespace-pre-line border-l-2 border-slate-300 pl-2 text-xs leading-relaxed text-slate-600">
          {decision.note}
        </p>
      ) : null}
      <MakerDashboardPreview bundle={bundle} decisionSlot={<DecisionPanel briefId={briefId} decision={decision} />} />
    </main>
  )
}
