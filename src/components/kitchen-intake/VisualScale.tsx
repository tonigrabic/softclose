'use client'

import { cn } from '@/lib/utils'
import { getOptionIcon } from '@/lib/option-icons'
import type { ScaleBand } from '@/lib/types'

interface VisualScaleProps {
  bands: ScaleBand[]
  selected: string | null
  onSelect: (value: string) => void
  axisCaption?: string
}

/**
 * Anchored horizontal scale with optional icons under each band.
 * Used for timeline + budget — replaces the old "select_cards over budget" UX.
 */
export function VisualScale({ bands, selected, onSelect, axisCaption }: VisualScaleProps) {
  if (bands.length === 0) return null
  return (
    <div className="space-y-3">
      {axisCaption && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {axisCaption}
        </p>
      )}

      <div
        className="relative grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={axisCaption ?? 'Anchored scale'}
      >
        {bands.map((band) => {
          const Icon = getOptionIcon(band.icon)
          const isSelected = selected === band.value
          return (
            <button
              key={band.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(band.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isSelected
                  ? 'border-primary bg-primary/8 ring-2 ring-primary/25 ring-offset-2 ring-offset-background'
                  : 'border-border bg-card'
              )}
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-xl transition-colors',
                  isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground/65'
                )}
                aria-hidden
              >
                {Icon ? <Icon className="size-[1rem]" strokeWidth={1.75} /> : '•'}
              </span>
              <span className="text-[12px] font-semibold leading-tight tracking-tight text-foreground">
                {band.label}
              </span>
              {band.caption && (
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {band.caption}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="relative h-[2px] overflow-hidden rounded-full bg-border/50">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/35 transition-[width] duration-300"
          style={{
            width: selected
              ? `${((bands.findIndex((b) => b.value === selected) + 1) / bands.length) * 100}%`
              : '0%',
          }}
        />
      </div>
    </div>
  )
}
