'use client'

import { cn } from '@/lib/utils'
import { useTranslations, tDynamic } from '@/lib/i18n'

/**
 * Generic chip row used by every "pick one of N enum values" picker.
 * Looks up labels via the i18n key prefix + value, e.g.
 *
 *   <ChipRow keyPrefix="hardware.tier" values={['budget','mid','premium']}
 *            selected={state.hardware.drawerSystemTier} onChange={...} />
 *
 * resolves labels from `hardware.tier.budget` etc.
 */
export function ChipRow<T extends string>({
  keyPrefix,
  values,
  selected,
  onChange,
}: {
  keyPrefix: string
  values: readonly T[]
  selected: T | undefined | null
  onChange: (v: T) => void
}) {
  const { locale } = useTranslations()
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
            selected === v
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          )}
        >
          {tDynamic(`${keyPrefix}.${v}`, locale)}
        </button>
      ))}
    </div>
  )
}

/** Toggle row for boolean flags. */
export function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-3 py-2">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'inline-block size-4 transform rounded-full bg-background shadow transition-transform',
            on ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}
