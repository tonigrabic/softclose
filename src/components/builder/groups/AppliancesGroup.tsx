'use client'

import { X } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow, ToggleRow } from '../ChipRow'
import { SchachermayerBrowse } from '../SchachermayerBrowse'
import { appliancesForType } from '@/lib/catalog/hardware'
import { inferApplianceFields } from '@/lib/builder/pick-inference'
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
    pickedSku: patch.pickedSku ?? existing?.pickedSku,
    pickedName: patch.pickedName ?? existing?.pickedName,
    pickedBrand: patch.pickedBrand ?? existing?.pickedBrand,
    notes: patch.notes ?? existing?.notes,
  }
  const others = state.appliances.selections.filter((s) => s.type !== type)
  return [...others, merged]
}

function isIncluded(state: BuilderState, type: ApplianceSelection['type']): boolean {
  return state.appliances.selections.some((s) => s.type === type)
}

function setIncluded(
  state: BuilderState,
  type: ApplianceSelection['type'],
  on: boolean,
  defaultConfig = 'standard'
): ApplianceSelection[] {
  if (on) {
    if (state.appliances.selections.some((s) => s.type === type)) return state.appliances.selections
    return [...state.appliances.selections, { type, config: defaultConfig, integrated: true }]
  }
  return state.appliances.selections.filter((s) => s.type !== type)
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
        <IncludeToggle
          on={isIncluded(state, 'hob')}
          onChange={(on) => onPatch({ selections: setIncluded(state, 'hob', on, 'unknown') })}
        />
        {isIncluded(state, 'hob') && (
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
        )}
      </PickerSlot>

      <PickerSlot label={t('appliances.ovenLabel')} meta={state.appliances.meta.oven}>
        <IncludeToggle
          on={isIncluded(state, 'oven')}
          onChange={(on) => onPatch({ selections: setIncluded(state, 'oven', on, 'unknown') })}
        />
        {isIncluded(state, 'oven') && (
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
        )}
      </PickerSlot>

      <PickerSlot label={t('appliances.extractorLabel')} meta={state.appliances.meta.extractor}>
        <IncludeToggle
          on={isIncluded(state, 'extractor')}
          onChange={(on) =>
            onPatch({ selections: setIncluded(state, 'extractor', on, 'unknown') })
          }
        />
        {isIncluded(state, 'extractor') && (
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
        )}
      </PickerSlot>

      <PickerSlot label={t('appliances.fridgeLabel')} meta={state.appliances.meta.fridge}>
        <IncludeToggle
          on={isIncluded(state, 'fridge')}
          onChange={(on) => onPatch({ selections: setIncluded(state, 'fridge', on) })}
        />
        {isIncluded(state, 'fridge') && (
          <ToggleRow
            label={
              getIntegrated(state, 'fridge')
                ? t('appliances.fridgeIntegrated')
                : t('appliances.fridgeStandalone')
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
        )}
      </PickerSlot>

      <PickerSlot label={t('appliances.dishwasherLabel')} meta={state.appliances.meta.dishwasher}>
        <IncludeToggle
          on={isIncluded(state, 'dishwasher')}
          onChange={(on) => onPatch({ selections: setIncluded(state, 'dishwasher', on) })}
        />
        {isIncluded(state, 'dishwasher') && (
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
        )}
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
            {selected?.pickedName && (
              <PickedChip
                brand={selected.pickedBrand}
                name={selected.pickedName}
                onClear={() => {
                  const others = state.appliances.selections.filter((s) => s.type !== type)
                  onPatch({
                    selections: [
                      ...others,
                      {
                        ...selected,
                        pickedSku: undefined,
                        pickedName: undefined,
                        pickedBrand: undefined,
                      },
                    ],
                  })
                }}
              />
            )}
            <SchachermayerBrowse
              products={products}
              selectedSku={selected?.pickedSku}
              onPick={(p) => {
                const others = state.appliances.selections.filter((s) => s.type !== type)
                const inferred = inferApplianceFields(type, p)
                const merged: ApplianceSelection = {
                  type,
                  config: inferred.config ?? selected?.config ?? 'standard',
                  integrated: inferred.integrated ?? selected?.integrated ?? true,
                  widthMm: inferred.widthMm ?? selected?.widthMm,
                  pickedSku: p.sku,
                  pickedName: p.name,
                  pickedBrand: p.brand,
                  notes: selected?.notes,
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

function IncludeToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={
        on
          ? 'inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary'
          : 'inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground'
      }
    >
      <span className={on ? '' : 'opacity-60'}>{on ? '✓' : '+'}</span>
      <span>{on ? 'Included' : 'Not in this kitchen'}</span>
    </button>
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
