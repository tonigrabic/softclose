'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { decorsByUse } from '@/lib/catalog'
import { useTranslations, tDynamic } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { DecorSwatch } from '../DecorSwatch'
import type { BuilderState, WorktopFamily, WorktopEdge } from '@/lib/builder/inventory'

const FAMILY_OPTIONS: WorktopFamily[] = [
  'laminate',
  'compact',
  'quartz',
  'sintered_stone',
  'solid_wood',
  'stainless',
]

const EDGE_OPTIONS: WorktopEdge[] = ['square', 'radius', 'bevel', 'mitred_waterfall']
const THICKNESS_OPTIONS: Array<38 | 20 | 12> = [38, 20, 12]

interface WorktopGroupProps {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['worktop']>) => void
}

export function WorktopGroup({ state, onPatch }: WorktopGroupProps) {
  const { t, locale } = useTranslations()
  const [familyFilter] = useState<string>('all')
  // setFamilyFilter is intentionally omitted for MVP — chip UI lives in DoorsGroup;
  // worktop variants are few enough to show all in one grid.

  const visibleDecors = useMemo(() => {
    const usable = decorsByUse('worktop')
    if (familyFilter === 'all') return usable
    return usable.filter((d) => d.family === familyFilter)
  }, [familyFilter])

  function setFamily(family: WorktopFamily) {
    // Decor codes only apply to Elgrad laminate/compact rows. When swapping
    // to quartz/sintered/wood/stainless, drop the stale decor so the BOM
    // doesn't price a quartz top with a laminate decor's €/m rate.
    const keepsDecor = family === 'laminate' || family === 'compact'
    onPatch({
      family,
      decorCode: keepsDecor ? state.worktop.decorCode : undefined,
      decorStructure: keepsDecor ? state.worktop.decorStructure : undefined,
      meta: {
        ...state.worktop.meta,
        family: { confidence: 'H', provenance: 'homeowner-edited' },
        decorCode: keepsDecor
          ? state.worktop.meta.decorCode
          : { confidence: 'L', provenance: 'homeowner-edited' },
      },
    })
  }

  function setDecor(code: string, structure: string) {
    onPatch({
      decorCode: code,
      decorStructure: structure,
      meta: {
        ...state.worktop.meta,
        decorCode: { confidence: 'H', provenance: 'homeowner-edited' },
      },
    })
  }

  function setEdge(edge: WorktopEdge) {
    onPatch({
      edge,
      meta: { ...state.worktop.meta, edge: { confidence: 'H', provenance: 'homeowner-edited' } },
    })
  }

  function setThickness(thicknessMm: 38 | 20 | 12) {
    onPatch({
      thicknessMm,
      meta: { ...state.worktop.meta, thickness: { confidence: 'H', provenance: 'homeowner-edited' } },
    })
  }

  return (
    <div className="space-y-5">
      <PickerSlot label={t('worktop.familyLabel')} meta={state.worktop.meta.family}>
        <div className="flex flex-wrap gap-1.5">
          {FAMILY_OPTIONS.map((fam) => (
            <button
              key={fam}
              type="button"
              onClick={() => setFamily(fam)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                state.worktop.family === fam
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {tDynamic(`worktop.family.${fam}`, locale)}
            </button>
          ))}
        </div>
      </PickerSlot>

      {(state.worktop.family === 'laminate' || state.worktop.family === 'compact') && (
        <PickerSlot label={t('worktop.decorLabel')} meta={state.worktop.meta.decorCode}>
          {/* family filter chips can be added later — start with full grid */}
          <div className="sr-only">filter: {familyFilter}</div>
          <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
            {visibleDecors.map((d) => (
              <DecorSwatch
                key={`${d.code}-${d.structure}`}
                code={d.code}
                structure={d.structure}
                size="md"
                selected={state.worktop.decorCode === d.code && state.worktop.decorStructure === d.structure}
                onClick={() => setDecor(d.code, d.structure)}
                showLabel
                label={locale === 'en-US' && d.nameEn ? d.nameEn : d.name}
              />
            ))}
          </div>
        </PickerSlot>
      )}

      <PickerSlot label={t('worktop.edgeLabel')} meta={state.worktop.meta.edge}>
        <div className="flex flex-wrap gap-1.5">
          {EDGE_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEdge(e)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                state.worktop.edge === e
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {tDynamic(`worktop.edge.${e}`, locale)}
            </button>
          ))}
        </div>
      </PickerSlot>

      <PickerSlot label={t('worktop.thicknessLabel')} meta={state.worktop.meta.thickness}>
        <div className="flex flex-wrap gap-1.5">
          {THICKNESS_OPTIONS.map((mm) => (
            <button
              key={mm}
              type="button"
              onClick={() => setThickness(mm)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                state.worktop.thicknessMm === mm
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {mm} mm
            </button>
          ))}
        </div>
      </PickerSlot>
    </div>
  )
}
