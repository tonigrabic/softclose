'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Link2, X } from 'lucide-react'
import { MAKER_CATALOG, catalogToMoodBoardItem, type CatalogItem } from '@/lib/maker-catalog'
import type { MoodBoardItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MoodBoardProps {
  items: MoodBoardItem[]
  onChange: (items: MoodBoardItem[]) => void
}

const CATEGORIES: { id: CatalogItem['category']; label: string }[] = [
  { id: 'door', label: 'Cabinet doors' },
  { id: 'worktop', label: 'Worktops' },
  { id: 'island', label: 'Islands' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'lighting', label: 'Lighting' },
]

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function MoodBoard({ items, onChange }: MoodBoardProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlValue, setUrlValue] = useState('')
  const [activeCategory, setActiveCategory] = useState<CatalogItem['category']>('door')
  const [urlError, setUrlError] = useState<string | null>(null)

  const pickedIds = new Set(items.map((i) => i.id))

  function add(item: MoodBoardItem) {
    onChange([...items, item])
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id))
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result
        if (typeof dataUrl !== 'string') return
        add({
          id: newId('upload'),
          source: 'upload',
          imageUrl: dataUrl,
          title: file.name,
        })
      }
      reader.readAsDataURL(file)
    })
  }

  function handleUrlAdd() {
    const trimmed = urlValue.trim()
    if (!trimmed) return
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Use http or https links')
      }
    } catch {
      setUrlError('Paste a full URL (https://…)')
      return
    }
    setUrlError(null)
    add({
      id: newId('url'),
      source: 'url',
      imageUrl: trimmed,
      title: trimmed,
    })
    setUrlValue('')
  }

  const catalogForCategory = MAKER_CATALOG.filter((c) => c.category === activeCategory)

  return (
    <div className="space-y-6">
      {/* Studio favorites */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">From the studio</h3>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tap to pin
          </span>
        </header>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === cat.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {catalogForCategory.map((item) => {
            const alreadyPicked = items.some(
              (i) => i.source === 'catalog' && i.vendorSku === item.vendorSku
            )
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (alreadyPicked) return
                  add(catalogToMoodBoardItem(item))
                }}
                aria-pressed={alreadyPicked}
                className={cn(
                  'group relative aspect-[4/3] overflow-hidden rounded-xl text-left ring-1 transition-all duration-200 active:scale-[0.99]',
                  alreadyPicked
                    ? 'ring-2 ring-primary'
                    : 'ring-border hover:ring-foreground/25'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title ?? ''}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent p-2 pt-6">
                  <span className="text-[11px] font-semibold leading-tight text-white drop-shadow-sm">
                    {item.title}
                  </span>
                </div>
                {alreadyPicked && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Pinned
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Add your own */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Add your own</h3>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-4 py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
          >
            <ImagePlus className="size-4 stroke-[1.75]" aria-hidden />
            Upload images
          </button>
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
              placeholder="Paste image link"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlAdd()
                }
              }}
              className="flex-1 bg-transparent px-2.5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
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
        </div>

        {urlError && (
          <p className="text-xs font-medium text-destructive">{urlError}</p>
        )}
      </section>

      {/* Pinned */}
      {items.length > 0 && (
        <section className="space-y-3">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Your board</h3>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {items.length} pinned
            </span>
          </header>

          <div className="grid grid-cols-3 gap-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.title ?? 'Mood board item'}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-foreground/85 text-background opacity-0 shadow-md backdrop-blur-sm transition-all hover:bg-foreground group-hover:opacity-100"
                  aria-label="Remove from mood board"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The fact that this never blocks the flow is a design choice. */}
      {pickedIds.size === 0 && (
        <p className="text-xs text-muted-foreground">
          Optional — pin as many or as few as feels useful, then continue.
        </p>
      )}
    </div>
  )
}
