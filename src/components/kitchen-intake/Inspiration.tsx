'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import { ImageSelect, type UploadedReference } from './ImageSelect'
import { STYLE_OPTIONS } from '@/lib/style-options'
import type { SpaceVisionResult } from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'
import { ApiError, apiErrorKey, readJson } from '@/lib/api/client'

interface InspirationProps {
  selectedStyles: string[]
  onSelectedStylesChange: (styles: string[]) => void
  uploadedRefs: UploadedReference[]
  onUploadedRefsChange: (refs: UploadedReference[]) => void
  /** Existing space vision context (used to enrich the inspiration vision call). */
  spaceVisionResult: SpaceVisionResult | null
  /** Result of the AI vision pass on the picked inspiration. */
  inspirationVisionResult: InspirationVisionResult | null
  onInspirationVisionResult: (r: InspirationVisionResult | null) => void
}

export function Inspiration({
  selectedStyles,
  onSelectedStylesChange,
  uploadedRefs,
  onUploadedRefsChange,
  spaceVisionResult,
  inspirationVisionResult,
  onInspirationVisionResult,
}: InspirationProps) {
  const { t, tDynamic } = useTranslations()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const styleOptions = STYLE_OPTIONS.map((o) => ({ ...o, label: tDynamic(`style.${o.value}`) }))
  const [error, setError] = useState<string | null>(null)

  function handleStyle(value: string) {
    onSelectedStylesChange(
      selectedStyles.includes(value)
        ? selectedStyles.filter((v) => v !== value)
        : [...selectedStyles, value]
    )
    // Invalidate any prior inspiration vision since the basis changed.
    if (inspirationVisionResult) onInspirationVisionResult(null)
  }

  async function analyze() {
    if (uploadedRefs.length === 0 && selectedStyles.length === 0) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const dataUrls: string[] = []
      const externalUrls: string[] = []
      for (const r of uploadedRefs) {
        if (r.imageUrl.startsWith('data:image/')) dataUrls.push(r.imageUrl)
        else externalUrls.push(r.imageUrl)
      }
      const res = await fetch('/api/inspiration-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencePhotos: dataUrls,
          referenceUrls: externalUrls,
          selectedStyles,
          spaceSummary: spaceVisionResult?.summary,
        }),
      })
      const data = await readJson(res)
      if (!res.ok || data.error) {
        throw new ApiError(data.error ?? `Vision call failed (${res.status})`, res.status, data.code as string | undefined)
      }
      onInspirationVisionResult(data.result as InspirationVisionResult)
    } catch (err) {
      console.warn('[inspiration-vision]', err)
      setError(t(apiErrorKey(err, 'inspiration.error')))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const hasAny = selectedStyles.length > 0 || uploadedRefs.length > 0

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t('inspiration.direction')}
        </p>
        <ImageSelect
          options={styleOptions}
          selected={selectedStyles}
          onSelect={handleStyle}
          uploadedRefs={uploadedRefs}
          onUploadedRefsChange={(refs) => {
            onUploadedRefsChange(refs)
            if (inspirationVisionResult) onInspirationVisionResult(null)
          }}
        />
      </div>

      {hasAny && (
        <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
          {inspirationVisionResult ? (
            <ReadbackPanel onClear={() => onInspirationVisionResult(null)} />
          ) : (
            <button
              type="button"
              onClick={analyze}
              disabled={isAnalyzing}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all',
                isAnalyzing && 'cursor-wait opacity-80',
                !isAnalyzing && 'hover:brightness-[1.06]'
              )}
            >
              {isAnalyzing ? (
                <>
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-primary-foreground/80"
                        animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.12 }}
                      />
                    ))}
                  </span>
                  {t('inspiration.analyzing')}
                </>
              ) : (
                <>
                  <Sparkles className="size-4 stroke-[1.75]" aria-hidden />
                  {t('inspiration.analyze')}
                </>
              )}
            </button>
          )}
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}

/**
 * Compact "done" row after the inspiration read. The detailed list of guesses
 * (style / door / worktop / …) was cut after maker testing (2026-09-23) as
 * noise — the read still pre-fills the render and the builder; the homeowner
 * only needs to know it happened, and a way to run it again.
 */
function ReadbackPanel({ onClear }: { onClear: () => void }) {
  const { t } = useTranslations()
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Check className="size-4 shrink-0 stroke-[2.25] text-primary" aria-hidden />
          {t('inspiration.readback.done')}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {t('inspiration.readback.reanalyze')}
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
