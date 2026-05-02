'use client'

import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhotoUploadProps {
  onPhotosChange: (dataUrls: string[]) => void
  photos: string[]
}

export function PhotoUpload({ onPhotosChange, photos }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  function removePhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
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
          'flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed py-12 transition-all duration-200',
          'hover:border-primary/40 hover:bg-accent/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragging
            ? 'scale-[1.01] border-primary bg-primary/5 shadow-inner'
            : 'border-border bg-card/50'
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ImagePlus className="size-6 stroke-[1.5]" aria-hidden />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Add photos</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Tap here or drag and drop</p>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          JPG, PNG, HEIC
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
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
                className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 shadow-md backdrop-blur-sm transition-all hover:bg-foreground group-hover:opacity-100"
                aria-label="Remove photo"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
