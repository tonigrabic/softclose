'use client'

import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow, ToggleRow } from '../ChipRow'
import { SchachermayerBrowse } from '../SchachermayerBrowse'
import { appliancesForType } from '@/lib/catalog/hardware'
import type { ApplianceSelection, ApplianceSupply, BuilderState } from '@/lib/builder/inventory'

const SUPPLY_OPTIONS = [
  'homeowner_supplies',
  'maker_supplies',
  'mixed',
] as const satisfies readonly ApplianceSupply[]

const HOB_OPTIONS = ['induction', 'gas', 'ceramic', 'unknown'] as const
const OVEN_OPTIONS = ['single', 'double', 'combi', 'unknown'] as const
const EXTRACTOR_OPTIONS = [
  'chimney',
  'island',
  'downdraft',
  'recirculating',
  'ceiling_recessed',
  'unknown',
] as const

/**
 * Each appliance is stored as a single ApplianceSelection in
 * state.appliances.selections. We expose a tiny chip picker for hob / oven /
 * extractor "kind", and toggles for fridge / dishwasher integrated state.
 */
function getSelection(state: BuilderState, type: ApplianceSelection['type']): string | undefined {
  return state.appliances.selections.find((s) => s.type === type)?.config
}

function getIntegrated(state: BuilderState, type: ApplianceSelection['type']): boolean {
  return state.appliances.selections.find((s) => s.type === type)?.integrated ?? true
}

function upsert(
  state: BuilderState,
  type: ApplianceSelection['type'],
  patch: Partial<ApplianceSelection>
): ApplianceSelection[] {
  const existing = state.appliances.selections.find((s) => s.type === type)
  const merged: ApplianceSelection = {
    type,
    config: patch.config ?? existing?.config ?? 'unknown',
    integrated: patch.integrated ?? existing?.integrated ?? true,
    widthMm: patch.widthMm ?? existing?.widthMm,
    notes: patch.notes ?? existing?.notes,
  }
  const others = state.appliances.selections.filter((s) => s.type !== type)
  return [...others, merged]
}

export function AppliancesGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['appliances']>) => void
}) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <PickerSlot label={t('appliances.supplyLabel')} meta={state.appliances.meta.supply}>
        <ChipRow
          keyPrefix="appliances.supply"
          values={SUPPLY_OPTIONS}
          selected={state.appliances.supply}
          onChange={(v) =>
            onPatch({
              supply: v,
              meta: {
                ...state.appliances.meta,
                supply: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('appliances.hobLabel')} meta={state.appliances.meta.hob}>
        <ChipRow
          keyPrefix="appliances.hob"
          values={HOB_OPTIONS}
          selected={getSelection(state, 'hob') ?? 'unknown'}
          onChange={(v) =>
            onPatch({
              selections: upsert(state, 'hob', { config: v }),
              meta: {
                ...state.appliances.meta,
                hob: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('appliances.ovenLabel')} meta={state.appliances.meta.oven}>
        <ChipRow
          keyPrefix="appliances.oven"
          values={OVEN_OPTIONS}
          selected={getSelection(state, 'oven') ?? 'unknown'}
          onChange={(v) =>
            onPatch({
              selections: upsert(state, 'oven', { config: v }),
              meta: {
                ...state.appliances.meta,
                oven: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('appliances.extractorLabel')} meta={state.appliances.meta.extractor}>
        <ChipRow
          keyPrefix="appliances.extractor"
          values={EXTRACTOR_OPTIONS}
          selected={getSelection(state, 'extractor') ?? 'unknown'}
          onChange={(v) =>
            onPatch({
              selections: upsert(state, 'extractor', { config: v }),
              meta: {
                ...state.appliances.meta,
                extractor: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('appliances.fridgeLabel')} meta={state.appliances.meta.fridge}>
        <ToggleRow
          label={
            getIntegrated(state, 'fridge') ? t('appliances.fridgeIntegrated') : t('appliances.fridgeStandalone')
          }
          on={getIntegrated(state, 'fridge')}
          onChange={(on) =>
            onPatch({
              selections: upsert(state, 'fridge', { integrated: on, config: 'standard' }),
              meta: {
                ...state.appliances.meta,
                fridge: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('appliances.dishwasherLabel')} meta={state.appliances.meta.dishwasher}>
        <ToggleRow
          label={
            getIntegrated(state, 'dishwasher')
              ? t('appliances.dishwasherIntegrated')
              : t('appliances.dishwasherStandalone')
          }
          on={getIntegrated(state, 'dishwasher')}
          onChange={(on) =>
            onPatch({
              selections: upsert(state, 'dishwasher', { integrated: on, config: 'standard' }),
              meta: {
                ...state.appliances.meta,
                dishwasher: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      {state.appliances.supply !== 'homeowner_supplies' && (
        <ApplianceBrowsePanel state={state} onPatch={onPatch} />
      )}
    </div>
  )
}

/**
 * Browse-and-pin panel — shows real Schachermayer SKUs grouped by appliance
 * type, so the homeowner can pin a specific model the maker should source.
 * Pinning a SKU stores it in the per-appliance ApplianceSelection.notes field
 * (treated as the maker handoff hint, not a binding choice).
 */
function ApplianceBrowsePanel({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['appliances']>) => void
}) {
  const types: { type: 'hob' | 'oven' | 'extractor' | 'fridge' | 'dishwasher' | 'microwave'; label: string }[] = [
    { type: 'hob', label: 'Hobs' },
    { type: 'oven', label: 'Ovens' },
    { type: 'extractor', label: 'Extractors' },
    { type: 'fridge', label: 'Fridges' },
    { type: 'dishwasher', label: 'Dishwashers' },
  ]

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Browse Schachermayer (HR)
      </p>
      {types.map(({ type, label }) => {
        const products = appliancesForType(type)
        if (products.length === 0) return null
        const selected = state.appliances.selections.find((s) => s.type === type)
        return (
          <div key={type} className="space-y-2">
            <p className="text-[12px] font-medium text-foreground">{label}</p>
            <SchachermayerBrowse
              products={products}
              selectedSku={selected?.notes?.split('SKU=')[1]?.split(';')[0]}
              onPick={(p) => {
                const others = state.appliances.selections.filter((s) => s.type !== type)
                const merged: ApplianceSelection = {
                  type,
                  config: selected?.config ?? 'standard',
                  integrated: selected?.integrated ?? true,
                  widthMm: selected?.widthMm,
                  notes: `SKU=${p.sku ?? ''};name=${p.name};brand=${p.brand ?? ''}`,
                }
                onPatch({ selections: [...others, merged] })
              }}
              initialLimit={6}
            />
          </div>
        )
      })}
    </div>
  )
}
