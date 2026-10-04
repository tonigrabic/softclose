'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RotateCcw, Check, AlertCircle, Camera, ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import { ApiError, apiErrorKey, readJson } from '@/lib/api/client'
import { compressImageDataUrl, fileToCompressedDataUrl } from '@/lib/image'
import {
  defaultAnchorIndex,
  isUsablePhoto,
  otherSidePhotoIndex,
  roomReferenceIndices,
  viewFor,
} from '@/lib/render/anchor'
import { sanitizePhotoViewTarget, type RenderRoomConstraints } from '@/lib/render/room-constraints'
import type {
  ConceptRender as ConceptRenderRecord,
  ConceptRenderInput,
  LeadProfile,
  PhotoView,
  ProductReference,
} from '@/lib/types'
import { photoViewLabel } from './RoomStep'

// Per-session render cap (UX side — disables the generate button + shows
// "remaining"). Mirrors the server cap in render-concept/route.ts. Defaults to
// 5 (product rule); override via env for local testing.
const MAX_RENDERS_PER_SESSION =
  Number(process.env.NEXT_PUBLIC_RENDER_CAP_PER_SESSION) || 5
const MAX_PRODUCT_REFS = 4
/** Mirrors the server: style refs and other photos of the room sent per call. */
const MAX_STYLE_REFS = 3
const MAX_ROOM_REFS = 2

// `value` is the English instruction sent to the renderer (keep stable for the
// model); `labelKey` is the localized chip text the homeowner sees.
const NUDGE_PRESETS: { labelKey: string; value: string }[] = [
  { labelKey: 'nudge.warmer', value: 'warmer overall palette' },
  { labelKey: 'nudge.cooler', value: 'cooler overall palette' },
  { labelKey: 'nudge.darker_cabinets', value: 'darker cabinet finish' },
  { labelKey: 'nudge.lighter_cabinets', value: 'lighter cabinet finish' },
  { labelKey: 'nudge.lighter_floor', value: 'lighter floor tone' },
  { labelKey: 'nudge.darker_floor', value: 'darker floor tone' },
  { labelKey: 'nudge.no_uppers', value: 'remove upper wall cabinets' },
  { labelKey: 'nudge.open_shelving', value: 'add open shelving instead of upper cabinets' },
  { labelKey: 'nudge.bolder_hardware', value: 'bolder cabinet hardware' },
  { labelKey: 'nudge.subtler_hardware', value: 'subtler, more minimal hardware' },
]

const PRODUCT_LABEL_SUGGESTIONS = [
  'product.stove',
  'product.microwave',
  'product.fridge',
  'product.cabinet_sample',
  'product.tile_sample',
  'product.sink',
  'product.pendant_light',
] as const

