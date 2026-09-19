/**
 * Typed loader for the Schachermayer hr-HR scrape (hardware / sinks / taps /
 * appliances). The scrape is intentionally small (~25 SKUs per kind) — a
 * curated landing-page snapshot, not a deep crawl — so the picker UIs can
 * surface real products without paginating.
 *
 * Every product carries `priceEur` — a curated Croatian-market reference RRP
 * (incl. VAT) stamped by scripts/add-reference-prices.mjs, because the
 * supplier's own prices are B2B login-walled. A pick WITH a price makes its
 * BOM component exact; the maker's account price replaces it at quote time.
 */
import schachermayerJson from './schachermayer-hardware.json'
import elgradJson from './elgrad-products.json'

export interface SchachermayerProduct {
  name: string
  /** "Br.art.112592971" — Schachermayer article number when present. */
  sku?: string
  brand?: string
  imageUrl?: string
  productUrl?: string
  shortSpec?: string
  /** Reference RRP in EUR (see module header). Optional defensively — a
   * future re-scrape might land before its pricing pass. */
  priceEur?: number
  /** Which supplier catalog this came from. Absent ⇒ Schachermayer (legacy). */
  supplier?: 'schachermayer' | 'elgrad'
  /**
   * Where the price comes from — the honesty tag the picker shows:
   *  - 'retail_incl_vat': a real public shelf price (Elgrad webshop), dated by `observedAt`
   *  - 'reference_estimate': our curated Croatian-market guess (Schachermayer is B2B-walled)
   */
  priceBasis?: 'retail_incl_vat' | 'reference_estimate'
  /** ISO date the price was last seen (real prices only). */
  observedAt?: string
  /** Classified builder type for Elgrad rows (hob, oven, drawer_system, hinge, sink, tap, …). */
  type?: string
}

export type SchachermayerKind = 'hardware' | 'sink_tap' | 'appliance'

interface SchachermayerCatalog {
  schema: { version: string }
  source: { supplier: string; scrapedAt: string }
  byKind: Record<
    SchachermayerKind,
    {
      sourceUrl: string
      products: SchachermayerProduct[]
      note?: string | null
      error?: string
    }
  >
}

const catalog = schachermayerJson as unknown as SchachermayerCatalog

interface ElgradCatalog {
  schema: { version: string }
  source: { supplier: string; url: string; priceBasis: string; generatedAt: string }
  bands: Record<string, PriceBand>
  products: Array<{
    supplier: 'elgrad'
    sku: string
    name: string
    brand?: string
    kind: SchachermayerKind
    type: string
    unit?: string
    priceEur: number
    priceBasis: 'retail_incl_vat'
    observedAt?: string
    productUrl?: string
    imageUrl?: string
  }>
}
export interface PriceBand {
  n: number
  min: number
  p10?: number
  p20: number
  p25?: number
  p40?: number
  median: number
  p60?: number
  p75?: number
  p80: number
  p90?: number
  max: number
}

const elgrad = elgradJson as unknown as ElgradCatalog

/** Real-price bands per `kind/type` from the Elgrad webshop (p20–p80 etc.). */
export const elgradPriceBands = elgrad.bands

/**
 * A tier's price band for an UNPICKED component, cut from the real Elgrad
 * distribution: budget = p10–p25, mid = p40–p60, premium = p75–p90. Returns
 * null when the catalog has no usable subset, so callers keep their fallback.
 */
export function elgradTierBand(
  key: 'hardware/runner_set' | 'hardware/hinge_unit' | 'hardware/knob' | 'hardware/bar',
  tier: 'budget' | 'mid' | 'premium'
): { low: number; high: number } | null {
  const b = elgrad.bands[key]
  if (!b || b.n < 10) return null
  const pick =
    tier === 'budget' ? [b.p10, b.p25] : tier === 'mid' ? [b.p40, b.p60] : [b.p75, b.p90]
  if (pick[0] == null || pick[1] == null) return null
  // A tier is a class estimate, not a whole distribution: keep it inside ±20%
  // of its midpoint so one wide tier (budget runners span 12–31 €) cannot push
  // the kitchen band past the promise.
  const mid = (pick[0] + pick[1]) / 2
  const half = Math.min((pick[1] - pick[0]) / 2, mid * 0.2)
  return { low: mid - half, high: mid + half }
}
export const elgradGeneratedAt = elgrad.source.generatedAt

