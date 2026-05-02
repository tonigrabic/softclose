'use client'

import { createElement } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOptionIcon } from '@/lib/option-icons'
import type { SelectOption } from '@/lib/types'

interface ChipMultiProps {
  options: SelectOption[]
  selected: string[]
  onToggle: (value: string) => void
  groups?: { label: string; values: string[] }[]
}

/**
 * Lighter visual than SelectCards — chips you can multi-select. Use for
 * scope, structural changes, lighting layers, wishlist where the homeowner
 * may pick anywhere from 1 to many items.
 */
export function ChipMulti({ options, selected, onToggle, groups }: ChipMultiProps) {
  if (options.length === 0) return null

  // No grouping — flat layout
  if (!groups || groups.length === 0) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choices">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            option={opt}
            selected={selected.includes(opt.value)}
            onToggle={() => onToggle(opt.value)}
          />
        ))}
      </div>
    )
  }

  // Grouped layout — used by lighting (task / ambient / accent / controls).
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupOptions = options.filter((o) => group.values.includes(o.value))
        if (groupOptions.length === 0) return null
        return (
          <div key={group.label}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {groupOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  option={opt}
                  selected={selected.includes(opt.value)}
                  onToggle={() => onToggle(opt.value)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Chip({
  option,
  selected,
  onToggle,
}: {
  option: SelectOption
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
        'hover:border-foreground/20 active:scale-[0.98]',
        selected
          ? 'border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30'
          : 'border-border bg-card text-foreground/85'
      )}
    >
      <ChipIcon name={option.icon} selected={selected} />
      <span>{option.label}</span>
      {selected && <Check className="size-3 stroke-[3] text-primary" aria-hidden />}
    </button>
  )
}

function ChipIcon({ name, selected }: { name?: string; selected: boolean }) {
  const icon = getOptionIcon(name)
  if (!icon) return null
  return createElement(icon, {
    className: cn(
      'size-3.5 transition-colors',
      selected ? 'text-primary' : 'text-muted-foreground'
    ),
    strokeWidth: 1.75,
    'aria-hidden': true,
  })
}
