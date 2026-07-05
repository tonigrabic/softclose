'use client'

/**
 * Cabinets — SPECIFICS ONLY. The cabinet layout (which units, patterns,
 * counts, the sink/dishwasher/oven slots) is the Part-1 contract: seeded once
 * by the unit assembler, edited only on the confirm-layout card, and shown
 * here as a locked recap with an "Edit layout" escape hatch. The one choice
 * that lives in the builder is the carcass material.
 *
 * (This screen used to re-seed and re-layer units with AI hints + forced
 * sink/hob placement — the source of the multi-sink bug and of estimates
 * diverging from the confirmed tally. That machinery is gone by design;
 * do not add unit editing back here.)
 */
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import { ContractRecap } from '../ContractRecap'
import type { BuilderState, CarcassMaterial } from '@/lib/builder/inventory'

const CARCASS_OPTIONS = [
  'white_melamine_standard',
  'colored_melamine',
  'moisture_resistant_p3',
  'matched_to_door',
] as const satisfies readonly CarcassMaterial[]

interface CabinetBoxesGroupProps {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['cabinetBoxes']>) => void
  /** Escape hatch back to Part 1's confirm_look (absent in the dev harness). */
  onEditLayout?: () => void
}

export function CabinetBoxesGroup({ state, onPatch, onEditLayout }: CabinetBoxesGroupProps) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <ContractRecap state={state} onEditLayout={onEditLayout} />

      <PickerSlot label={t('cabinetBoxes.carcassLabel')} meta={state.cabinetBoxes.meta.carcassMaterial}>
        <ChipRow
          keyPrefix="cabinetBoxes.carcass"
          values={CARCASS_OPTIONS}
          selected={state.cabinetBoxes.carcassMaterial}
          onChange={(v) =>
            onPatch({
              carcassMaterial: v,
              meta: {
                ...state.cabinetBoxes.meta,
                carcassMaterial: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>
    </div>
  )
}
