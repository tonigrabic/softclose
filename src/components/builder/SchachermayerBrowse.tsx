'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchachermayerProduct } from '@/lib/catalog/hardware'

/**
 * Read-only product browser for Schachermayer-scraped SKUs. Shows up to N
 * products as image + name + brand cards; clicking opens the supplier detail
 * page. Selecting a card calls onPick (when provided) so the picker can
 * persist the SKU into BuilderState for the maker handoff.
 *
 * Scope is intentionally tight: this is *enrichment*, not a full e-commerce
 * UI. The maker still owns the final SKU choice.
 */
export function SchachermayerBrowse({
  products,
  selectedSku,
  onPick,
  emptyMessage = 'Nema dostupnih proizvoda za ovu kategoriju.',
  initialLimit = 8,
}: {
  products: SchachermayerProduct[]
  selectedSku?: string
  onPick?: (product: SchachermayerProduct) => void
  emptyMessage?: string
  initialLimit?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? products : products.slice(0, initialLimit)

  if (products.length === 0) {
    return <p className="text-[12px] text-muted-foreground/70">{emptyMessage}</p>
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((p, i) => (
          <ProductCard
            key={p.sku ?? p.productUrl ?? `${p.name}-${i}`}
            product={p}
            selected={p.sku === selectedSku}
            onPick={onPick ? () => onPick(p) : undefined}
          />
        ))}
      </div>
      {products.length > initialLimit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {showAll ? 'Show less' : `Show all ${products.length}`}
        </button>
      )}
    </div>
  )
}

function ProductCard({
  product,
  selected,
  onPick,
}: {
  product: SchachermayerProduct
  selected: boolean
  onPick?: () => void
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 overflow-hidden rounded-xl border bg-card p-2 transition-all',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/40'
      )}
    >
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt=""
          className="h-20 w-full rounded-md object-contain"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        {product.brand && (
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {product.brand}
          </p>
        )}
        <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">{product.name}</p>
        {product.sku && (
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/60">{product.sku}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground'
            )}
          >
            {selected ? '✓ Picked' : 'Pick'}
          </button>
        )}
        {product.productUrl && (
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            View <ExternalLink className="size-2.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  )
}
