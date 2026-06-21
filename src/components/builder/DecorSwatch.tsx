'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { decorSwatch } from '@/lib/builder/swatches'

/**
 * Renders a decor as a swatch tile. Falls back to the hexHint colour square
 * when no real swatch image is on disk yet (typical for MVP — public/decor-
 * swatches/ is empty until we run the EGGER fetch script).
 */
export function DecorSwatch({
  code,
  structure,
  size = 'md',
  selected = false,
  onClick,
  showLabel = false,
  label,
}: {
  code: string
  structure: string
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  onClick?: () => void
  showLabel?: boolean
  label?: string
}) {
  const swatch = decorSwatch(code, structure)
  const [imgFailed, setImgFailed] = useState(false)
  if (!swatch) return null

  const sizeCls = size === 'sm' ? 'size-9' : size === 'lg' ? 'size-20' : 'size-14'
  const showImage = !!swatch.imagePath && !imgFailed

  return (
    <button
      type="button"
      onClick={onClick}
      title={label ?? `${code} ${structure}`}
      className={cn(
        'group flex flex-col items-center gap-1.5 transition-transform',
        onClick && 'hover:-translate-y-0.5'
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl ring-2 ring-transparent transition-all',
          sizeCls,
          selected && 'ring-primary shadow-md',
          !selected && 'ring-border/60 group-hover:ring-primary/40'
        )}
        style={!showImage ? { backgroundColor: swatch.hexHint } : undefined}
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={swatch.imagePath!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      {showLabel && label && (
        <span className="max-w-[90px] truncate text-center text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      )}
    </button>
  )
}
