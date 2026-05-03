/**
 * Typed loader for the Schachermayer hr-HR scrape (hardware / sinks / taps /
 * appliances). The scrape is intentionally small (~25 SKUs per kind) — a
 * curated landing-page snapshot, not a deep crawl — so the picker UIs can
 * surface real products without paginating.
 *
 * Pricing is NOT included (Schachermayer's prices are B2B login-walled). The
 * BOM calculator uses tier-based reference RRP today; specific-SKU picks let
 * the maker see what the homeowner had in mind, even if the exact price comes
 * from the maker's account.
 */
import schachermayerJson from './schachermayer-hardware.json'

export interface SchachermayerProduct {
  name: string
  /** "Br.art.112592971" — Schachermayer article number when present. */
  sku?: string
  brand?: string
  imageUrl?: string
  productUrl?: string
  shortSpec?: string
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

export function schachermayerProducts(kind: SchachermayerKind): SchachermayerProduct[] {
  return catalog.byKind?.[kind]?.products ?? []
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
  return searchSchachermayer('appliance', { anyKeyword: keywords[type] })
}
