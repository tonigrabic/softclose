'use client'

import { Sparkles, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import type { FieldMeta } from '@/lib/builder/inventory'

/**
 * Surfaces "AI suggested vs. you changed" affordance for any builder field.
 *
 * - High-confidence AI guesses get a subtle "AI suggested — confirm if right" tag.
 * - Low-confidence guesses get a stronger "change if wrong" callout.
 * - Once the user edits the value, we flip to "you changed" so the maker can
 *   see in the dashboard what the homeowner actively chose vs. accepted.
 */

interface PickerSlotProps {
  label: string
  meta: FieldMeta | undefined
  children: React.ReactNode
  /** Optional inline reason text from the hypothesis (kept short). */
  aiReason?: string
}

export function PickerSlot({ label, meta, children, aiReason }: PickerSlotProps) {
  const { t } = useTranslations()
  const provenance = meta?.provenance
  const confidence = meta?.confidence ?? 'L'

  const tone =
    provenance === 'homeowner-edited'
      ? 'edited'
      : provenance === 'homeowner-confirmed'
        ? 'confirmed'
        : confidence === 'L'
          ? 'low'
          : 'ai'

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card/60 p-4 transition-colors',
        tone === 'edited' && 'border-primary/40',
        tone === 'low' && 'border-amber-300/60',
        tone === 'ai' && 'border-border',
        tone === 'confirmed' && 'border-emerald-300/40'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Tag tone={tone} t={t} />
      </div>
      {children}
      {aiReason && tone !== 'edited' && (
        <p className="mt-2 text-[11px] italic text-muted-foreground/70">{aiReason}</p>
      )}
    </div>
  )
}

function Tag({ tone, t }: { tone: 'ai' | 'low' | 'confirmed' | 'edited'; t: ReturnType<typeof useTranslations>['t'] }) {
  const cls =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
  if (tone === 'edited') {
    return (
      <span className={cn(cls, 'bg-primary/10 text-primary')}>
        <Pencil className="size-2.5" />
        {t('builder.shell.youChanged')}
      </span>
    )
  }
  if (tone === 'low') {
    return (
      <span className={cn(cls, 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
        <Sparkles className="size-2.5" />
        {t('builder.shell.changeIfWrong')}
      </span>
    )
  }
  if (tone === 'confirmed') {
    return (
      <span className={cn(cls, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>{t('common.yes')}</span>
    )
  }
  return (
    <span className={cn(cls, 'bg-muted text-muted-foreground')}>
      <Sparkles className="size-2.5" />
      {t('builder.shell.aiSuggested')}
    </span>
  )
}
