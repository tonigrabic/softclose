'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2, X } from 'lucide-react'
import { tDynamic, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

/**
 * The persistent "render anchor" card for the shared right rail — the concept
 * image as a small sticky card with a click-to-enlarge lightbox. Used by both
 * the funnel (from `confirm_look` onward) and the builder, so the right rail's
 * render anchor is byte-identical across the journey and never swaps
 * (PR1/PR2 of the IA refactor; see handoff/IMPLEMENTATION.md).
 */
export function RenderAnchorCard({
  src,
  summary,
  locale = DEFAULT_LOCALE,
}: {
  /** Render (or anchor photo) to show. */
  src: string
  /** One-line room summary shown under the image (shape + dimensions). */
  summary?: string
  locale?: Locale
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="group relative block w-full"
          aria-label={tDynamic('builder.shell.preview.enlarge', locale)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[10px] font-semibold text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-3 stroke-[2]" aria-hidden />
            {tDynamic('builder.shell.preview.enlarge', locale)}
          </span>
        </button>
        <div className="border-t border-border/60 bg-card/80 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {tDynamic('builder.shell.title', locale)}
          </p>
          {summary && (
            <p className="mt-0.5 text-[12px] font-medium leading-snug text-foreground">{summary}</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-md sm:p-8"
            onClick={() => setLightboxOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={tDynamic('builder.shell.preview.lightboxLabel', locale)}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground shadow-md transition-colors hover:bg-card"
              aria-label={tDynamic('builder.shell.preview.close', locale)}
            >
              <X className="size-4 stroke-[2]" aria-hidden />
            </button>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-full max-w-6xl flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl"
              />
              {summary && (
                <p className="text-center text-[12px] text-muted-foreground">{summary}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
