'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageSelect, type UploadedReference } from './ImageSelect'
import { STYLE_OPTIONS } from '@/lib/style-options'
import type { SpaceVisionResult } from '@/lib/types'
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
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
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Vision call failed (${res.status})`)
      }
      onInspirationVisionResult(data.result as InspirationVisionResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not analyze inspiration')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const hasAny = selectedStyles.length > 0 || uploadedRefs.length > 0

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Pick a direction
        </p>
        <ImageSelect
          options={STYLE_OPTIONS}
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
            <ReadbackPanel
              result={inspirationVisionResult}
              onClear={() => onInspirationVisionResult(null)}
            />
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
                  Reading your inspiration…
                </>
              ) : (
                <>
                  <Sparkles className="size-4 stroke-[1.75]" aria-hidden />
                  Analyze inspiration
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

function ReadbackPanel({
  result,
  onClear,
}: {
  result: InspirationVisionResult
  onClear: () => void
}) {
  const lines: { label: string; value: string }[] = []
  if (result.styleGuess) lines.push({ label: 'Style read', value: result.styleGuess.replace(/_/g, ' ') })
  if (result.doorMaterialGuess)
    lines.push({ label: 'Door read', value: result.doorMaterialGuess.replace(/_/g, ' ') })
  if (result.worktopGuess) lines.push({ label: 'Worktop read', value: result.worktopGuess.replace(/_/g, ' ') })
  if (result.backsplashGuess)
    lines.push({ label: 'Backsplash', value: result.backsplashGuess.replace(/_/g, ' ') })
  if (result.hardwareTierGuess)
    lines.push({ label: 'Hardware', value: result.hardwareTierGuess.replace(/_/g, ' ') })
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Picked up from your picks
          </p>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Re-analyze
          </button>
        </div>
        {result.summary && (
          <p className="text-sm italic text-foreground/85">&ldquo;{result.summary}&rdquo;</p>
        )}
        {lines.length > 0 && (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {lines.map((l) => (
              <li
                key={l.label}
                className="flex items-baseline justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5"
              >
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {l.label}
                </span>
                <span className="text-xs font-medium text-foreground">{l.value}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          We&apos;ll pre-fill the rest from this — you&apos;ll get to confirm everything in a moment.
        </p>
      </motion.div>
    </AnimatePresence>
  )
}

