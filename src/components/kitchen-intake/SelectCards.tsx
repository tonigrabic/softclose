'use client'

import { cn } from '@/lib/utils'
import { getOptionIcon } from '@/lib/option-icons'
import type { SelectOption } from '@/lib/types'

interface SelectCardsProps {
  options: SelectOption[]
  selected: string[]
  multiSelect?: boolean
  onSelect: (value: string) => void
}

/**
 * Card grid for medium-sized choice sets. Each option may carry an
 * `illustration` (image data URL) for richer visual cards, an `icon`
 * (lucide name) for the icon tile, or both. When neither is present
 * the card falls back to a plain layout — kept for hidden taxonomy
 * choices like "Something else".
 */
export function SelectCards({ options, selected, multiSelect, onSelect }: SelectCardsProps) {
  const anyHasIllustration = options.some((o) => !!o.illustration)
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-3.5',
        anyHasIllustration ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'
      )}
      role="listbox"
      aria-multiselectable={multiSelect ?? false}
      aria-label="Choices"
    >
      {options.map((option) => {
        const isSelected = selected.includes(option.value)
        const Icon = getOptionIcon(option.icon)
        const hasIllustration = !!option.illustration
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(option.value)}
            className={cn(
              'group relative flex flex-col rounded-2xl border text-left shadow-sm transition-all duration-200 overflow-hidden',
              'hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'border-primary ring-2 ring-primary/25 ring-offset-2 ring-offset-background'
                : 'border-border'
            )}
          >
            {hasIllustration && (
              <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.illustration}
                  alt={option.imageAlt ?? option.label}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                {isSelected && <div className="absolute inset-0 bg-foreground/15" aria-hidden />}
              </div>
            )}
            <div
              className={cn(
                'flex flex-col items-start gap-2 px-4 py-3.5',
                hasIllustration && 'gap-1 py-3',
                isSelected ? 'bg-primary/8 text-foreground' : 'bg-card text-foreground'
              )}
            >
              {Icon && !hasIllustration && (
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl transition-colors',
                    isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground/70'
                  )}
                  aria-hidden
                >
                  <Icon className="size-[1.125rem]" strokeWidth={1.75} />
                </span>
              )}
              <span className="text-[0.9375rem] font-semibold leading-snug tracking-tight">
                {option.label}
              </span>
              {option.description && (
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
