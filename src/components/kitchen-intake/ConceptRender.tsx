'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RotateCcw, Check, AlertCircle, Camera, ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  ConceptRender as ConceptRenderRecord,
  ConceptRenderInput,
  LeadProfile,
} from '@/lib/types'

const MAX_RENDERS_PER_SESSION = 5
const MAX_PRODUCT_REFS = 4

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

const PRODUCT_LABEL_SUGGESTIONS = [
  'stove',
  'microwave',
  'fridge',
  'cabinet sample',
  'tile sample',
  'sink',
  'pendant light',
] as const

export interface ProductReference {
  id: string
  photo: string
  label: string
}

interface ConceptRenderProps {
  /** Anchor photos available — usually the homeowner's space photos. */
  anchorPhotos: string[]
  /**
   * Style references (e.g. inspiration uploads) that should be sent with each
   * render call so the model can borrow mood, palette, materiality.
   * Only `data:image/...` URLs and http(s) URLs are forwarded; everything
   * else is ignored.
   */
  styleReferences?: string[]
  /** Specific items the homeowner wants in the redesign (stove, microwave, etc.). */
  productReferences: ProductReference[]
  onProductReferencesChange: (refs: ProductReference[]) => void
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
  styleReferences = [],
  productReferences,
  onProductReferencesChange,
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
  const [freeTextNudge, setFreeTextNudge] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingLabel, setPendingLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoStartedRef = useRef(false)

  // Forwardable style refs: only data: + http(s) URLs.
  const forwardableStyleRefs = styleReferences.filter(
    (r) => typeof r === 'string' && (r.startsWith('data:image/') || r.startsWith('http://') || r.startsWith('https://'))
  )

  function addProductRefFromFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      if (!url.startsWith('data:image/')) return
      const label = (pendingLabel || 'reference item').trim().slice(0, 60)
      onProductReferencesChange([
        ...productReferences,
        {
          id: `pref-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          photo: url,
          label,
        },
      ])
      setPendingLabel('')
    }
    reader.readAsDataURL(file)
  }

  function removeProductRef(id: string) {
    onProductReferencesChange(productReferences.filter((p) => p.id !== id))
  }

  function relabelProductRef(id: string, label: string) {
    onProductReferencesChange(
      productReferences.map((p) => (p.id === id ? { ...p, label: label.slice(0, 60) } : p))
    )
  }

  const currentRender = renders[renders.length - 1] ?? null
  const used = renders.length
  const remaining = Math.max(0, MAX_RENDERS_PER_SESSION - used)
  const capped = remaining === 0

  async function generate() {
    if (capped) return
    setIsGenerating(true)
    setError(null)
    try {
      const trimmedFreeText = freeTextNudge.trim()
      const res = await fetch('/api/render-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorPhoto: anchorPhotos[anchorIndex],
          styleReferences: forwardableStyleRefs,
          productReferences: productReferences.map((p) => ({ photo: p.photo, label: p.label })),
          previousRenderImage: currentRender?.imageDataUrl,
          freeTextNudge: trimmedFreeText || undefined,
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
        freeTextNudge: data.freeTextNudge ?? (trimmedFreeText || undefined),
        inputs: (data.inputs as ConceptRenderInput[] | undefined) ?? [],
        generatedAt: data.generatedAt,
      }
      onRenderAdded(record)
      setActiveNudges([])
      setFreeTextNudge('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate render')
    } finally {
      setIsGenerating(false)
    }
  }

  // Auto-start the first render if asked and we have enough signal to make it
  // worth trying. Guarded by autoStartedRef so we never fire twice (Strict Mode
  // double-mounts in dev) and never on a re-entry where renders already exist.
  // We defer the actual call via queueMicrotask so the setState that `generate`
  // performs lands outside the synchronous effect body (React's strict effects
  // rule rightly flags sync setState inside effects).
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
    queueMicrotask(() => {
      void generate()
    })
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

      {/* What we're feeding the renderer */}
      <div className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What we&apos;re sending the renderer
          </p>
          <span className="text-[10px] font-medium text-muted-foreground">
            {1 + forwardableStyleRefs.length + productReferences.length} image
            {1 + forwardableStyleRefs.length + productReferences.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Anchor row */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            Anchor — your existing kitchen
          </p>
          <div className="flex flex-wrap gap-2">
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
                title={anchorPhotos.length > 1 ? `Anchor shot ${i + 1}` : 'Anchor shot'}
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

        {/* Style refs row (read-only — pulled from Inspiration step) */}
        {forwardableStyleRefs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
              Style references — borrowed from your inspiration
            </p>
            <div className="flex flex-wrap gap-2">
              {forwardableStyleRefs.slice(0, 3).map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="size-14 overflow-hidden rounded-lg ring-1 ring-border"
                  title="Style reference"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
              {forwardableStyleRefs.length > 3 && (
                <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                  +{forwardableStyleRefs.length - 3}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Product refs row */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            Specific items to incorporate (optional)
          </p>
          {productReferences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {productReferences.map((ref) => (
                <div
                  key={ref.id}
                  className="group relative w-28 overflow-hidden rounded-lg border border-border bg-card"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.photo} alt={ref.label} className="h-20 w-full object-cover" />
                  <input
                    value={ref.label}
                    onChange={(e) => relabelProductRef(ref.id, e.target.value)}
                    className="block w-full border-t border-border bg-transparent px-1.5 py-1 text-[10px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
                    placeholder="label"
                    aria-label={`Label for ${ref.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeProductRef(ref.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${ref.label}`}
                  >
                    <X className="size-3 stroke-[2.5]" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          {productReferences.length < MAX_PRODUCT_REFS && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value.slice(0, 60))}
                placeholder="Label first (e.g. 'stove')"
                className="flex-1 min-w-[10rem] rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                aria-label="Label for the next product reference"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
              >
                <ImagePlus className="size-3.5 stroke-[1.75]" aria-hidden />
                Add photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) addProductRefFromFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {productReferences.length === 0 && (
            <p className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
              Try:
              {PRODUCT_LABEL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPendingLabel(s)}
                  className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-foreground/80 hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </p>
          )}
        </div>
      </div>

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

      {/* Free-text adjustment */}
      {currentRender && !capped && (
        <div className="space-y-1.5">
          <label
            htmlFor="render-free-text"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Or describe the change in your own words
          </label>
          <textarea
            id="render-free-text"
            value={freeTextNudge}
            onChange={(e) => setFreeTextNudge(e.target.value.slice(0, 240))}
            rows={2}
            placeholder="e.g. swap the upper cabinets for floating wood shelves and add a brass faucet"
            className="block w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            maxLength={240}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Anything chip presets don&apos;t cover.</span>
            <span>{freeTextNudge.length}/240</span>
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
              : (() => {
                  const tweakCount = activeNudges.length + (freeTextNudge.trim() ? 1 : 0)
                  if (tweakCount === 0) return 'Regenerate from this version'
                  return `Regenerate with ${tweakCount} tweak${tweakCount > 1 ? 's' : ''}`
                })()}
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
