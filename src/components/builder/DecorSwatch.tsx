'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { decorSwatch } from '@/lib/builder/swatches'

/**
 * Renders a decor as a swatch tile: the real EGGER swatch when the manifest
 * has one (wood grain included), else the hexHint colour square. Labels read
 * the way makers quote a decor — name, then the Elgrad code under it.
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
  /** `fill` takes the grid cell's width (square) — big enough for grain to read. */
  size?: 'sm' | 'md' | 'lg' | 'fill'
  selected?: boolean
  onClick?: () => void
  showLabel?: boolean
  label?: string
}) {
  const swatch = decorSwatch(code, structure)
  const [imgFailed, setImgFailed] = useState(false)
  if (!swatch) return null

  const sizeCls =
    size === 'sm' ? 'size-9' : size === 'lg' ? 'size-20' : size === 'fill' ? 'aspect-square w-full' : 'size-14'
  const showImage = !!swatch.imagePath && !imgFailed

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label ? `${label} (${code} ${structure})` : `${code} ${structure}`}
      className={cn(
        'group flex min-w-0 flex-col items-center gap-1.5 transition-transform',
        size === 'fill' && 'w-full',
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
        style={{ backgroundColor: swatch.hexHint }}
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={swatch.imagePath!}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      {showLabel && label && (
        <span className="flex w-full min-w-0 flex-col items-center text-center leading-tight">
          <span className="line-clamp-2 w-full text-[11px] font-medium text-foreground/85">{label}</span>
          {/* The code is what the maker orders by — never truncated. */}
          <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
            {code} {structure}
          </span>
        </span>
      )}
    </button>
  )
}
