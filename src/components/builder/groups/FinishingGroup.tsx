'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import type { BuilderState, PlinthMaterial } from '@/lib/builder/inventory'

const HEIGHT_OPTIONS = [100, 150] as const
const PLINTH_MATERIAL_OPTIONS = ['wood', 'plastic'] as const satisfies readonly PlinthMaterial[]

export function FinishingGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['finishing']>) => void
}) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <PickerSlot label={t('finishing.plinthHeightLabel')} meta={state.finishing.meta.plinthHeightMm}>
        <div className="flex flex-wrap gap-1.5">
          {HEIGHT_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() =>
                onPatch({
                  plinthHeightMm: h,
                  meta: {
                    ...state.finishing.meta,
                    plinthHeightMm: { confidence: 'H', provenance: 'homeowner-edited' },
                  },
                })
              }
              className={
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ' +
                (state.finishing.plinthHeightMm === h
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground')
              }
            >
              {h} mm
            </button>
          ))}
        </div>
      </PickerSlot>

      <PickerSlot label={t('finishing.plinthMaterialLabel')} meta={state.finishing.meta.plinthMaterial}>
        <ChipRow
          keyPrefix="finishing.plinthMaterial"
          values={PLINTH_MATERIAL_OPTIONS}
          selected={state.finishing.plinthMaterial}
          onChange={(v) =>
            onPatch({
              plinthMaterial: v,
              meta: {
                ...state.finishing.meta,
                plinthMaterial: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>
    </div>
  )
}
