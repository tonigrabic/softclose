'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { decors as catalogDecors } from '@/lib/catalog'
import { useTranslations, tDynamic } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { DecorSwatch } from '../DecorSwatch'
import type {
  BuilderState,
  DoorStyle,
} from '@/lib/builder/inventory'
import type { DecorFamily as CatalogDecorFamily } from '@/lib/catalog'

const STYLE_OPTIONS: DoorStyle[] = [
  'slab',
  'shaker',
  'handleless_jpull',
  'handleless_groove',
  'glass_front',
  'beaded',
]

const FAMILY_FILTERS: ('all' | CatalogDecorFamily)[] = [
  'all',
  'white',
  'cream',
  'beige',
  'grey',
  'black',
  'oak',
  'walnut',
  'concrete',
  'marble',
]

interface DoorsGroupProps {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['doors']>) => void
}

export function DoorsGroup({ state, onPatch }: DoorsGroupProps) {
  const { t, locale } = useTranslations()
  const [familyFilter, setFamilyFilter] = useState<'all' | CatalogDecorFamily>('all')

  const visibleDecors = useMemo(() => {
    const usable = catalogDecors.filter((d) => d.uses.includes('door'))
    if (familyFilter === 'all') return usable
    return usable.filter((d) => d.family === familyFilter)
  }, [familyFilter])

  function setStyle(style: DoorStyle) {
    onPatch({
      style,
      meta: {
        ...state.doors.meta,
        style: { confidence: 'H', provenance: 'homeowner-edited' },
      },
    })
  }

  function setDecor(code: string, structure: string) {
    onPatch({
      decorCode: code,
      decorStructure: structure,
      meta: {
        ...state.doors.meta,
        decorCode: { confidence: 'H', provenance: 'homeowner-edited' },
      },
    })
  }

  return (
    <div className="space-y-5">
      <PickerSlot label={t('doors.styleLabel')} meta={state.doors.meta.style}>
        <Style state={state} onSet={setStyle} />
      </PickerSlot>

      <PickerSlot label={t('doors.decor.pickPrompt')} meta={state.doors.meta.decorCode}>
        {/* Family filter chips */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FAMILY_FILTERS.map((fam) => (
            <button
              key={fam}
              type="button"
              onClick={() => setFamilyFilter(fam)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                familyFilter === fam
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {fam === 'all'
                ? tDynamic('doors.decor.familyFilter.all', locale)
                : tDynamic(`doors.decor.family.${fam}`, locale)}
            </button>
          ))}
        </div>

        {/* Swatch grid */}
        <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
          {visibleDecors.map((d) => (
            <DecorSwatch
              key={`${d.code}-${d.structure}`}
              code={d.code}
              structure={d.structure}
              size="md"
              selected={state.doors.decorCode === d.code && state.doors.decorStructure === d.structure}
              onClick={() => setDecor(d.code, d.structure)}
              showLabel
              label={locale === 'en-US' && d.nameEn ? d.nameEn : d.name}
            />
          ))}
        </div>
      </PickerSlot>
    </div>
  )
}

function Style({
  state,
  onSet,
}: {
  state: BuilderState
  onSet: (s: DoorStyle) => void
}) {
  const { locale } = useTranslations()
  return (
    <div className="flex flex-wrap gap-1.5">
      {STYLE_OPTIONS.map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => onSet(style)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
            state.doors.style === style
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          {tDynamic(`doors.style.${style}`, locale)}
        </button>
      ))}
    </div>
  )
}

