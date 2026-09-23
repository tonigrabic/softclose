'use client'

import { findDecor } from '@/lib/catalog'
import { useTranslations, tDynamic } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import type { BacksplashKind, BuilderState } from '@/lib/builder/inventory'

const KIND_OPTIONS = [
  'matching_slab',
  'tile',
  'glass',
  'other',
  'none',
] as const satisfies readonly BacksplashKind[]

/**
 * Wall cladding (zidna obloga) — the type is the choice; the height is the
 * maker's to measure. "In the worktop's decor" follows the worktop, so there
 * is no second decor to pick; "other" takes the decor in the homeowner's words.
 */
export function BacksplashGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['backsplash']>) => void
}) {
  const { t, locale } = useTranslations()
  const worktopDecor = state.worktop.decorCode
    ? findDecor(state.worktop.decorCode, state.worktop.decorStructure)
    : null
  const worktopDecorName = worktopDecor
    ? `${locale === 'en-US' && worktopDecor.nameEn ? worktopDecor.nameEn : worktopDecor.name} (${worktopDecor.code} ${worktopDecor.structure})`
    : tDynamic(`worktop.family.${state.worktop.family}`, locale)

  return (
    <div className="space-y-5">
      <PickerSlot label={t('backsplash.kindLabel')} meta={state.backsplash.meta.kind}>
        <ChipRow
          keyPrefix="backsplash.kind"
          values={KIND_OPTIONS}
          selected={state.backsplash.kind}
          onChange={(v) =>
            onPatch({
              kind: v,
              meta: { kind: { confidence: 'H', provenance: 'homeowner-edited' } },
            })
          }
        />
      </PickerSlot>

      {state.backsplash.kind === 'matching_slab' && (
        <p className="rounded-xl border border-border bg-card/50 px-3 py-2 text-[13px] text-muted-foreground">
          {t('backsplash.matchingNote')}{' '}
          <span className="font-medium text-foreground">{worktopDecorName}</span>
        </p>
      )}

      {state.backsplash.kind === 'other' && (
        <PickerSlot label={t('backsplash.otherLabel')} meta={state.backsplash.meta.kind}>
          <input
            type="text"
            value={state.backsplash.otherDecor ?? ''}
            maxLength={120}
            placeholder={t('backsplash.otherPlaceholder')}
            onChange={(e) => onPatch({ otherDecor: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </PickerSlot>
      )}
    </div>
  )
}
