'use client'

import { motion } from 'framer-motion'
import { Sparkles, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import {
  DOOR_MATERIAL_OPTIONS,
  WORKTOP_OPTIONS,
  BACKSPLASH_OPTIONS,
  HARDWARE_OPTIONS,
} from '@/lib/material-options'
import { STYLE_OPTIONS } from '@/lib/style-options'
import type { LeadProfile, SelectOption } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ConfirmLookProps {
  profile: LeadProfile
  onChange: (patch: Partial<LeadProfile>) => void
  /** Were any fields prefilled from inspiration vision? Drives the heading copy. */
  hasPrefills: boolean
}

/**
 * "Confirm the look" step.
 *
 * Shows up to 5 chip rows (style, door, worktop, backsplash, hardware) with
 * the inspiration-vision best guesses pre-selected. Homeowner taps to confirm
 * or change. Multi-select for style; single-select for the rest.
 *
 * Design intent: deterministic, no AI calls, no surprises. Prefills are made
 * obvious with a soft "AI guess" pill so the homeowner knows where the
 * suggestion came from.
 */
export function ConfirmLook({ profile, onChange, hasPrefills }: ConfirmLookProps) {
  return (
    <div className="space-y-7">
      {hasPrefills && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs"
        >
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <p className="leading-relaxed text-foreground/85">
            We pre-selected what we read from your inspiration. Tap any chip to change it.
          </p>
        </motion.div>
      )}

      <ChipRow
        label="Style direction"
        helpText="What overall feel are you after? You can pick more than one."
        options={STYLE_OPTIONS}
        selected={profile.stylePreferences ?? []}
        onToggle={(v) =>
          onChange({
            stylePreferences: toggleArray(profile.stylePreferences, v),
          })
        }
        multiSelect
      />

      <ChipRow
        label="Door / drawer fronts"
        helpText="The cabinet face style."
        options={DOOR_MATERIAL_OPTIONS}
        selected={profile.doorMaterial ? [profile.doorMaterial] : []}
        onToggle={(v) => onChange({ doorMaterial: profile.doorMaterial === v ? undefined : v })}
      />

      <ChipRow
        label="Worktop / countertop"
        helpText="The work surface."
        options={WORKTOP_OPTIONS}
        selected={profile.worktopPreference ? [profile.worktopPreference] : []}
        onToggle={(v) =>
          onChange({ worktopPreference: profile.worktopPreference === v ? undefined : v })
        }
      />

      <ChipRow
        label="Backsplash"
        helpText="What sits behind the worktop."
        options={BACKSPLASH_OPTIONS}
        selected={profile.backsplashPreference ? [profile.backsplashPreference] : []}
        onToggle={(v) =>
          onChange({ backsplashPreference: profile.backsplashPreference === v ? undefined : v })
        }
      />

      <ChipRow
        label="Hardware / metals"
        helpText="The pulls, knobs, and tap finish."
        options={HARDWARE_OPTIONS}
        selected={profile.hardwareTier ? [profile.hardwareTier] : []}
        onToggle={(v) => onChange({ hardwareTier: profile.hardwareTier === v ? undefined : v })}
      />
    </div>
  )
}

function toggleArray(arr: string[] | undefined, v: string): string[] {
  const cur = arr ?? []
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
}

function ChipRow({
  label,
  helpText,
  options,
  selected,
  onToggle,
  multiSelect = false,
}: {
  label: string
  helpText?: string
  options: SelectOption[]
  selected: string[]
  onToggle: (v: string) => void
  multiSelect?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasSelection = selected.length > 0
  // Show 5 by default, full list if expanded.
  const VISIBLE = 5
  const collapsed = !expanded && options.length > VISIBLE
  const visibleOptions = collapsed
    ? options.filter((o) => selected.includes(o.value)).concat(
        options.filter((o) => !selected.includes(o.value)).slice(0, Math.max(0, VISIBLE - selected.length))
      )
    : options

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-foreground">{label}</h3>
        {hasSelection ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary/80">
            {selected.length} selected
          </span>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {multiSelect ? 'Pick any' : 'Pick one'}
          </span>
        )}
      </div>
      {helpText && (
        <p className="mb-2.5 text-[12.5px] leading-snug text-muted-foreground">{helpText}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visibleOptions.map((opt) => {
          const isSel = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={cn(
                'group rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all',
                isSel
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40'
              )}
              title={opt.description ?? ''}
            >
              <span>{opt.label}</span>
            </button>
          )
        })}
        {collapsed && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-dashed border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <ChevronDown className="mr-0.5 inline size-3 stroke-[2]" aria-hidden />
            More options
          </button>
        )}
      </div>
    </div>
  )
}
