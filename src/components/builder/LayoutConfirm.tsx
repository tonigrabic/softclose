'use client'

import { useMemo } from 'react'
import { Check, Ruler, CornerUpRight } from 'lucide-react'
import { useTranslations, type Locale } from '@/lib/i18n'
import { formatLength } from '@/lib/floor-plan'
import type { LayoutContract } from '@/lib/contract/layout-contract'
import { suggestCabinetsForRun } from '@/lib/builder/cabinet-suggest'

/**
 * Layout-counts confirmation gate. Before the homeowner refines anything, they
 * confirm WHAT we counted from their Part-1 floor plan: the wall runs and their
 * lengths, the cabinet tally per run, the fixed appliances, and how many corner
 * units. Nothing is priced off counts they haven't signed off on. Calm, no
 * urgency — they can change every number in the steps that follow.
 */
const APPLIANCE_LABEL: Record<Locale, Record<string, string>> = {
  'hr-HR': { sink: 'Sudoper', hob: 'Ploča za kuhanje', fridge: 'Hladnjak', dishwasher: 'Perilica posuđa' },
  'en-US': { sink: 'Sink', hob: 'Hob', fridge: 'Fridge', dishwasher: 'Dishwasher' },
}

const ROW_LABEL: Record<Locale, { base: string; wall: string; tall: string }> = {
  'hr-HR': { base: 'donjih', wall: 'gornjih', tall: 'visokih' },
  'en-US': { base: 'base', wall: 'wall', tall: 'tall' },
}

export function LayoutConfirm({
  contract,
  onConfirm,
}: {
  contract: LayoutContract
  /** When provided, renders a confirm CTA; omit to render a read-only summary. */
  onConfirm?: () => void
}) {
  const { t, locale } = useTranslations()

  const rows = useMemo(
    () =>
      contract.runs.map((run) => {
        const units = suggestCabinetsForRun(run, { hasCorner: run.hasCorner })
        return {
          id: run.id,
          label: run.label,
          lengthCm: run.lengthCm,
          base: units.filter((u) => u.type === 'base').length,
          wall: units.filter((u) => u.type === 'wall').length,
          tall: units.filter((u) => u.type === 'tall').length,
        }
      }),
    [contract.runs]
  )

  const totalCabinets = rows.reduce((s, r) => s + r.base + r.wall + r.tall, 0)
  const cornerCount = contract.corners.length
  const rowWords = ROW_LABEL[locale]
  const applianceWords = APPLIANCE_LABEL[locale]

  return (
    <section className="space-y-6 rounded-3xl border border-border bg-card/60 p-6 md:p-8">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          {t('builder.confirm.eyebrow')}
        </p>
        <h2 className="text-2xl font-semibold leading-tight text-foreground md:text-3xl">
          {t('builder.confirm.title')}
        </h2>
        <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
          {t('builder.confirm.subtitle')}
        </p>
      </header>

      {/* Runs + cabinet tally */}
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Ruler className="size-3.5 stroke-[2.5]" aria-hidden />
          {t('builder.confirm.runsHeading')}
        </h3>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-background">
          {rows.map((r) => {
            const parts = [
              `${r.base} ${rowWords.base}`,
              r.wall > 0 ? `${r.wall} ${rowWords.wall}` : null,
              r.tall > 0 ? `${r.tall} ${rowWords.tall}` : null,
            ].filter(Boolean)
            return (
              <li key={r.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">{r.label}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {r.base + r.wall + r.tall} {t('builder.confirm.cabinetsUnit')} · {parts.join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                  {formatLength(r.lengthCm, contract.units)}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="px-1 text-[12px] text-muted-foreground">
          {t('builder.confirm.totalPrefix')}{' '}
          <span className="font-semibold text-foreground">
            {totalCabinets} {t('builder.confirm.cabinetsUnit')}
          </span>
          {cornerCount > 0 && (
            <>
              {' '}
              <CornerUpRight className="inline size-3.5 -translate-y-px stroke-[2.5] text-muted-foreground" aria-hidden />{' '}
              <span className="font-semibold text-foreground">{cornerCount}</span> {t('builder.confirm.cornersHeading')}
            </>
          )}
        </p>
      </div>

      {/* Appliances */}
      <div className="space-y-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('builder.confirm.appliancesHeading')}
        </h3>
        {contract.appliances.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {contract.appliances.map((a, i) => (
              <li
                key={`${a.kind}-${i}`}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[12px] text-foreground"
              >
                {applianceWords[a.kind] ?? a.kind}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">{t('builder.confirm.none')}</p>
        )}
      </div>

      {/* Confirm CTA — only when used as a standalone gate; omitted when embedded
          in the capture "confirm everything" step (the step's own button locks it). */}
      {onConfirm && (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-[1.06]"
          >
            <Check className="size-4 stroke-[2.5]" aria-hidden />
            {t('builder.confirm.cta')}
          </button>
          <p className="text-[12px] leading-relaxed text-muted-foreground">{t('builder.confirm.editHint')}</p>
        </div>
      )}
    </section>
  )
}
