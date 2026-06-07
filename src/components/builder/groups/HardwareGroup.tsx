'use client'

import { X } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import { SchachermayerBrowse } from '../SchachermayerBrowse'
import { searchSchachermayer } from '@/lib/catalog/hardware'
import { inferDrawerSystemTier } from '@/lib/builder/pick-inference'
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
  const { t } = useTranslations()
  const drawers = searchSchachermayer('hardware', {
    anyKeyword: ['ladic', 'tandem', 'legrabox', 'movento', 'nova pro'],
  })
  const hinges = searchSchachermayer('hardware', { anyKeyword: ['šarka', 'sarka', 'hinge', 'clip'] })
  if (drawers.length === 0 && hinges.length === 0) return null

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('builder.browse.title')}
      </p>
      {drawers.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">{t('builder.browse.drawers')}</p>
          {state.hardware.drawerSystemPickedName && (
            <PickedChip
              brand={state.hardware.drawerSystemPickedBrand}
              name={state.hardware.drawerSystemPickedName}
              onClear={() =>
                onPatch({
                  drawerSystemSku: undefined,
                  drawerSystemPickedName: undefined,
                  drawerSystemPickedBrand: undefined,
                })
              }
            />
          )}
          <SchachermayerBrowse
            products={drawers}
            selectedSku={state.hardware.drawerSystemSku}
            onPick={(p) => {
              const tier = inferDrawerSystemTier(p)
              const patch: Partial<BuilderState['hardware']> = {
                drawerSystemSku: p.sku,
                drawerSystemPickedName: p.name,
                drawerSystemPickedBrand: p.brand,
              }
              if (tier) {
                patch.drawerSystemTier = tier
                patch.meta = {
                  ...state.hardware.meta,
                  drawerSystemTier: { confidence: 'H', provenance: 'homeowner-edited' },
                }
              }
              onPatch(patch)
            }}
            initialLimit={6}
          />
        </div>
      )}
      {hinges.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">{t('builder.browse.hinges')}</p>
          {state.hardware.hingePickedName && (
            <PickedChip
              brand={state.hardware.hingePickedBrand}
              name={state.hardware.hingePickedName}
              onClear={() =>
                onPatch({
                  hingeSku: undefined,
                  hingePickedName: undefined,
                  hingePickedBrand: undefined,
                })
              }
            />
          )}
          <SchachermayerBrowse
            products={hinges}
            selectedSku={state.hardware.hingeSku}
            onPick={(p) =>
              onPatch({
                hingeSku: p.sku,
                hingePickedName: p.name,
                hingePickedBrand: p.brand,
              })
            }
            initialLimit={6}
          />
        </div>
      )}
    </div>
  )
}

function PickedChip({
  brand,
  name,
  onClear,
}: {
  brand?: string
  name: string
  onClear: () => void
}) {
  const { t } = useTranslations()
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px]">
      <span className="font-semibold text-foreground">{t('builder.browse.picked')}</span>
      <span className="text-foreground">
        {brand ? `${brand} ` : ''}
        {name}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={t('builder.browse.clearPick')}
      >
        <X className="size-3 stroke-[2.5]" aria-hidden />
      </button>
    </div>
  )
}
