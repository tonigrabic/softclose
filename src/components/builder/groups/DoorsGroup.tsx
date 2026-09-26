'use client'

/**
 * Fronts (fronte) — material first, the way makers quote (maker testing,
 * 2026-09-23): iveral → an Elgrad decor (name + code, real grain);
 * lakirani medijapan → a profile (ravna / s ukladom / reljef) and a RAL
 * colour; aluminij sa staklom → the frame and glass are agreed with the maker.
 */
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { decors as catalogDecors } from '@/lib/catalog'
import { RAL_KITCHEN_SHORTLIST, findRal, normalizeRalCode } from '@/lib/catalog/ral'
import { useTranslations, tDynamic } from '@/lib/i18n'
import { PickerSlot } from '../PickerSlot'
import { DecorSwatch } from '../DecorSwatch'
import { FrontProfileDiagram } from '../FrontProfileDiagram'
import type { BuilderState, FieldMeta, FrontMaterial, MdfProfile } from '@/lib/builder/inventory'
import type { DecorFamily as CatalogDecorFamily } from '@/lib/catalog'

const MATERIAL_OPTIONS: FrontMaterial[] = ['iveral', 'lacquered_mdf', 'alu_glass']
const PROFILE_OPTIONS: MdfProfile[] = ['flat', 'inset', 'relief']

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

const EDITED: FieldMeta = { confidence: 'H', provenance: 'homeowner-edited' }

interface DoorsGroupProps {
  state: BuilderState
  onPatch: (patch: Partial<BuilderState['doors']>) => void
}

export function DoorsGroup({ state, onPatch }: DoorsGroupProps) {
  const { t, tDynamic: td } = useTranslations()
  const doors = state.doors
  const ral = findRal(doors.ralCode)

  return (
    <div className="space-y-5">
      <PickerSlot label={t('doors.materialLabel')} meta={doors.meta.material}>
        <div className="grid gap-2">
          {MATERIAL_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={doors.material === m}
              onClick={() => onPatch({ material: m, meta: { ...doors.meta, material: EDITED } })}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                doors.material === m
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/40'
              )}
            >
              <span className="block text-[13px] font-semibold text-foreground">{td(`doors.material.${m}`)}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                {td(`doors.material.${m}.hint`)}
              </span>
            </button>
          ))}
        </div>
      </PickerSlot>

      {doors.material === 'iveral' && <IveralDecors state={state} onPatch={onPatch} />}

      {doors.material === 'lacquered_mdf' && (
        <>
          <PickerSlot label={t('doors.profileLabel')} meta={doors.meta.profile}>
            <div className="grid grid-cols-3 gap-2">
              {PROFILE_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={doors.profile === p}
                  onClick={() => onPatch({ profile: p, meta: { ...doors.meta, profile: EDITED } })}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-foreground transition-colors',
                    doors.profile === p ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'
                  )}
                >
                  <FrontProfileDiagram kind={p} hex={ral?.hex} className="h-20 w-auto" />
                  <span className="text-[13px] font-semibold">{td(`doors.profile.${p}`)}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{td(`doors.profile.${p}.hint`)}</span>
                </button>
              ))}
            </div>
          </PickerSlot>

          <RalPicker state={state} onPatch={onPatch} />
        </>
      )}

      {doors.material === 'alu_glass' && (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground">
          <FrontProfileDiagram kind="alu_glass" className="h-20 w-auto shrink-0" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t('doors.alu.note')}</p>
        </div>
      )}
    </div>
  )
}

function IveralDecors({ state, onPatch }: DoorsGroupProps) {
  const { t, locale } = useTranslations()
  const [familyFilter, setFamilyFilter] = useState<'all' | CatalogDecorFamily>('all')
  const visibleDecors = useMemo(() => {
    const usable = catalogDecors.filter((d) => d.uses.includes('door'))
    return familyFilter === 'all' ? usable : usable.filter((d) => d.family === familyFilter)
  }, [familyFilter])

  return (
    <PickerSlot label={t('doors.decor.pickPrompt')} meta={state.doors.meta.decorCode}>
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

      {/* Big tiles, so the grain of a wood decor actually reads. */}
      <div className="grid grid-cols-3 gap-3">
        {visibleDecors.map((d) => (
          <DecorSwatch
            key={`${d.code}-${d.structure}`}
            code={d.code}
            structure={d.structure}
            size="fill"
            selected={state.doors.decorCode === d.code && state.doors.decorStructure === d.structure}
            onClick={() =>
              onPatch({
                decorCode: d.code,
                decorStructure: d.structure,
                meta: { ...state.doors.meta, decorCode: EDITED },
              })
            }
            showLabel
            label={locale === 'en-US' && d.nameEn ? d.nameEn : d.name}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t('doors.decor.disclaimer')}</p>
    </PickerSlot>
  )
}

function RalPicker({ state, onPatch }: DoorsGroupProps) {
  const { t, locale } = useTranslations()
  const current = state.doors.ralCode
  const inShortlist = RAL_KITCHEN_SHORTLIST.some((c) => c.code === current)
  const [other, setOther] = useState(inShortlist ? '' : current.replace(/^RAL\s*/, ''))
  const otherCode = normalizeRalCode(other)
  const otherColour = findRal(otherCode)
  const otherUnknown = other.trim().length >= 4 && !otherColour

  function pick(code: string) {
    onPatch({ ralCode: code, meta: { ...state.doors.meta, ralCode: EDITED } })
  }

  return (
    <PickerSlot label={t('doors.ralLabel')} meta={state.doors.meta.ralCode}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('doors.ral.popular')}</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
        {RAL_KITCHEN_SHORTLIST.map((c) => (
          <button
            key={c.code}
            type="button"
            aria-pressed={current === c.code}
            title={`${c.code} · ${c.nameEn}`}
            onClick={() => {
              setOther('')
              pick(c.code)
            }}
            className="group flex min-w-0 flex-col items-center gap-1"
          >
            <span
              className={cn(
                'block aspect-square w-full rounded-lg ring-2 transition-all',
                current === c.code ? 'ring-primary shadow-md' : 'ring-border/60 group-hover:ring-primary/40'
              )}
              style={{ backgroundColor: c.hex }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{c.code.replace('RAL ', '')}</span>
            {locale === 'en-US' && <span className="sr-only">{c.nameEn}</span>}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-[12px] font-medium text-foreground" htmlFor="ral-other">
        {t('doors.ral.otherLabel')}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">RAL</span>
        <input
          id="ral-other"
          inputMode="numeric"
          maxLength={8}
          value={other}
          placeholder={t('doors.ral.otherPlaceholder')}
          onChange={(e) => {
            setOther(e.target.value)
            const colour = findRal(normalizeRalCode(e.target.value))
            if (colour) pick(colour.code)
          }}
          className="w-24 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] tabular-nums focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
        {otherColour && (
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="size-7 rounded-md ring-1 ring-border" style={{ backgroundColor: otherColour.hex }} />
            {locale === 'en-US' ? otherColour.nameEn : otherColour.code}
          </span>
        )}
      </div>
      {otherUnknown && <p className="mt-1.5 text-[12px] text-destructive">{t('doors.ral.unknown')}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">{t('doors.ral.disclaimer')}</p>
    </PickerSlot>
  )
}
