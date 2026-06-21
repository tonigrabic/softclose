'use client'

import { useState } from 'react'
import { Anchor, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n'
import type { BuilderState } from '@/lib/builder/inventory'

export interface RenderCarouselProps {
  state: BuilderState
  /** Phase-1 render the hypothesis was derived from. Always position 0. */
  originalImageDataUrl?: string
  /** Fallback when the homeowner has no Phase-1 render (anchor space photo). */
  anchorPhotoDataUrl?: string
  onSetActive: (id: string | null) => void
}

interface Thumb {
  id: string | null
  imageDataUrl: string
  label: string
  trigger?: string
  isOriginal: boolean
}

export function RenderCarousel({
  state,
  originalImageDataUrl,
  anchorPhotoDataUrl,
  onSetActive,
}: RenderCarouselProps) {
  const { t } = useTranslations()
  // Local "previewing" id can differ from active: clicking a thumb shows it
  // big without committing. "Use this" commits via onSetActive.
  const [previewingId, setPreviewingId] = useState<string | null | undefined>(undefined)

  const originalSrc = originalImageDataUrl ?? anchorPhotoDataUrl
  if (!originalSrc && !(state.rerenders && state.rerenders.length > 0)) return null

  const thumbs: Thumb[] = []
  if (originalSrc) {
    thumbs.push({
      id: null,
      imageDataUrl: originalSrc,
      label: t('builder.shell.renders.original'),
      isOriginal: true,
    })
  }
  ;(state.rerenders ?? []).forEach((r, i) => {
    thumbs.push({
      id: r.id,
      imageDataUrl: r.imageDataUrl,
      label: `R${i + 1}`,
      trigger: r.trigger,
      isOriginal: false,
    })
  })

  const previewing = previewingId === undefined ? state.activeRenderId : previewingId
  const isPreviewingActive = previewing === state.activeRenderId

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {thumbs.map((thumb) => {
          const isActive = thumb.id === state.activeRenderId
          const isPreview = thumb.id === previewing
          return (
            <button
              key={thumb.id ?? 'original'}
              type="button"
              onClick={() => setPreviewingId(thumb.id)}
              className={cn(
                'group relative flex w-20 shrink-0 flex-col gap-1 rounded-xl border bg-card p-1 transition-all',
                isPreview ? 'border-foreground shadow-sm' : 'border-border hover:border-foreground/40',
                isActive && 'ring-2 ring-primary/40'
              )}
              aria-label={
                thumb.isOriginal
                  ? t('builder.shell.renders.original')
                  : `${thumb.label}${thumb.trigger ? ` — ${thumb.trigger}` : ''}`
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb.imageDataUrl}
                alt=""
                className="aspect-[4/3] w-full rounded-md object-cover"
              />
              <div className="flex items-center justify-between px-0.5 text-[9.5px] font-semibold">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5',
                    thumb.isOriginal ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {thumb.isOriginal && <Anchor className="size-2.5 stroke-[2.5]" aria-hidden />}
                  {thumb.isOriginal
                    ? t('builder.shell.renders.originalBadge')
                    : thumb.label}
                </span>
                {isActive && (
                  <Check className="size-2.5 text-primary stroke-[3]" aria-hidden />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {!isPreviewingActive && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {t('builder.shell.renders.viewing')}
          </p>
          <button
            type="button"
            onClick={() => {
              onSetActive(previewing ?? null)
              setPreviewingId(undefined)
            }}
            className="shrink-0 rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background hover:brightness-110"
          >
            {previewing === null
              ? t('builder.shell.renders.resetToOriginal')
              : t('builder.shell.renders.setCurrent')}
          </button>
        </div>
      )}
    </div>
  )
}
