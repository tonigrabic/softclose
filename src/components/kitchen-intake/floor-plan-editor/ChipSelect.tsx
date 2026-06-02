'use client'

/**
 * ChipSelect — a chip-shaped button that opens a small floating option list.
 * Used to compose "sentence-style" UIs: every variable in a sentence becomes a
 * chip, and tapping it lets the user pick from a list (or type a custom value).
 *
 * The popover is rendered into document.body via a React portal so it escapes
 * any ancestor `overflow: hidden | auto` — important because the editor's
 * selection overlay panel scrolls internally, and a popover constrained to
 * that panel would get clipped. The portal also ensures a single global
 * stacking context for popovers.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ChipOption<T> {
  value: T
  label: string
  /** Optional small caption shown under the label, e.g. "≈ 110 cm". */
  hint?: string
  /** Disable this option but still render it (e.g. wall is currently open). */
  disabled?: boolean
}

interface ChipSelectProps<T> {
  /** Currently selected value. */
  value: T
  /** Options to choose from. */
  options: ChipOption<T>[]
  /** Called with the new value when the user picks one. */
  onChange: (value: T) => void
  /** What to render in the chip when collapsed. Defaults to the matching option's label. */
  display?: string
  /** Aria label / popover title. */
  label: string
  /** Visual variant — 'inline' embeds in prose, 'standalone' is a normal control. */
  variant?: 'inline' | 'standalone'
  /** Optional accent for the chip text — useful when chip is part of running prose. */
  tone?: 'primary' | 'muted'
  /**
   * If provided, the popover renders a "Custom" row that, when chosen, calls
   * this with the user's typed string. Return the canonical T (or null to
   * reject). Used by the Size chip to accept "70 cm" / "8'6"".
   */
  onCustomValue?: (raw: string) => T | null
  /** Placeholder for the custom-value input. */
  customPlaceholder?: string
  disabled?: boolean
  className?: string
}

const POPOVER_GAP = 4
const POPOVER_MARGIN = 8

export function ChipSelect<T>({
  value,
  options,
  onChange,
  display,
  label,
  variant = 'inline',
  tone = 'primary',
  onCustomValue,
  customPlaceholder = 'Type a value',
  disabled = false,
  className,
}: ChipSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const popoverId = useId()

  // Compute popover position anchored to the chip button. Rerun whenever the
  // popover opens, the user scrolls (any ancestor — capture phase), or the
  // viewport resizes. We measure the popover after mount to flip vertically
  // and clamp horizontally so it never escapes the viewport.
  const [maxHeight, setMaxHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    function recompute() {
      const btn = buttonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const pop = popoverRef.current
      const naturalHeight = pop?.offsetHeight ?? 240
      const popWidth = pop?.offsetWidth ?? 220

      const vpW = window.innerWidth
      const vpH = window.innerHeight

      // Decide placement based on which side has more room. If the natural
      // popover doesn't fit either side fully, pick the side with more room
      // and constrain `maxHeight` so the popover scrolls internally.
      const roomBelow = vpH - rect.bottom - POPOVER_GAP - POPOVER_MARGIN
      const roomAbove = rect.top - POPOVER_GAP - POPOVER_MARGIN
      const fitsBelow = naturalHeight <= roomBelow
      const fitsAbove = naturalHeight <= roomAbove

      let placement: 'below' | 'above'
      if (fitsBelow) placement = 'below'
      else if (fitsAbove) placement = 'above'
      else placement = roomBelow >= roomAbove ? 'below' : 'above'

      const cappedRoom = Math.max(160, placement === 'below' ? roomBelow : roomAbove)
      setMaxHeight(naturalHeight > cappedRoom ? cappedRoom : null)

      const allottedHeight = Math.min(naturalHeight, cappedRoom)
      const top =
        placement === 'below'
          ? rect.bottom + POPOVER_GAP
          : rect.top - allottedHeight - POPOVER_GAP

      const centered = rect.left + rect.width / 2 - popWidth / 2
      const left = Math.max(POPOVER_MARGIN, Math.min(vpW - popWidth - POPOVER_MARGIN, centered))

      setPos({ top, left, placement })
    }

    recompute()
    // Run again on the next frame so we have measured popover dimensions.
    const raf = window.requestAnimationFrame(recompute)
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open])

  // Close on outside click (anywhere except the chip button or the popover)
  // and on Escape.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (buttonRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matched = options.find((o) => Object.is(o.value, value))
  const buttonText = display ?? matched?.label ?? '—'

  function commitCustom() {
    if (!onCustomValue) return
    const parsed = onCustomValue(customText)
    if (parsed === null) {
      setCustomError('Try e.g. 60, 60 cm, 2′, or 2′ 6″')
      return
    }
    setCustomError(null)
    setCustomText('')
    onChange(parsed)
    setOpen(false)
  }

  const popoverNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={popoverRef}
          id={popoverId}
          role="listbox"
          aria-label={label}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            // Higher than the intake's sticky CTA / nav bar (which uses z-50).
            zIndex: 1000,
            maxHeight: maxHeight ?? undefined,
          }}
          className={cn(
            'flex min-w-[200px] max-w-[260px] flex-col rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl',
            // Hide until first measurement to avoid a flash at top-left.
            !pos && 'pointer-events-none opacity-0'
          )}
        >
          <p className="shrink-0 px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {options.map((opt, i) => {
              const selected = Object.is(opt.value, value)
              return (
                <li key={i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-baseline justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] transition-colors',
                      selected ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-accent/50',
                      opt.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                    )}
                  >
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="font-mono text-[10px] text-muted-foreground">{opt.hint}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {onCustomValue && (
            <div className="mt-1 shrink-0 border-t border-border/70 pt-1.5">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Or type
              </p>
              <div className="flex items-center gap-1 px-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={customText}
                  onChange={(e) => {
                    setCustomText(e.target.value)
                    setCustomError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitCustom()
                    }
                  }}
                  placeholder={customPlaceholder}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={commitCustom}
                  disabled={!customText.trim()}
                  className="rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  Set
                </button>
              </div>
              {customError && (
                <p className="mt-1 px-2 text-[10px] font-medium text-destructive">{customError}</p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <span className={cn('relative inline-block align-baseline', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={label}
        className={cn(
          'inline-flex items-baseline gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold transition-colors',
          variant === 'inline' ? 'mx-0.5' : '',
          tone === 'primary'
            ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
            : 'border-border bg-card text-foreground hover:bg-accent/40',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <span className="leading-tight">{buttonText}</span>
        <ChevronDown className="size-3 stroke-[2] opacity-70" aria-hidden />
      </button>

      {typeof document !== 'undefined' && createPortal(popoverNode, document.body)}
    </span>
  )
}
