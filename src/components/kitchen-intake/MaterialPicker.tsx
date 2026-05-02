'use client'

import { useRef, useState } from 'react'
import { Check, ImagePlus, Link2, Loader2 } from 'lucide-react'
import { MAKER_CATALOG, type CatalogItem } from '@/lib/maker-catalog'
import { cn } from '@/lib/utils'
import type { SelectOption } from '@/lib/types'

type Slot = 'door' | 'worktop' | 'backsplash' | 'hardware' | 'island' | 'lighting'

interface MaterialPickerProps {
  /** Which slot we're filling (drives the catalog filter and what we capture). */
  slot: Slot
  /** Tier-style options the AI can offer (e.g. "shaker_painted", "slab", "solid_wood"). */
  options: SelectOption[]
  selected: string | null
  onSelect: (value: string) => void
  /** When the user uploads a reference image, surface the AI-matched catalog item back. */
  onReferenceUpload?: (info: {
    referencePhotoDataUrl: string
    matchedCatalogId: string | null
    confidence: 'H' | 'M' | 'L' | null
    reasoning: string | null
  }) => void
}

const SLOT_TO_CATALOG_CATEGORY: Record<Slot, CatalogItem['category'] | null> = {
  door: 'door',
  worktop: 'worktop',
  hardware: 'hardware',
  island: 'island',
  lighting: 'lighting',
  backsplash: null, // no catalog yet
}

export function MaterialPicker({
  slot,
  options,
  selected,
  onSelect,
  onReferenceUpload,
}: MaterialPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlValue, setUrlValue] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [reference, setReference] = useState<{
    dataUrl: string
    matchedTitle: string | null
    confidence: 'H' | 'M' | 'L' | null
    reasoning: string | null
  } | null>(null)

  const catalogCategory = SLOT_TO_CATALOG_CATEGORY[slot]
  const catalogItems = catalogCategory
    ? MAKER_CATALOG.filter((c) => c.category === catalogCategory)
    : []

  async function matchReference(dataUrl: string) {
    if (!catalogCategory) {
      // No catalog category for this slot — just record the reference as-is.
      onReferenceUpload?.({
        referencePhotoDataUrl: dataUrl,
        matchedCatalogId: null,
        confidence: null,
        reasoning: null,
      })
      setReference({ dataUrl, matchedTitle: null, confidence: null, reasoning: null })
      return
    }
    setIsMatching(true)
    setMatchError(null)
    try {
      const res = await fetch('/api/match-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencePhoto: dataUrl, category: catalogCategory }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Match failed')
      onReferenceUpload?.({
        referencePhotoDataUrl: dataUrl,
        matchedCatalogId: data.match.catalogId,
        confidence: data.match.confidence,
        reasoning: data.match.reasoning,
      })
      setReference({
        dataUrl,
        matchedTitle: data.item?.title ?? null,
        confidence: data.match.confidence,
        reasoning: data.match.reasoning,
      })
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Could not match')
      setReference({ dataUrl, matchedTitle: null, confidence: null, reasoning: null })
    } finally {
      setIsMatching(false)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result
      if (typeof dataUrl !== 'string') return
      void matchReference(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  function handleUrlAdd() {
    const trimmed = urlValue.trim()
    if (!trimmed) return
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
    onReferenceUpload?.({
      referencePhotoDataUrl: trimmed,
      matchedCatalogId: null,
      confidence: null,
      reasoning: null,
    })
    setReference({ dataUrl: trimmed, matchedTitle: null, confidence: null, reasoning: null })
    setUrlValue('')
  }

  return (
    <div className="space-y-5">
      {/* Tier cards (style-of-thing) */}
      {options.length > 0 && (
        <section className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Pick a direction
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {options.map((opt) => {
              const isSelected = selected === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSelect(opt.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative aspect-[5/4] overflow-hidden rounded-xl text-left transition-all duration-200 active:scale-[0.99]',
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'ring-1 ring-border hover:ring-foreground/25'
                  )}
                >
                  {opt.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={opt.imageUrl}
                      alt={opt.imageAlt ?? opt.label}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-stone-100 to-stone-300" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent p-2 pt-6">
                    <span className="text-[11px] font-semibold leading-tight text-white drop-shadow-sm">
                      {opt.label}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                      <Check className="size-3 stroke-[3]" aria-hidden />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Studio favorites for this slot */}
      {catalogItems.length > 0 && (
        <section className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Or pick a studio favorite
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {catalogItems.map((item) => {
              const isSelected = selected === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative aspect-[5/4] overflow-hidden rounded-xl text-left transition-all duration-200 active:scale-[0.99]',
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'ring-1 ring-border hover:ring-foreground/25'
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
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Upload reference / paste link */}
      <section className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Or show us a picture you like
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isMatching}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {isMatching ? (
              <>
                <Loader2 className="size-4 animate-spin stroke-[1.75]" aria-hidden />
                Matching…
              </>
            ) : (
              <>
                <ImagePlus className="size-4 stroke-[1.75]" aria-hidden />
                Upload a reference
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
        {urlError && <p className="text-xs font-medium text-destructive">{urlError}</p>}
        {matchError && <p className="text-xs font-medium text-destructive">{matchError}</p>}
      </section>

      {reference && (
        <section className="rounded-xl border border-border bg-card/60 p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={reference.dataUrl} alt="Your reference" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">Your reference</p>
              {reference.matchedTitle ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Closest in the studio: <span className="font-medium text-foreground">{reference.matchedTitle}</span>
                  {reference.confidence && (
                    <span className="ml-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                      {reference.confidence} confidence
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">Saved as a reference for your designer.</p>
              )}
              {reference.reasoning && (
                <p className="mt-1 text-[11px] italic text-muted-foreground">{reference.reasoning}</p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
