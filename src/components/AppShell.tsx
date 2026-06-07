'use client'

import type { ReactNode } from 'react'
import { ProgressBar } from '@/components/kitchen-intake/ProgressBar'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

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
 * The left nav is a fixed aside (desktop only) so it never shifts the centered
 * content; on smaller screens the nav is the caller's responsibility (mobile
 * sheet comes later).
 */
export function AppShell({
  progressPercent,
  nav,
  rightRail,
  children,
}: {
  progressPercent: number
  /** Contents of the fixed left navigation aside (header + step nav). */
  nav: ReactNode
  /** Optional persistent right rail (render anchor + live price range). */
  rightRail?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <ProgressBar percent={progressPercent} />

      {/* Language toggle — fixed top-right so it's reachable on every step of the
          journey (funnel + builder both render through this shell). */}
      <LanguageSwitcher className="fixed right-4 top-3 z-40" />

      {/* Fixed left nav — floats over the layout so the centered column doesn't
          shift. Desktop only; mobile nav is handled separately. */}
      <aside className="fixed left-0 top-0 z-30 hidden h-dvh w-64 shrink-0 overflow-y-auto px-5 py-10 lg:flex lg:w-72 lg:flex-col lg:px-6">
        {nav}
      </aside>

      {rightRail ? (
        // Wide mode: offset past the fixed nav, center body + right rail.
        <div className="lg:pl-72">
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
        <main className="mx-auto w-full max-w-3xl px-8 py-14 lg:px-14 lg:py-16">{children}</main>
      )}
    </div>
  )
}
