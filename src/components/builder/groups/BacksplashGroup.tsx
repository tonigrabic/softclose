'use client'

import { useMemo } from 'react'
import { decorsByUse } from '@/lib/catalog'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import { DecorSwatch } from '../DecorSwatch'
import type { BacksplashKind, BuilderState } from '@/lib/builder/inventory'

const KIND_OPTIONS = [
  'matching_slab',
  'tile',
  'glass',
  'wall_panel',
  'painted',
  'none',
] as const satisfies readonly BacksplashKind[]

const HEIGHT_OPTIONS = [60, 90, 120, 150] as const

export function BacksplashGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['backsplash']>) => void
}) {
  const { t, locale } = useTranslations()
  const decorOptions = useMemo(() => decorsByUse('backsplash'), [])
  const showDecor = state.backsplash.kind === 'matching_slab' || state.backsplash.kind === 'wall_panel'

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
              meta: {
                ...state.backsplash.meta,
                kind: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      {state.backsplash.kind !== 'none' && (
        <PickerSlot label={t('backsplash.heightLabel')} meta={state.backsplash.meta.heightCm}>
          <div className="flex flex-wrap gap-1.5">
            {HEIGHT_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() =>
                  onPatch({
                    heightCm: h,
                    meta: {
                      ...state.backsplash.meta,
                      heightCm: { confidence: 'H', provenance: 'homeowner-edited' },
                    },
                  })
                }
                className={
                  'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ' +
                  (state.backsplash.heightCm === h
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground')
                }
              >
                {h} cm
              </button>
            ))}
          </div>
        </PickerSlot>
      )}

      {showDecor && (
        <PickerSlot label={t('worktop.decorLabel')} meta={state.backsplash.meta.decorCode}>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
            {decorOptions.map((d) => (
              <DecorSwatch
                key={`${d.code}-${d.structure}`}
                code={d.code}
                structure={d.structure}
                size="md"
                selected={state.backsplash.decorCode === d.code && state.backsplash.decorStructure === d.structure}
                onClick={() =>
                  onPatch({
                    decorCode: d.code,
                    decorStructure: d.structure,
                    meta: {
                      ...state.backsplash.meta,
                      decorCode: { confidence: 'H', provenance: 'homeowner-edited' },
                    },
                  })
                }
                showLabel
                label={locale === 'en-US' && d.nameEn ? d.nameEn : d.name}
              />
            ))}
          </div>
        </PickerSlot>
      )}
    </div>
  )
}
