'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ToggleRow } from '../ChipRow'
import type { BuilderState } from '@/lib/builder/inventory'

export function LightingGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['lighting']>) => void
}) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <PickerSlot label={t('builder.groups.lighting.label')} meta={state.lighting.meta.underCabinetLed}>
        <div className="space-y-2">
          <ToggleRow
            label={t('lighting.underCabinetLabel')}
            on={state.lighting.underCabinetLed}
            onChange={(on) =>
              onPatch({
                underCabinetLed: on,
                meta: {
                  ...state.lighting.meta,
                  underCabinetLed: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
          />
          <ToggleRow
            label={t('lighting.plinthLabel')}
            on={state.lighting.plinthLed}
            onChange={(on) =>
              onPatch({
                plinthLed: on,
                meta: {
                  ...state.lighting.meta,
                  plinthLed: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
          />
          <ToggleRow
            label={t('lighting.pendantLabel')}
            on={state.lighting.pendantOverIsland}
            onChange={(on) =>
              onPatch({
                pendantOverIsland: on,
                pendantCount: on && state.lighting.pendantCount === 0 ? 2 : state.lighting.pendantCount,
                meta: {
                  ...state.lighting.meta,
                  pendantOverIsland: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
          />
          <ToggleRow
            label={t('lighting.smartControlsLabel')}
            on={state.lighting.smartControls}
            onChange={(on) =>
              onPatch({
                smartControls: on,
                meta: {
                  ...state.lighting.meta,
                  smartControls: { confidence: 'H', provenance: 'homeowner-edited' },
                },
              })
            }
          />
        </div>

        {state.lighting.pendantOverIsland && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
            <span className="flex-1 text-[13px] font-medium text-foreground">
              {t('lighting.pendantCountLabel')}
            </span>
            <input
              type="number"
              min={0}
              max={6}
              value={state.lighting.pendantCount}
              onChange={(e) =>
                onPatch({
                  pendantCount: Math.max(0, Math.min(6, parseInt(e.target.value || '0', 10))),
                })
              }
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-[12px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
        )}
      </PickerSlot>
    </div>
  )
}
