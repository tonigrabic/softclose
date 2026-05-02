'use client'

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Sparkles, AlertCircle, RotateCcw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FloorPlanSchematic } from './FloorPlanSchematic'
import type { SpaceVisionResult } from '@/lib/types'

const MAX_PHOTOS = 4
const MAX_BYTES_PER_PHOTO = 5 * 1024 * 1024

interface SpaceCaptureProps {
  photos: string[]
  onPhotosChange: (photos: string[]) => void
  visionResult: SpaceVisionResult | null
  onVisionResult: (result: SpaceVisionResult | null) => void
  /** Notifies parent when the user explicitly skips this step. */
  onSkip: () => void
  /** Notifies parent when the user wants to confirm and continue. */
  onConfirm: () => void
}

type Phase = 'awaiting' | 'analyzing' | 'reviewing' | 'rejected' | 'error'

export function SpaceCapture({
  photos,
  onPhotosChange,
  visionResult,
  onVisionResult,
  onSkip,
  onConfirm,
}: SpaceCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const phase: Phase = isAnalyzing
    ? 'analyzing'
    : analyzeError
      ? 'error'
      : visionResult && !visionResult.lookedLikeKitchen
        ? 'rejected'
        : visionResult
          ? 'reviewing'
          : 'awaiting'

  function handleFiles(files: FileList | null) {
    if (!files) return
    const accepted = Array.from(files).slice(0, MAX_PHOTOS - photos.length)
    if (accepted.length === 0) return
    setError(null)
    const valid = accepted.filter((f) => {
      if (f.size > MAX_BYTES_PER_PHOTO) {
        setError(`"${f.name}" is over 5MB — please pick a smaller photo.`)
        return false
      }
      return true
    })
    const promises = valid.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })
    )
    Promise.all(promises).then((results) => {
      onPhotosChange([...photos, ...results].slice(0, MAX_PHOTOS))
    })
  }

  function removePhoto(idx: number) {
    onPhotosChange(photos.filter((_, i) => i !== idx))
    onVisionResult(null)
    setAnalyzeError(null)
  }

  async function analyze() {
    if (photos.length === 0) return
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const res = await fetch('/api/space-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Vision call failed (${res.status})`)
      }
      onVisionResult(data.result as SpaceVisionResult)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Could not analyze photos')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function startOver() {
    onPhotosChange([])
    onVisionResult(null)
    setAnalyzeError(null)
    setError(null)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Three or four wide shots of your current kitchen — corner-to-corner is ideal. Snap them now or upload from your camera roll.
      </p>

      {phase === 'awaiting' && (
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 transition-all duration-200',
              'hover:border-primary/40 hover:bg-accent/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isDragging
                ? 'scale-[1.01] border-primary bg-primary/5 shadow-inner'
                : 'border-border bg-card/50'
            )}
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Camera className="size-6 stroke-[1.5]" aria-hidden />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Add photos of your space</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Tap or drag in — JPG, PNG, HEIC up to 5MB each</p>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
              Up to {MAX_PHOTOS} photos
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/40"
            >
              <Camera className="size-3.5 stroke-[1.75]" aria-hidden />
              Take photo
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 rounded-xl border border-transparent bg-transparent py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Skip — no photos right now
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}

      {photos.length > 0 && phase !== 'reviewing' && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((src, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removePhoto(i)
                }}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 shadow-sm transition-all group-hover:opacity-100"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {phase === 'awaiting' && photos.length > 0 && (
        <button
          type="button"
          onClick={analyze}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-[1.06]"
        >
          <Sparkles className="size-4 stroke-[1.75]" aria-hidden />
          Read my space ({photos.length} photo{photos.length > 1 ? 's' : ''})
        </button>
      )}

      <AnimatePresence>
        {phase === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 px-5 py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-2 rounded-full bg-primary/60"
                  animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <p className="text-sm font-medium text-foreground">Reading your kitchen…</p>
            <p className="text-xs text-muted-foreground">
              Pulling out layout, openings, sink and hob positions, style and material hints.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'rejected' && (
        <div className="space-y-3 rounded-2xl border border-amber-300/50 bg-amber-50/60 px-4 py-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
            <p className="text-sm leading-relaxed">
              Hmm — these don&apos;t look like a kitchen. Could you re-upload, or skip and tell me about the space in your own words?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startOver}
              className="flex-1 rounded-lg border border-border bg-card py-2 text-xs font-semibold text-foreground hover:bg-accent/40"
            >
              <RotateCcw className="-mt-0.5 mr-1 inline size-3.5 stroke-[1.75]" aria-hidden />
              Re-upload
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 rounded-lg py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {phase === 'reviewing' && visionResult && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Here&apos;s what we see
              </p>
              <button
                type="button"
                onClick={startOver}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Start over
              </button>
            </div>
            {visionResult.summary && (
              <p className="mb-3 text-sm font-medium text-foreground">{visionResult.summary}</p>
            )}
            <div className="rounded-xl border border-border bg-background/60 p-2">
              <FloorPlanSchematic
                input={{
                  layoutShape: visionResult.layoutShape,
                  hasIsland: visionResult.hasIsland,
                  lengthCm: visionResult.lengthCm,
                  widthCm: visionResult.widthCm,
                  wallRuns: visionResult.wallRuns,
                  windows: visionResult.windows,
                  doors: visionResult.doors,
                  features: visionResult.features,
                }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Dashed boxes with a <span className="font-mono">?</span> are best guesses — confirm them so your designer can plan around them.
            </p>
          </div>

          <ChipReadback visionResult={visionResult} onChange={onVisionResult} />

          <button
            type="button"
            onClick={onConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-[1.06]"
          >
            <Check className="size-4 stroke-[1.75]" aria-hidden />
            Looks right — continue
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">{analyzeError}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={analyze}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Skip and describe in chat
            </button>
          </div>
        </div>
      )}

      {error && phase === 'awaiting' && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}

const SHAPE_LABELS: Record<string, string> = {
  galley: 'Galley',
  l_shape: 'L-shape',
  u_shape: 'U-shape',
  island: 'Island',
  peninsula: 'Peninsula',
  open: 'Open plan',
  unsure: 'Not sure',
}

function ChipReadback({
  visionResult,
  onChange,
}: {
  visionResult: SpaceVisionResult
  onChange: (r: SpaceVisionResult) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/60 px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick correction (optional)
      </p>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Layout</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SHAPE_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...visionResult, layoutShape: value })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                visionResult.layoutShape === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Island</p>
        <div className="flex gap-1.5">
          {[
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange({ ...visionResult, hasIsland: opt.value })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                visionResult.hasIsland === opt.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
