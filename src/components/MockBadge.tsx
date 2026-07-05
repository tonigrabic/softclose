'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * "MOCK AI" pill — visible whenever the app runs with mocked AI routes
 * (`npm run dev:mock`), so nobody mistakes canned fixtures for real reads.
 * Clicking it opens a small card explaining what exactly is canned and how to
 * get the real AI back. Dev-only affordance; hardcoded English is fine.
 *
 * Bottom-RIGHT (bottom-left is the Next.js dev-tools button). Raised above the
 * mobile live-range dock below `lg`; the /builder harness chip stacks above it.
 */
export function MockBadge() {
  const [open, setOpen] = useState(false)
  if (process.env.NEXT_PUBLIC_MOCK_AI !== '1') return null

  return (
    <div className="fixed bottom-24 right-4 z-[70] flex flex-col items-end gap-2 lg:bottom-4">
      {open && (
        <div className="w-72 rounded-2xl border border-amber-500/40 bg-card p-3.5 text-[12px] leading-relaxed text-foreground shadow-2xl">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
              Mock AI mode
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <X className="size-3 stroke-[2]" aria-hidden />
            </button>
          </div>
          <p className="text-muted-foreground">
            Every AI route returns a canned fixture — instant and free, no OpenAI key.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            <li>Space read: sample L-shape kitchen (any photo works)</li>
            <li>Render: bundled sample image, always the same</li>
            <li>Wishlist &ldquo;translation&rdquo;: comma-split echo</li>
            <li>Rate limits are off — spam freely</li>
          </ul>
          <p className="mt-1.5 text-muted-foreground">
            Real AI: <code className="rounded bg-muted px-1 py-0.5 text-[11px]">npm run dev</code> ·
            Builder-only harness:{' '}
            <a href="/builder" className="font-semibold text-primary hover:underline">
              /builder
            </a>
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 shadow-sm backdrop-blur transition-colors hover:bg-amber-500/25 dark:text-amber-400"
      >
        Mock AI
      </button>
    </div>
  )
}
