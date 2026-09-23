'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ToggleRow } from '../ChipRow'
import type { BuilderState } from '@/lib/builder/inventory'

/**
 * One question — do we build in LED lighting. That is what moves the quote;
 * which layers and fixtures is a conversation with the maker (maker testing,
 * 2026-09-23).
 */
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
      <PickerSlot label={t('builder.groups.lighting.label')} meta={state.lighting.meta.led}>
        <ToggleRow
          label={t('lighting.ledLabel')}
          on={state.lighting.led}
          onChange={(on) =>
            onPatch({
              led: on,
              meta: { led: { confidence: 'H', provenance: 'homeowner-edited' } },
            })
          }
        />
      </PickerSlot>
    </div>
  )
}
