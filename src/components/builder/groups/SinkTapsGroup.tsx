'use client'

import { X } from 'lucide-react'
import { useTranslations } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { ChipRow } from '../ChipRow'
import { SchachermayerBrowse } from '../SchachermayerBrowse'
import { searchSchachermayer } from '@/lib/catalog/hardware'
import { inferSinkAttributes, inferTapAttributes } from '@/lib/builder/pick-inference'
import type {
  BuilderState,
  FieldMeta,
  HandleFinish,
  SinkBowls,
  SinkMaterial,
  SinkMount,
  TapType,
} from '@/lib/builder/inventory'

const BOWLS_OPTIONS = ['single', 'one_and_half', 'double'] as const satisfies readonly SinkBowls[]
const MOUNT_OPTIONS = ['undermount', 'inset', 'flush', 'belfast'] as const satisfies readonly SinkMount[]
const MATERIAL_OPTIONS = [
  'stainless',
  'granite_composite',
  'ceramic',
  'fragranite',
] as const satisfies readonly SinkMaterial[]
const TAP_OPTIONS = [
  'single_lever',
  'pull_out',
  'boiling_water',
  'filtered_three_way',
] as const satisfies readonly TapType[]
const FINISH_OPTIONS = [
  'matte_black',
  'brushed_steel',
  'brass',
  'chrome',
  'matched_to_door',
] as const satisfies readonly HandleFinish[]

export function SinkTapsGroup({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['sinkTaps']>) => void
}) {
  const { t } = useTranslations()

  return (
    <div className="space-y-5">
      <PickerSlot label={t('sinkTaps.bowlsLabel')} meta={state.sinkTaps.meta.sinkBowls}>
        <ChipRow
          keyPrefix="sinkTaps.bowls"
          values={BOWLS_OPTIONS}
          selected={state.sinkTaps.sink.bowls}
          onChange={(v) =>
            onPatch({
              sink: { ...state.sinkTaps.sink, bowls: v },
              meta: {
                ...state.sinkTaps.meta,
                sinkBowls: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('sinkTaps.mountLabel')} meta={state.sinkTaps.meta.sinkMount}>
        <ChipRow
          keyPrefix="sinkTaps.mount"
          values={MOUNT_OPTIONS}
          selected={state.sinkTaps.sink.mount}
          onChange={(v) =>
            onPatch({
              sink: { ...state.sinkTaps.sink, mount: v },
              meta: {
                ...state.sinkTaps.meta,
                sinkMount: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('sinkTaps.materialLabel')} meta={state.sinkTaps.meta.sinkMaterial}>
        <ChipRow
          keyPrefix="sinkTaps.material"
          values={MATERIAL_OPTIONS}
          selected={state.sinkTaps.sink.material}
          onChange={(v) =>
            onPatch({
              sink: { ...state.sinkTaps.sink, material: v },
              meta: {
                ...state.sinkTaps.meta,
                sinkMaterial: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('sinkTaps.tapTypeLabel')} meta={state.sinkTaps.meta.tapType}>
        <ChipRow
          keyPrefix="sinkTaps.tap"
          values={TAP_OPTIONS}
          selected={state.sinkTaps.tap.type}
          onChange={(v) =>
            onPatch({
              tap: { ...state.sinkTaps.tap, type: v },
              meta: {
                ...state.sinkTaps.meta,
                tapType: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <PickerSlot label={t('hardware.finishLabel')} meta={state.sinkTaps.meta.tapFinish}>
        <ChipRow
          keyPrefix="hardware.finish"
          values={FINISH_OPTIONS}
          selected={state.sinkTaps.tap.finish}
          onChange={(v) =>
            onPatch({
              tap: { ...state.sinkTaps.tap, finish: v },
              meta: {
                ...state.sinkTaps.meta,
                tapFinish: { confidence: 'H', provenance: 'homeowner-edited' },
              },
            })
          }
        />
      </PickerSlot>

      <SinkTapBrowsePanel state={state} onPatch={onPatch} />
    </div>
  )
}

function SinkTapBrowsePanel({
  state,
  onPatch,
}: {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['sinkTaps']>) => void
}) {
  const { t } = useTranslations()
  const sinks = searchSchachermayer('sink_tap', { anyKeyword: ['sudoper', 'umival'] })
  const taps = searchSchachermayer('sink_tap', { anyKeyword: ['slavin', 'mješalic', 'mjesalic'] })
  if (sinks.length === 0 && taps.length === 0) return null

  return (
    <div className="space-y-4 rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('builder.browse.title')}
      </p>
      {sinks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">{t('builder.browse.sinks')}</p>
          {state.sinkTaps.sink.pickedName && (
            <PickedChip
              brand={state.sinkTaps.sink.pickedBrand}
              name={state.sinkTaps.sink.pickedName}
              onClear={() =>
                onPatch({
                  sink: {
                    ...state.sinkTaps.sink,
                    sku: undefined,
                    pickedName: undefined,
                    pickedBrand: undefined,
                    pickedPriceEur: undefined,
                  },
                })
              }
            />
          )}
          <SchachermayerBrowse
            products={sinks}
            selectedSku={state.sinkTaps.sink.sku}
            onPick={(p) => {
              const inferred = inferSinkAttributes(p) ?? {}
              const meta: typeof state.sinkTaps.meta = { ...state.sinkTaps.meta }
              const editedMeta: FieldMeta = { confidence: 'H', provenance: 'homeowner-edited' }
              if (inferred.material) meta.sinkMaterial = editedMeta
              if (inferred.bowls) meta.sinkBowls = editedMeta
              if (inferred.mount) meta.sinkMount = editedMeta
              onPatch({
                sink: {
                  ...state.sinkTaps.sink,
                  ...inferred,
                  sku: p.sku,
                  pickedName: p.name,
                  pickedBrand: p.brand,
                  pickedPriceEur: p.priceEur,
                },
                meta,
              })
            }}
            initialLimit={6}
          />
        </div>
      )}
      {taps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-foreground">{t('builder.browse.taps')}</p>
          {state.sinkTaps.tap.pickedName && (
            <PickedChip
              brand={state.sinkTaps.tap.pickedBrand}
              name={state.sinkTaps.tap.pickedName}
              onClear={() =>
                onPatch({
                  tap: {
                    ...state.sinkTaps.tap,
                    sku: undefined,
                    pickedName: undefined,
                    pickedBrand: undefined,
                    pickedPriceEur: undefined,
                  },
                })
              }
            />
          )}
          <SchachermayerBrowse
            products={taps}
            selectedSku={state.sinkTaps.tap.sku}
            onPick={(p) => {
              const inferred = inferTapAttributes(p) ?? {}
              const meta: typeof state.sinkTaps.meta = { ...state.sinkTaps.meta }
              const editedMeta: FieldMeta = { confidence: 'H', provenance: 'homeowner-edited' }
              if (inferred.type) meta.tapType = editedMeta
              if (inferred.finish) meta.tapFinish = editedMeta
              onPatch({
                tap: {
                  ...state.sinkTaps.tap,
                  ...inferred,
                  sku: p.sku,
                  pickedName: p.name,
                  pickedBrand: p.brand,
                  pickedPriceEur: p.priceEur,
                },
                meta,
              })
            }}
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
