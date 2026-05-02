'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RotateCcw, Check, AlertCircle, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConceptRender as ConceptRenderRecord, LeadProfile } from '@/lib/types'

const MAX_RENDERS_PER_SESSION = 5

const NUDGE_PRESETS: { label: string; value: string }[] = [
  { label: 'Warmer', value: 'warmer overall palette' },
  { label: 'Cooler', value: 'cooler overall palette' },
  { label: 'Darker cabinets', value: 'darker cabinet finish' },
  { label: 'Lighter cabinets', value: 'lighter cabinet finish' },
  { label: 'Lighter floor', value: 'lighter floor tone' },
  { label: 'Darker floor', value: 'darker floor tone' },
  { label: 'No upper cabinets', value: 'remove upper wall cabinets' },
  { label: 'Open shelving', value: 'add open shelving instead of upper cabinets' },
  { label: 'Bolder hardware', value: 'bolder cabinet hardware' },
  { label: 'Subtler hardware', value: 'subtler, more minimal hardware' },
]

interface ConceptRenderProps {
  /** Anchor photos available — usually the homeowner's space photos. */
  anchorPhotos: string[]
  /** History of renders the user has generated this session. */
  renders: ConceptRenderRecord[]
  /** ID of the render the user has locked in (display-only marker). */
  chosenId: string | null
  /** Profile values that drive the prompt. */
  profile: LeadProfile
  /** Append a new render to history. */
  onRenderAdded: (render: ConceptRenderRecord) => void
  /** User locked in a render. */
  onChoose: (id: string) => void
  /** User skipped (no render this session). */
  onSkip: () => void
  /**
   * If true, kick off the first render automatically when this component mounts
   * (and we have an anchor photo + at least one style/material signal). The
   * homeowner can still iterate or skip after.
   */
  autoStart?: boolean
}

