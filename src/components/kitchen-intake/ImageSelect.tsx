'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Link2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SelectOption } from '@/lib/types'
import { getOptionFallbackImage } from '@/lib/option-visuals'

interface UploadedReference {
  id: string
  imageUrl: string
  source: 'upload' | 'url'
}

interface ImageSelectProps {
  options: SelectOption[]
  selected: string[]
  onSelect: (value: string) => void
  /**
   * Optional: when set, the picker also exposes "Upload" and "Paste link"
   * tiles inline. Lifted state lets the parent persist refs across renders.
   */
  uploadedRefs?: UploadedReference[]
  onUploadedRefsChange?: (refs: UploadedReference[]) => void
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function ImageSelect({
  options,
  selected,
  onSelect,
  uploadedRefs,
  onUploadedRefsChange,
}: ImageSelectProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const refsEnabled = !!onUploadedRefsChange
  const refs = uploadedRefs ?? []

  function handleFiles(files: FileList | null) {
    if (!files || !onUploadedRefsChange) return
    const promises = Array.from(files).map(
      (file) =>
        new Promise<UploadedReference>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = e.target?.result
            if (typeof dataUrl !== 'string') return
            resolve({ id: newId('upload'), imageUrl: dataUrl, source: 'upload' })
          }
          reader.readAsDataURL(file)
        })
    )
    Promise.all(promises).then((added) => {
      onUploadedRefsChange([...refs, ...added])
    })
  }

  function handleUrlAdd() {
    const trimmed = urlValue.trim()
    if (!trimmed || !onUploadedRefsChange) return
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error()
      }
    } catch {
      setUrlError('Paste a full URL (https://…)')
      return
    }
    setUrlError(null)
    onUploadedRefsChange([...refs, { id: newId('url'), imageUrl: trimmed, source: 'url' }])
    setUrlValue('')
  }

  function removeRef(id: string) {
    if (!onUploadedRefsChange) return
    onUploadedRefsChange(refs.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="listbox"
        aria-multiselectable
        aria-label="Visual choices"
      >
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          const imageUrl = option.imageUrl ?? getOptionFallbackImage(option.value)
          const hasImage = !!imageUrl
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(option.value)}
              className={cn(
                'group relative aspect-[4/3] overflow-hidden rounded-2xl transition-all duration-200 active:scale-[0.99]',
                !hasImage && 'bg-gradient-to-br from-stone-100 to-stone-300',
                isSelected
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'ring-1 ring-border hover:ring-foreground/20'
              )}
            >
              {hasImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={option.imageAlt ?? option.label}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              )}
              {isSelected && <div className="absolute inset-0 bg-foreground/20" aria-hidden />}
              <div className="absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 via-black/15 to-transparent p-2.5 pt-8">
                <span
                  className={cn(
                    'text-xs font-semibold leading-tight tracking-tight',
                    hasImage ? 'text-white drop-shadow-sm' : 'text-stone-700'
                  )}
                >
                  {option.label}
                </span>
              </div>
              {isSelected && (
                <div className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <svg
                    className="size-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}

        {refsEnabled && refs.map((ref) => (
          <div
            key={ref.id}
            className="group relative aspect-[4/3] overflow-hidden rounded-2xl ring-2 ring-amber-500/70 ring-offset-2 ring-offset-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ref.imageUrl}
              alt="Your inspiration"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent p-2.5 pt-8">
              <span className="text-xs font-semibold leading-tight tracking-tight text-white drop-shadow-sm">
                Your pick
              </span>
            </div>
            <span className="absolute left-2 top-2 rounded-full bg-amber-500/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
              Your ref
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeRef(ref.id)
              }}
              className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 shadow-md backdrop-blur-sm transition-all hover:bg-foreground group-hover:opacity-100"
              aria-label="Remove inspiration"
            >
              <X className="size-3" aria-hidden />
            </button>
          </div>
        ))}

        {refsEnabled && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-card/40 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
          >
            <ImagePlus className="size-5 stroke-[1.5]" aria-hidden />
            Upload your own
          </button>
        )}
      </div>

      {refsEnabled && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex items-stretch overflow-hidden rounded-xl border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
            <span className="flex items-center pl-3 text-muted-foreground">
              <Link2 className="size-4 stroke-[1.75]" aria-hidden />
            </span>
            <input
              type="url"
              inputMode="url"
              placeholder="Or paste an image link"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlAdd()
                }
              }}
              className="flex-1 bg-transparent px-2.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="button"
              onClick={handleUrlAdd}
              disabled={!urlValue.trim()}
              className="bg-foreground/[0.06] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {urlError && <p className="text-xs font-medium text-destructive">{urlError}</p>}
        </>
      )}
    </div>
  )
}

export type { UploadedReference }
