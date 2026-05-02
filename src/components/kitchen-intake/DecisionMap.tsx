'use client'

import { Lock, Sparkles, CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DecisionCategory, LeadProfile } from '@/lib/types'

type DecisionValue = 'locked' | 'flexible' | 'undecided'

interface DecisionMapProps {
  categories: DecisionCategory[]
  value: NonNullable<LeadProfile['decisionConfidence']>
  onChange: (value: NonNullable<LeadProfile['decisionConfidence']>) => void
}

const CATEGORY_LABELS: Record<DecisionCategory, { label: string; description: string }> = {
  layout: {
    label: 'Layout',
    description: 'Where things go — walls, sink, hob, island.',
  },
  style: {
    label: 'Style',
    description: 'Modern, shaker, dark, organic — the overall vibe.',
  },
  materials: {
    label: 'Materials',
    description: 'Doors, worktops, hardware.',
  },
  appliances: {
    label: 'Appliances',
    description: 'What you keep, what you swap, integrated vs freestanding.',
  },
  timeline: {
    label: 'Timeline',
    description: 'When it happens.',
  },
  budget: {
    label: 'Budget',
    description: 'How much you&apos;re putting in.',
  },
}

const CHOICES: { value: DecisionValue; label: string; tone: string }[] = [
  { value: 'locked', label: 'Locked in', tone: 'text-emerald-700' },
  { value: 'flexible', label: 'Flexible', tone: 'text-blue-700' },
  { value: 'undecided', label: 'Undecided', tone: 'text-amber-700' },
]

function ChoiceIcon({ value, className }: { value: DecisionValue; className?: string }) {
  if (value === 'locked') return <Lock className={cn('size-3.5 stroke-[1.75]', className)} aria-hidden />
  if (value === 'flexible')
    return <Sparkles className={cn('size-3.5 stroke-[1.75]', className)} aria-hidden />
  return <CircleHelp className={cn('size-3.5 stroke-[1.75]', className)} aria-hidden />
}

export function DecisionMap({ categories, value, onChange }: DecisionMapProps) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        Tap one per row — this tells your designer where to push and where to listen.
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {categories.map((cat, idx) => {
          const meta = CATEGORY_LABELS[cat]
          const current = value[cat]
          return (
            <div
              key={cat}
              className={cn(
                'grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:gap-4',
                idx > 0 && 'border-t border-border'
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{meta.label}</p>
                <p
                  className="truncate text-[11px] text-muted-foreground"
                  // description may include &apos;
                  dangerouslySetInnerHTML={{ __html: meta.description }}
                />
              </div>
              <div className="flex gap-1.5">
                {CHOICES.map((c) => {
                  const isSelected = current === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...value,
                          [cat]: isSelected ? undefined : c.value,
                        })
                      }
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <ChoiceIcon value={c.value} className={isSelected ? c.tone : undefined} />
                      <span>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