export type { ProductReference }

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
  /**
   * The room is measured (IMP-31). The render is made in the measured room, so
   * without typed wall lengths nothing renders — not even by autoStart — and
   * the step points back to the room step. Default true for callers that
   * predate it.
   */
  roomMeasured?: boolean
  onMeasureRoom?: () => void
  /**
   * The measured room as render rules (`roomConstraintsFor`, IMP-32). Sent
   * with every render; its counter walls also rank the anchor photos.
   */
  room?: RenderRoomConstraints | null
  /** What each space photo shows (the photo read, corrected on the room step). */
  photoViews?: PhotoView[]
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
  roomMeasured = true,
  onMeasureRoom,
  room = null,
  photoViews,
}: ConceptRenderProps) {
  const { t } = useTranslations()
  const planWalls = room?.counterWalls.map((w) => w.wall) ?? []
  // Main renders only: an other-side render shows the rest of the room for
  // the main one it was made from, and is never iterated on or chosen.
  const mains = renders.filter((r) => r.view !== 'other_side')
  // The camera the last main render used, else the widest shot of the
  // kitchen. Lazy, so it is right before autoStart's first render.
  const [anchorIndex, setAnchorIndex] = useState(() => {
    const last = mains[mains.length - 1]?.anchorPhotoIndex
    return last != null && isUsablePhoto(anchorPhotos[last])
      ? last
      : defaultAnchorIndex(anchorPhotos, photoViews, planWalls)
  })
  const [activeNudges, setActiveNudges] = useState<string[]>([])
  const [freeTextNudge, setFreeTextNudge] = useState('')
  const [generatingView, setGeneratingView] = useState<'main' | 'other_side' | null>(null)
  const isGenerating = generatingView !== null
  const [error, setError] = useState<string | null>(null)
  const [pendingLabel, setPendingLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoStartedRef = useRef(false)
  // No render without the room it is drawn in: a completed room step AND a
  // room payload (null when the plan's walls are not known — never send an
  // unconstrained render). `room` undefined = a caller that predates it.
  const roomBlocked = !roomMeasured || room === null
  // Room references go out recompressed (~768 px); once per photo.
  const roomRefCache = useRef(new Map<number, { src: string; out: Promise<string> }>())

  // Forwardable style refs: only data: + http(s) URLs.
  const forwardableStyleRefs = styleReferences.filter(
    (r) => typeof r === 'string' && (r.startsWith('data:image/') || r.startsWith('http://') || r.startsWith('https://'))
  )

  function addProductRefFromFile(file: File) {
    void fileToCompressedDataUrl(file, { maxDim: 1024 }).then((url) => {
      if (!url.startsWith('data:image/')) return
      const label = (pendingLabel || t('concept.refItemFallback')).trim().slice(0, 60)
      onProductReferencesChange([
        ...productReferences,
        {
          id: `pref-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          photo: url,
          label,
        },
      ])
      setPendingLabel('')
    })
  }

  function removeProductRef(id: string) {
    onProductReferencesChange(productReferences.filter((p) => p.id !== id))
  }

  function relabelProductRef(id: string, label: string) {
    onProductReferencesChange(
      productReferences.map((p) => (p.id === id ? { ...p, label: label.slice(0, 60) } : p))
    )
  }

  const currentRender = mains[mains.length - 1] ?? null
  const otherSideRender = currentRender
    ? (renders.find((r) => r.view === 'other_side' && r.basedOnRenderId === currentRender.id) ?? null)
    : null
  // The photo that shows the kitchen walls the current main render cannot.
  const otherSideIndex = currentRender
    ? otherSidePhotoIndex(anchorPhotos, photoViews, currentRender.anchorPhotoIndex, planWalls)
    : null
  const used = renders.length
  const remaining = Math.max(0, MAX_RENDERS_PER_SESSION - used)
  const capped = remaining === 0
  // The other photos the next main render sends along.
  const nextRoomRefs = roomReferenceIndices(anchorPhotos, photoViews, anchorIndex, planWalls, MAX_ROOM_REFS)
  const sentStyleCount = Math.min(MAX_STYLE_REFS, forwardableStyleRefs.length)
  const sendingCount = 1 + nextRoomRefs.length + sentStyleCount + productReferences.length

  function compressedRoomRef(i: number): Promise<string> {
    const src = anchorPhotos[i]
    const hit = roomRefCache.current.get(i)
    if (hit && hit.src === src) return hit.out
    const out = compressImageDataUrl(src, { maxDim: 768, quality: 0.72 })
    roomRefCache.current.set(i, { src, out })
    return out
  }

  /**
   * One render. 'main' renders from the chosen anchor: from the previous
   * render when the camera is the same, else matching its finishes from the
   * new camera. 'other_side' renders the same design from the photo that
   * shows the rest of the kitchen, and spends one of the five like any other.
   */
  async function generate(view: 'main' | 'other_side' = 'main') {
    if (capped || roomBlocked) return
    const base = currentRender
    const otherSide = view === 'other_side'
    if (otherSide && (!base || otherSideIndex === null)) return
    const anchorAt = otherSide && otherSideIndex !== null ? otherSideIndex : anchorIndex
    // A different camera conflicts with "start from this version": the
    // previous render then only lends its finishes (design reference).
    const sameCamera = !otherSide && base?.anchorPhotoIndex === anchorAt
    setGeneratingView(view)
    setError(null)
    try {
      const trimmedFreeText = otherSide ? '' : freeTextNudge.trim()
      const sentNudges = otherSide ? [] : activeNudges
      const refIndices = roomReferenceIndices(
        anchorPhotos,
        photoViews,
        anchorAt,
        planWalls,
        MAX_ROOM_REFS,
        otherSide && base ? [base.anchorPhotoIndex] : []
      )
      const roomReferences = (
        await Promise.all(
          refIndices.map(async (i) => ({
            photo: await compressedRoomRef(i),
            shows: viewFor(photoViews, i)?.shows ?? 'unclear',
            photoIndex: i,
          }))
        )
      ).filter((r) => r.photo.startsWith('data:image/'))
      const res = await fetch('/api/render-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorPhoto: anchorPhotos[anchorAt],
          anchorShows: viewFor(photoViews, anchorAt)?.shows,
          room: room ?? undefined,
          roomReferences,
          view,
          styleReferences: forwardableStyleRefs.slice(0, MAX_STYLE_REFS),
          productReferences: productReferences.map((p) => ({ photo: p.photo, label: p.label })),
          previousRenderImage: sameCamera ? base?.imageDataUrl : undefined,
          designReference: base && !sameCamera ? base.imageDataUrl : undefined,
          freeTextNudge: trimmedFreeText || undefined,
          style: profile.stylePreferences?.[0],
          doorMaterial: profile.doorMaterial,
          worktopPreference: profile.worktopPreference,
          backsplashPreference: profile.backsplashPreference,
          hardwareTier: profile.hardwareTier,
          hardwareBrand: profile.hardwareBrand,
          cabinetConstruction: profile.cabinetConstruction,
          appliancesIntegrated: profile.appliancesIntegrated,
          nudges: sentNudges,
          previousRenderId: base?.id,
        }),
      })
      const data = await readJson<{
        id: string
        imageDataUrl: string
        prompt: string
        modelVersion: string
        quality?: string
        styleRefCount?: number
        productRefCount?: number
        iteratedFromPreviousRender?: boolean
        nudges?: string[]
        freeTextNudge?: string
        inputs?: ConceptRenderInput[]
        generatedAt: string
      }>(res)
      if (!res.ok || data.error) throw new ApiError(data.error ?? 'Render failed', res.status)
      // gpt-image returns a ~2 MB PNG; stored + re-sent as JPEG so the next
      // hypothesis / re-render / handoff request stays under Vercel's limit.
      const compressedRender = await compressImageDataUrl(String(data.imageDataUrl), { maxDim: 1024, quality: 0.85 })
      const record: ConceptRenderRecord = {
        id: data.id,
        imageDataUrl: compressedRender,
        prompt: data.prompt,
        modelVersion: data.modelVersion,
        anchorPhotoIndex: anchorAt,
        nudges: data.nudges ?? sentNudges,
        freeTextNudge: data.freeTextNudge ?? (trimmedFreeText || undefined),
        inputs: (data.inputs as ConceptRenderInput[] | undefined) ?? [],
        generatedAt: data.generatedAt,
        view,
        ...(otherSide && base ? { basedOnRenderId: base.id } : {}),
      }
      onRenderAdded(record)
      // The tweaks belong to the next main render; the other side carries none.
      if (!otherSide) {
        setActiveNudges([])
        setFreeTextNudge('')
      }
    } catch (err) {
      console.warn('[render-concept]', err)
      // A 429 here is the per-session render cap, not "slow down".
      setError(t(apiErrorKey(err, 'concept.error.renderFailed', { 429: 'concept.error.capReached' })))
    } finally {
      setGeneratingView(null)
    }
  }

  // Auto-start the first render if asked and we have enough signal to make it
  // worth trying. Guarded by autoStartedRef so we never fire twice (Strict Mode
  // double-mounts in dev) and never on a re-entry where renders already exist.
  // We defer the actual call via queueMicrotask so the setState that `generate`
  // performs lands outside the synchronous effect body (React's strict effects
  // rule rightly flags sync setState inside effects).
  useEffect(() => {
    if (!autoStart || roomBlocked) return
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
      void generate('main')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, anchorPhotos.length, renders.length, roomBlocked])

  if (roomBlocked) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-300/50 bg-amber-50/60 px-4 py-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
          <p className="text-sm leading-relaxed">{t('room.gate.render')}</p>
        </div>
        {onMeasureRoom && (
          <button
            type="button"
            onClick={onMeasureRoom}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
          >
            {t('room.gate.measure')}
          </button>
        )}
      </div>
    )
  }

  if (anchorPhotos.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-300/50 bg-amber-50/60 px-4 py-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
          <p className="text-sm leading-relaxed">{t('concept.noAnchor')}</p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
        >
          {t('concept.skipRender')}
        </button>
      </div>
    )
  }

  /** The room step's label for what photo `i` shows ("Zid A", "Kut A–D"); none when unclear. */
  function photoChip(i: number): string | null {
    const shows = sanitizePhotoViewTarget(viewFor(photoViews, i)?.shows)
    return shows && shows !== 'unclear' ? photoViewLabel(t, shows) : null
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
          <strong className="font-semibold">{t('concept.disclosure.tag')}</strong> {t('concept.disclosure.body')}
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
                alt={t('concept.renderAlt')}
                className="h-auto w-full"
              />
              {generatingView === 'main' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                  <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold">
                    <span className="inline-block size-2 animate-pulse rounded-full bg-white" />
                    {t('concept.generatingNew')}
                  </div>
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                {t('concept.badge')}
              </span>
              {chosenId === currentRender.id && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  <Check className="size-3 stroke-[3]" aria-hidden />
                  {t('concept.chosen')}
                </span>
              )}
            </div>
            {currentRender.nudges.length > 0 && (
              <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                {t('concept.iteration')} {currentRender.nudges.join(' · ')}
              </p>
            )}
          </motion.div>
        ) : (
          <button
            type="button"
            key="generate-first"
            onClick={() => void generate('main')}
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
                <span>{t('concept.rendering')}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-5 stroke-[1.5]" aria-hidden />
                <span>{t('concept.generate')}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {t('concept.generateHint')}
                </span>
              </>
            )}
          </button>
        )}
      </AnimatePresence>

      {/* The other side of the room: the same design from the photo that
          shows the kitchen walls the main render cannot (IMP-32). */}
      {currentRender &&
        (otherSideRender ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={otherSideRender.imageDataUrl} alt={t('concept.otherSide.badge')} className="h-auto w-full" />
              <span className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                {t('concept.badge')} · {t('concept.otherSide.badge')}
              </span>
            </div>
          </div>
        ) : generatingView === 'other_side' ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/50 py-10 text-xs font-semibold text-muted-foreground">
            <span className="inline-block size-2 animate-pulse rounded-full bg-primary/60" />
            {t('concept.generatingNew')}
          </div>
        ) : (
          !capped &&
          otherSideIndex !== null && (
            <button
              type="button"
              onClick={() => void generate('other_side')}
              disabled={isGenerating}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors',
                isGenerating ? 'cursor-wait opacity-60' : 'hover:bg-accent/40'
              )}
            >
              <Camera className="size-4 stroke-[1.75]" aria-hidden />
              {t('concept.otherSide.button')}
              <span className="text-xs font-normal text-muted-foreground">
                ({t('concept.otherSide.cost').replace('{n}', String(MAX_RENDERS_PER_SESSION))})
              </span>
            </button>
          )
        ))}

      {/* What we're feeding the renderer */}
      <div className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('concept.sending')}
          </p>
          <span className="text-[10px] font-medium text-muted-foreground">
            {sendingCount} {sendingCount === 1 ? t('concept.imageWord') : t('concept.imagesWord')}
          </span>
        </div>

        {/* Anchor row */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            {t('concept.anchorRow')}
          </p>
          <div className="flex flex-wrap gap-2">
            {anchorPhotos.map((photo, i) => {
              const viewLabel = photoChip(i)
              const shot = anchorPhotos.length > 1 ? `${t('concept.anchorShot')} ${i + 1}` : t('concept.anchorShot')
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAnchorIndex(i)}
                  className={cn(
                    'relative size-14 overflow-hidden rounded-lg ring-1 transition-all',
                    anchorIndex === i ? 'ring-2 ring-primary' : 'ring-border hover:ring-foreground/30'
                  )}
                  aria-pressed={anchorIndex === i}
                  title={viewLabel ? `${shot} · ${viewLabel}` : shot}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={t('concept.anchorShot')} className="h-full w-full object-cover" />
                  {anchorIndex === i && (
                    <span className="absolute right-0.5 top-0.5 rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                      {t('concept.anchorUse')}
                    </span>
                  )}
                  {viewLabel && <PhotoChip label={viewLabel} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Other photos of the same room (read-only — picked from the photo labels) */}
        {nextRoomRefs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
              {t('concept.roomRefsRow')}
            </p>
            <div className="flex flex-wrap gap-2">
              {nextRoomRefs.map((i) => {
                const viewLabel = photoChip(i)
                return (
                  <div
                    key={i}
                    className="relative size-14 overflow-hidden rounded-lg ring-1 ring-border"
                    title={viewLabel ? `${t('concept.anchorShot')} ${i + 1} · ${viewLabel}` : `${t('concept.anchorShot')} ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={anchorPhotos[i]} alt={t('concept.roomRefsRow')} className="h-full w-full object-cover" />
                    {viewLabel && <PhotoChip label={viewLabel} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Style refs row (read-only — pulled from Inspiration step) */}
        {forwardableStyleRefs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
              {t('concept.styleRefsRow')}
            </p>
            <div className="flex flex-wrap gap-2">
              {forwardableStyleRefs.slice(0, MAX_STYLE_REFS).map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="size-14 overflow-hidden rounded-lg ring-1 ring-border"
                  title={t('concept.styleRefTitle')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={t('concept.styleRefTitle')} className="h-full w-full object-cover" />
                </div>
              ))}
              {forwardableStyleRefs.length > MAX_STYLE_REFS && (
                <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                  +{forwardableStyleRefs.length - MAX_STYLE_REFS}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Product refs row */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            {t('concept.productRow')}
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
                    placeholder={t('concept.productLabelPlaceholder')}
                    aria-label={t('concept.productLabelFor').replace('{label}', ref.label)}
                  />
                  <button
                    type="button"
                    onClick={() => removeProductRef(ref.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={t('concept.productRemove').replace('{label}', ref.label)}
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
                placeholder={t('concept.labelFirst')}
                className="flex-1 min-w-[10rem] rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                aria-label={t('concept.productLabelNext')}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
              >
                <ImagePlus className="size-3.5 stroke-[1.75]" aria-hidden />
                {t('concept.addPhoto')}
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
              {t('concept.try')}
              {PRODUCT_LABEL_SUGGESTIONS.map((key) => {
                const label = t(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPendingLabel(label)}
                    className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-foreground/80 hover:bg-muted"
                  >
                    {label}
                  </button>
                )
              })}
            </p>
          )}
        </div>
      </div>

      {/* Nudge chips */}
      {currentRender && !capped && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('concept.tweakRow')}
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
                  {t(n.labelKey as Parameters<typeof t>[0])}
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
            {t('concept.freeText.label')}
          </label>
          <textarea
            id="render-free-text"
            value={freeTextNudge}
            onChange={(e) => setFreeTextNudge(e.target.value.slice(0, 240))}
            rows={2}
            placeholder={t('concept.freeText.placeholder')}
            className="block w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            maxLength={240}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{t('concept.freeText.hint')}</span>
            <span>{freeTextNudge.length}/240</span>
          </div>
        </div>
      )}

      {/* Action row */}
      {currentRender && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void generate('main')}
            disabled={isGenerating || capped}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors',
              !capped && 'hover:bg-accent/40',
              capped && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RotateCcw className="size-4 stroke-[1.75]" aria-hidden />
            {capped
              ? t('concept.noMore')
              : (() => {
                  const tweakCount = activeNudges.length + (freeTextNudge.trim() ? 1 : 0)
                  if (tweakCount === 0) return t('concept.regenerate')
                  const word = tweakCount > 1 ? t('concept.tweaksPlural') : t('concept.tweakSingular')
                  return `${t('concept.regenerateWith')} ${tweakCount} ${word}`
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
            {chosenId === currentRender.id ? t('concept.chosenContinue') : t('concept.chooseThis')}
          </button>
        </div>
      )}

      {/* Counter + skip */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {used} / {MAX_RENDERS_PER_SESSION} {t('concept.rendersUsed')}
          {capped && t('concept.cappedNote')}
        </span>
        {!chosenId && (
          <button
            type="button"
            onClick={onSkip}
            className="font-medium text-muted-foreground hover:text-foreground"
          >
            {t('concept.skipTheRender')}
          </button>
        )}
      </div>

      {/* Try another shot */}
      {anchorPhotos.length === 1 && currentRender && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Camera className="mt-0.5 size-3 stroke-[1.75]" aria-hidden />
          {t('concept.anotherAngle')}
        </p>
      )}

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}

/** A wall or corner label along the bottom of a photo thumbnail. */
function PhotoChip({ label }: { label: string }) {
  return (
    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-0.5 py-px text-center text-[8px] font-semibold text-white">
      {label}
    </span>
  )
}
