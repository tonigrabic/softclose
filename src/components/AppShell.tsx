'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { ProgressBar } from '@/components/kitchen-intake/ProgressBar'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { MockBadge } from '@/components/MockBadge'
import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * The one app shell for the whole journey — funnel steps AND the builder render
 * through this, so the navigation chrome never swaps mid-flow (PR1 of the IA
 * refactor; see handoff/IMPLEMENTATION.md).
 *
 * Two content modes:
 *  - no `rightRail`  → a single centered column (the capture/close steps, which
 *    look exactly as the funnel does today).
 *  - with `rightRail` → a wide layout offset past the fixed left nav, with a
 *    persistent right rail (render anchor + live price range) — used by the
 *    builder and any step that wants the range in view.
 *
 * Desktop: the left nav is a fixed aside. Mobile (below `lg`): a sticky header
 * with a progress pill ("Act · step · n/m") opens a bottom-sheet rendering the
 * SAME `nav` node — one nav model, two presentations — and an optional
 * `mobileDock` (the live range bar) pins to the bottom edge.
 */
export function AppShell({
  progressPercent,
  nav,
  rightRail,
  mobilePillLabel,
  mobileDock,
  children,
}: {
  progressPercent: number
  /** Contents of the left navigation (fixed aside on desktop, bottom sheet on mobile). */
  nav: ReactNode
  /** Optional persistent right rail (render anchor + live price range). */
  rightRail?: ReactNode
  /** "Act · step · n/m" label for the mobile progress pill (see journeyPillLabel). */
  mobilePillLabel?: string
  /** Optional bar pinned to the bottom edge on mobile (the live range dock). */
  mobileDock?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslations()
  const [sheetOpen, setSheetOpen] = useState(false)

  // While the sheet is up: lock body scroll, close on Escape.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [sheetOpen])

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <ProgressBar percent={progressPercent} />
      <MockBadge />

      {/* Language toggle — fixed top-right on desktop; on mobile it lives in
          the sticky header row so it can't overlap the pill. */}
      <LanguageSwitcher className="fixed right-4 top-3 z-40 hidden lg:block" />

      {/* Mobile header: the progress pill is the nav entry point. */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden">
        {mobilePillLabel ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40"
          >
            <span className="truncate">{mobilePillLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 stroke-[2] text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <span />
        )}
        <LanguageSwitcher />
      </div>

      {/* Fixed left nav — floats over the layout so the centered column doesn't
          shift. Desktop only; mobile uses the sheet below. */}
      <aside className="fixed left-0 top-0 z-30 hidden h-dvh w-64 shrink-0 overflow-y-auto px-5 py-10 lg:flex lg:w-72 lg:flex-col lg:px-6">
        {nav}
      </aside>

      {rightRail ? (
        // Wide mode: offset past the fixed nav, center body + right rail.
        <div className={cn('lg:pl-72', mobileDock && 'pb-24 lg:pb-0')}>
          <div className="mx-auto flex w-full max-w-[88rem] gap-6 px-6 py-10 lg:gap-8 lg:px-10 lg:py-12">
            <main className="min-w-0 flex-1">{children}</main>
            {/* Sticky, independently-scrolling right rail so the live estimate
                stays visible while the center content scrolls. */}
            <div className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] w-80 shrink-0 self-start overflow-y-auto pb-2 lg:block xl:w-96">
              {rightRail}
            </div>
          </div>
        </div>
      ) : (
        // Centered mode: identical to today's funnel main.
        <main
          className={cn(
            'mx-auto w-full max-w-3xl px-8 py-14 lg:px-14 lg:py-16',
            mobileDock && 'pb-28 lg:pb-16'
          )}
        >
          {children}
        </main>
      )}

      {/* Pinned bottom bar (mobile): the live range never scrolls away. */}
      {mobileDock && <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">{mobileDock}</div>}

      {/* Bottom-sheet nav (mobile): the same `nav` node as the desktop aside. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('builder.shell.preview.close')}
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-background px-5 pb-8 pt-4 shadow-2xl"
            onClickCapture={(e) => {
              // Picking any step (or action) inside the rail closes the sheet.
              if ((e.target as HTMLElement).closest('button')) setSheetOpen(false)
            }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
            {nav}
          </div>
        </div>
      )}
    </div>
  )
}
