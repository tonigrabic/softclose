/**
 * Maker B2B pricing override (the launch-blocker drop-in, LOOP.md Q7).
 *
 * The Schachermayer scrape carries RETAIL reference RRPs — what the homeowner
 * sees. The maker's real account cost is lower and login-walled, so it can't be
 * scraped. This file is where the maker drops their B2B prices, keyed by SKU.
 *
 * Decision (2026-06-21): homeowner keeps seeing retail; the maker side gains a
 * cost basis. So these prices feed ONLY the maker handoff/dashboard
 * (computeBom `pricing: 'maker'`), never the homeowner-facing estimate.
 *
 * Empty by default → `pricing: 'maker'` equals retail → zero behaviour change
 * until the maker populates `bySku`. Covers every picked catalog product:
 * appliances, hardware (drawers + hinges), and sink + tap.
 */
import makerPricingJson from './maker-pricing.json'

interface MakerPricing {
  schema: { version: string; currency: string; basis: string }
  note: string
  bySku: Record<string, number>
}

const data = makerPricingJson as MakerPricing

/** Maker B2B cost for a SKU, or null when not supplied (→ fall back to retail). */
export function makerPriceForSku(sku: string | undefined | null): number | null {
  if (!sku) return null
  const v = data.bySku?.[sku]
  return typeof v === 'number' && v >= 0 ? v : null
}

/** How many SKUs the maker has priced. 0 = the override is dormant (retail). */
export function makerPricingEntryCount(): number {
  return Object.keys(data.bySku ?? {}).length
}