/**
 * All pickable products of a kind, across suppliers. Schachermayer's curated
 * reference-priced items come first (small, hand-picked), then Elgrad's
 * real-priced webshop rows. Every row is tagged so the UI can say which is
 * which — a real shelf price and our own estimate must never look the same.
 */
export function supplierProducts(kind: SchachermayerKind): SchachermayerProduct[] {
  const legacy = (catalog.byKind?.[kind]?.products ?? []).map((p) => ({
    ...p,
    supplier: p.supplier ?? ('schachermayer' as const),
    priceBasis: p.priceBasis ?? ('reference_estimate' as const),
  }))
  const real = elgrad.products.filter((p) => p.kind === kind)
  return [...legacy, ...real]
}

/** @deprecated name kept for call sites; now returns every supplier. */
export function schachermayerProducts(kind: SchachermayerKind): SchachermayerProduct[] {
  return supplierProducts(kind)
}

/** Filter applied to products before returning — keep it cheap. */
export interface SchachermayerFilter {
  brandIncludes?: string
  nameIncludes?: string
  /** Quick keyword whitelist — first match wins. */
  anyKeyword?: string[]
}

export function searchSchachermayer(
  kind: SchachermayerKind,
  filter?: SchachermayerFilter
): SchachermayerProduct[] {
  const items = schachermayerProducts(kind)
  if (!filter) return items
  return items.filter((p) => {
    if (filter.brandIncludes && !(p.brand ?? '').toLowerCase().includes(filter.brandIncludes.toLowerCase())) {
      return false
    }
    if (filter.nameIncludes && !p.name.toLowerCase().includes(filter.nameIncludes.toLowerCase())) {
      return false
    }
    if (filter.anyKeyword && filter.anyKeyword.length > 0) {
      const haystack = `${p.name} ${p.brand ?? ''}`.toLowerCase()
      if (!filter.anyKeyword.some((k) => haystack.includes(k.toLowerCase()))) return false
    }
    return true
  })
}

/**
 * Sinks / taps split out of the shared 'sink_tap' scrape by Croatian keyword.
 * Centralised here (next to appliancesForType) so the keyword knowledge lives
 * in one place — a re-scrape that renames products only needs these lists
 * updated, not the SinkTaps browse UI. "slavina" = tap, "sudoper" = sink.
 */
export function sinksFromCatalog(): SchachermayerProduct[] {
  return supplierProducts('sink_tap').filter((p) =>
    p.type ? p.type === 'sink' : matchesAny(p, ['sudoper', 'umival'])
  )
}

export function tapsFromCatalog(): SchachermayerProduct[] {
  return supplierProducts('sink_tap').filter((p) =>
    p.type ? p.type === 'tap' : matchesAny(p, ['slavin', 'mješalic', 'mjesalic'])
  )
}

function matchesAny(p: SchachermayerProduct, keywords: string[]): boolean {
  const haystack = `${p.name} ${p.brand ?? ''}`.toLowerCase()
  return keywords.some((k) => haystack.includes(k.toLowerCase()))
}

/** Group hardware items by brand so the Hardware picker can map them to tiers. */
export function hardwareByBrand(): Record<string, SchachermayerProduct[]> {
  const out: Record<string, SchachermayerProduct[]> = {}
  for (const p of schachermayerProducts('hardware')) {
    const brand = (p.brand ?? 'Other').trim() || 'Other'
    out[brand] = out[brand] ?? []
    out[brand].push(p)
  }
  return out
}

/**
 * Map an appliance type onto matching scraped products by keyword. Crude but
 * good enough for the MVP browse list — we re-rank later when the BOM cares
 * about specific SKUs.
 */
export function appliancesForType(
  type: 'hob' | 'oven' | 'extractor' | 'fridge' | 'dishwasher' | 'microwave'
): SchachermayerProduct[] {
  const keywords: Record<typeof type, string[]> = {
    hob: ['ploča', 'kuhanje', 'indukcij', 'staklokeram'],
    oven: ['pećnica'],
    extractor: ['napa'],
    fridge: ['hladnj', 'frižid'],
    dishwasher: ['perilica posuđa', 'perilica posu'],
    microwave: ['mikrovalna', 'mikrovaln'],
  }
  // Elgrad rows carry a classified `type`; legacy rows fall back to keywords.
  return supplierProducts('appliance').filter((p) => (p.type ? p.type === type : matchesAny(p, keywords[type])))
}