export function ConceptRender({
  anchorPhotos,
  renders,
  chosenId,
  profile,
  onRenderAdded,
  onChoose,
  onSkip,
  autoStart = false,
}: ConceptRenderProps) {
  const [anchorIndex, setAnchorIndex] = useState(0)
  const [activeNudges, setActiveNudges] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoStartedRef = useRef(false)

  const currentRender = renders[renders.length - 1] ?? null
  const used = renders.length
  const remaining = Math.max(0, MAX_RENDERS_PER_SESSION - used)
  const capped = remaining === 0

  // Auto-start the first render if asked and we have enough signal to make it
  // worth trying. Guarded by autoStartedRef so we never fire twice (Strict Mode
  // double-mounts in dev) and never on a re-entry where renders already exist.
  useEffect(() => {
    if (!autoStart) return
    if (autoStartedRef.current) return
    if (renders.length > 0) return
    if (anchorPhotos.length === 0) return
    if (isGenerating) return
    const hasSignal = Boolean(
      profile.stylePreferences?.length ||
        profile.doorMaterial ||
        profile.worktopPreference ||
        profile.spaceVisionResult?.styleHints?.length
    )
    if (!hasSignal) return
    autoStartedRef.current = true
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, anchorPhotos.length, renders.length])

  if (anchorPhotos.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-300/50 bg-amber-50/60 px-4 py-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
          <p className="text-sm leading-relaxed">
            We need a photo of your kitchen to anchor the concept render. We&apos;ll skip this step and use the catalog references in your wrap-up brief instead.
          </p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
        >
          Skip render
        </button>
      </div>
    )
  }

  function toggleNudge(value: string) {
    setActiveNudges((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  async function generate() {
    if (capped) return
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/render-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorPhoto: anchorPhotos[anchorIndex],
          style: profile.stylePreferences?.[0],
          doorMaterial: profile.doorMaterial,
          worktopPreference: profile.worktopPreference,
          backsplashPreference: profile.backsplashPreference,
          hardwareTier: profile.hardwareTier,
          hardwareBrand: profile.hardwareBrand,
          cabinetConstruction: profile.cabinetConstruction,
          appliancesIntegrated: profile.appliancesIntegrated,
          visionSummary: profile.spaceVisionResult?.summary,
          styleHints: profile.spaceVisionResult?.styleHints,
          materialHints: profile.spaceVisionResult?.materialHints,
          nudges: activeNudges,
          previousRenderId: currentRender?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Render failed')
      const record: ConceptRenderRecord = {
        id: data.id,
        imageDataUrl: data.imageDataUrl,
        prompt: data.prompt,
        modelVersion: data.modelVersion,
        anchorPhotoIndex: anchorIndex,
        nudges: data.nudges ?? activeNudges,
        generatedAt: data.generatedAt,
      }
      onRenderAdded(record)
      setActiveNudges([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate render')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Disclosure */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50/60 px-3 py-2.5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
        <p className="text-xs leading-relaxed">
          <strong className="font-semibold">AI concept</strong> — a render anchored to your space photo, based on your style + material picks. Use it to react: what feels right, what feels off. It is not a literal commitment of what you&apos;ll receive.
        </p>
      </div>

      {/* Render display */}
      <AnimatePresence mode="wait">
        {currentRender ? (
          <motion.div
            key={currentRender.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentRender.imageDataUrl}
                alt="AI concept render"
                className="h-auto w-full"
              />
              {isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                  <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold">
                    <span className="inline-block size-2 animate-pulse rounded-full bg-white" />
                    Generating new version…
                  </div>
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                AI Concept
              </span>
              {chosenId === currentRender.id && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  <Check className="size-3 stroke-[3]" aria-hidden />
                  Chosen
                </span>
              )}
            </div>
            {currentRender.nudges.length > 0 && (
              <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                Iteration: {currentRender.nudges.join(' · ')}
              </p>
            )}
          </motion.div>
        ) : (
          <button
            type="button"
            key="generate-first"
            onClick={generate}
            disabled={isGenerating}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/50 py-14 text-sm font-semibold transition-colors',
              !isGenerating && 'hover:border-primary/40 hover:bg-accent/40',
              isGenerating && 'cursor-wait text-muted-foreground'
            )}
          >
            {isGenerating ? (
              <>
                <span className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-2 rounded-full bg-primary/60"
                      animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.12 }}
                    />
                  ))}
                </span>
                <span>Rendering your concept (this can take 20–40s)…</span>
              </>
            ) : (
              <>
                <Sparkles className="size-5 stroke-[1.5]" aria-hidden />
                <span>Generate concept render</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Anchored to your space photo + your style picks
                </span>
              </>
            )}
          </button>
        )}
      </AnimatePresence>

      {/* Anchor photo selector — when more than one */}
      {anchorPhotos.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Anchor shot
          </p>
          <div className="flex gap-2">
            {anchorPhotos.map((photo, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnchorIndex(i)}
                className={cn(
                  'relative size-14 overflow-hidden rounded-lg ring-1 transition-all',
                  anchorIndex === i ? 'ring-2 ring-primary' : 'ring-border hover:ring-foreground/30'
                )}
                aria-pressed={anchorIndex === i}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="h-full w-full object-cover" />
                {anchorIndex === i && (
                  <span className="absolute right-0.5 top-0.5 rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                    USE
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nudge chips */}
      {currentRender && !capped && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Try a tweak (optional, multi-select)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NUDGE_PRESETS.map((n) => {
              const isSelected = activeNudges.includes(n.value)
              return (
                <button
                  key={n.value}
                  type="button"
                  onClick={() => toggleNudge(n.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  {n.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Action row */}
      {currentRender && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={generate}
            disabled={isGenerating || capped}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors',
              !capped && 'hover:bg-accent/40',
              capped && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RotateCcw className="size-4 stroke-[1.75]" aria-hidden />
            {capped
              ? 'No more iterations'
              : activeNudges.length > 0
                ? `Regenerate with ${activeNudges.length} tweak${activeNudges.length > 1 ? 's' : ''}`
                : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={() => onChoose(currentRender.id)}
            disabled={chosenId === currentRender.id}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-md transition-all',
              chosenId === currentRender.id
                ? 'bg-emerald-500 text-white'
                : 'bg-primary text-primary-foreground hover:brightness-[1.06]'
            )}
          >
            <Check className="size-4 stroke-[2]" aria-hidden />
            {chosenId === currentRender.id ? 'Chosen — continue ↓' : 'Looks good — choose this'}
          </button>
        </div>
      )}

      {/* Counter + skip */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {used} / {MAX_RENDERS_PER_SESSION} renders used
          {capped && ' — your designer can keep iterating with you'}
        </span>
        {!chosenId && (
          <button
            type="button"
            onClick={onSkip}
            className="font-medium text-muted-foreground hover:text-foreground"
          >
            Skip the render
          </button>
        )}
      </div>

      {/* Try another shot */}
      {anchorPhotos.length === 1 && currentRender && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Camera className="mt-0.5 size-3 stroke-[1.75]" aria-hidden />
          To try a different angle, add another photo earlier in the flow and re-run this step.
        </p>
      )}

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}
