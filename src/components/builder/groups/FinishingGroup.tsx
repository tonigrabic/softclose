'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import type { BuilderState, CorniceStyle, PlinthMaterial } from '@/lib/builder/inventory'

const HEIGHT_OPTIONS = [100, 120, 150] as const
const PLINTH_MATERIAL_OPTIONS = [
  'matched_door',
  'matched_floor',
  'black_recessed',
  'metal_strip',
] as const satisfies readonly PlinthMaterial[]
const CORNICE_OPTIONS = [
  'none',
  'flat',
  'crown',
  'custom_match_door',
] as const satisfies readonly CorniceStyle[]

export function FinishingGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['finishing']>) => void
}) {
  const { t } = useTranslations()
  // A cornice is top trim on wall units — only offer it if any run has them.
  const hasWall = state.layout.runs.some((r) => r.hasWall)

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

      {hasWall && (
        <PickerSlot label={t('finishing.corniceLabel')} meta={state.finishing.meta.corniceStyle}>
          <ChipRow
            keyPrefix="finishing.cornice"
            values={CORNICE_OPTIONS}
            selected={state.finishing.corniceStyle}
            onChange={(v) =>
              onPatch({
                corniceStyle: v,
                meta: {
                  ...state.finishing.meta,
                  corniceStyle: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
          />
        </PickerSlot>
      )}

      <div className="grid grid-cols-2 gap-3">
        <PickerSlot label={t('finishing.endPanelsLabel')} meta={state.finishing.meta.endPanelsCount}>
          <input
            type="number"
            min={0}
            max={10}
            value={state.finishing.endPanelsCount}
            onChange={(e) =>
              onPatch({
                endPanelsCount: Math.max(0, parseInt(e.target.value || '0', 10)),
                meta: {
                  ...state.finishing.meta,
                  endPanelsCount: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </PickerSlot>
        <PickerSlot label={t('finishing.openShelvingLabel')} meta={state.finishing.meta.openShelvingMeters}>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={state.finishing.openShelvingMeters}
            onChange={(e) =>
              onPatch({
                openShelvingMeters: Math.max(0, parseFloat(e.target.value || '0')),
                meta: {
                  ...state.finishing.meta,
                  openShelvingMeters: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </PickerSlot>
      </div>
    </div>
  )
}
