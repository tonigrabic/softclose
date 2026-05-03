'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import { SchachermayerBrowse } from '../SchachermayerBrowse'
import { searchSchachermayer } from '@/lib/catalog/hardware'
import type {
  BuilderState,
  DrawerSystemTier,
  HingeType,
  HandleStyle,
  HandleFinish,
} from '@/lib/builder/inventory'

const TIER_OPTIONS = ['budget', 'mid', 'premium'] as const satisfies readonly DrawerSystemTier[]
const HINGE_OPTIONS = ['soft_close', 'standard', 'push_to_open'] as const satisfies readonly HingeType[]
const HANDLE_OPTIONS = [
  'integrated_jpull',
  'integrated_groove',
  'pull_bar',
  'knob',
  'cup_pull',
] as const satisfies readonly HandleStyle[]
const FINISH_OPTIONS = [
  'matte_black',
  'brushed_steel',
  'brass',
  'chrome',
  'matched_to_door',
] as const satisfies readonly HandleFinish[]

export function HardwareGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['hardware']>) => void
}) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <PickerSlot label={t('hardware.tierLabel')} meta={state.hardware.meta.drawerSystemTier}>
        <ChipRow
          keyPrefix="hardware.tier"
          values={TIER_OPTIONS}
          selected={state.hardware.drawerSystemTier}
          onChange={(v) =>
            onPatch({
              drawerSystemTier: v,
              meta: {
                ...state.hardware.meta,
                drawerSystemTier: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('hardware.hingeLabel')} meta={state.hardware.meta.hingeType}>
        <ChipRow
          keyPrefix="hardware.hinge"
          values={HINGE_OPTIONS}
          selected={state.hardware.hingeType}
          onChange={(v) =>
            onPatch({
              hingeType: v,
              meta: {
                ...state.hardware.meta,
                hingeType: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('hardware.handleLabel')} meta={state.hardware.meta.handleStyle}>
        <ChipRow
          keyPrefix="hardware.handle"
          values={HANDLE_OPTIONS}
          selected={state.hardware.handleStyle}
          onChange={(v) =>
            onPatch({
              handleStyle: v,
              meta: {
                ...state.hardware.meta,
                handleStyle: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('hardware.finishLabel')} meta={state.hardware.meta.handleFinish}>
        <ChipRow
          keyPrefix="hardware.finish"
          values={FINISH_OPTIONS}
          selected={state.hardware.handleFinish}
          onChange={(v) =>
            onPatch({
              handleFinish: v,
              meta: {
                ...state.hardware.meta,
                handleFinish: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <HardwareBrowsePanel state={state} onPatch={onPatch} />
    </div>
  )
}

function HardwareBrowsePanel({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['hardware']>) => void
}) {
  const drawers = searchSchachermayer('hardware', {
    anyKeyword: ['ladic', 'tandem', 'legrabox', 'movento', 'nova pro'],
  })
  const hinges = searchSchachermayer('hardware', { anyKeyword: ['šarka', 'sarka', 'hinge', 'clip'] })
  if (drawers.length === 0 && hinges.length === 0) return null

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Browse Schachermayer (HR)
      </p>
      {drawers.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">Drawer systems</p>
          <SchachermayerBrowse
            products={drawers}
            selectedSku={state.hardware.drawerSystemSku}
            onPick={(p) => onPatch({ drawerSystemSku: p.sku })}
            initialLimit={6}
          />
        </div>
      )}
      {hinges.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">Hinges</p>
          <SchachermayerBrowse products={hinges} initialLimit={6} />
        </div>
      )}
    </div>
  )
}
