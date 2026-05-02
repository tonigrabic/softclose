'use client'

import { useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhotoSupplementProps {
  photos: string[]
  onPhotosChange: (dataUrls: string[]) => void
  helpText?: string
  className?: string
}

/**
 * Compact photo uploader for use alongside another input on the same step
 * (e.g. layout cards, style picks). Visually lighter than {@link PhotoUpload}
 * so it doesn't dominate the question.
 */
export function PhotoSupplement({
  photos,
  onPhotosChange,
  helpText,
  className,
}: PhotoSupplementProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const promises = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target?.result as string)
          reader.readAsDataURL(file)
        })
    )
    Promise.all(promises).then((results) => {
      onPhotosChange([...photos, ...results])
    })
  }

  function remove(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 hover:text-foreground"
      >
        <Camera className="size-4 stroke-[1.75]" aria-hidden />
        {photos.length > 0 ? 'Add another photo' : helpText ?? 'Add a photo (optional)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((src, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(i)
                }}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 shadow-sm transition-all group-hover:opacity-100"
                aria-label="Remove photo"
              >
                <X className="size-3 stroke-[2.25]" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
