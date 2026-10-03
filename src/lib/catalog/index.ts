/**
 * Typed loaders for the supplier catalog.
 *
 * Two layers:
 *   1. `decors`           — hand-curated MVP set (~32 decors) with metadata
 *                            (family/tone/finish/hexHint) tuned for the picker.
 *   2. `decorsRaw`        — full PDF dump (206 rows). Used for traceability /
 *                            future expansion. Don't render this directly.
 *
 * Hardware (Schachermayer scrape) is loaded separately under `./hardware`.
 */
import elgradDecorsJson from './elgrad-decors.json'
import elgradServicesJson from './elgrad-services.json'

export type DecorFamily =
  | 'white'
  | 'cream'
  | 'beige'
  | 'grey'
  | 'black'
  | 'oak'
  | 'walnut'
  | 'wood-other'
  | 'concrete'
  | 'marble'
  | 'metal'

export type DecorTone = 'light' | 'medium' | 'dark'

export type DecorFinish =
  | 'smooth-matte'
  | 'satin'
  | 'gloss'
  | 'fine-grain'
  | 'soft-textured'
  | 'wood-grain'
  | 'stone-texture'

export type DecorUse = 'door' | 'carcass' | 'worktop' | 'backsplash' | 'wall'

export interface DecorPrices {
  /** €/m² for 18 mm chipboard board (door + carcass standard). */
  iverica18?: number | null
  iverica25?: number | null
  iverica38?: number | null
  /** €/m' for 38 mm worktop, by board width. */
  worktop600?: number | null
  worktop650?: number | null
  worktop920?: number | null
}

export interface CatalogDecor {
  code: string
  structure: string
  name: string
  nameEn?: string
  family: DecorFamily
  tone: DecorTone
  finish: DecorFinish
  /** Approximate sRGB for color preview before swatches load. */
  hexHint: string
  uses: DecorUse[]
  prices: DecorPrices
}

/**
 * Whether a source's prices include PDV. Every Elgrad source is 'gross': the
 * webshop (MPC) and the veleprodajni cjenik both include it (Toni,
 * 2026-10-03). computeBom grosses nothing up, so a 'net' source would
 * understate the homeowner's range by 25 %; tests/price-basis.test.ts holds
 * every Elgrad file to 'gross'.
 */
export type VatBasis = 'gross'

/** Price-basis metadata carried in every Elgrad catalog file's `source`. */
export interface CatalogVatBasis {
  vatBasis: VatBasis
  /** Who said so, and when. */
  vatBasisSource: string
}

interface DecorsCatalog {
  schema: { version: string; currency: string }
  source: CatalogVatBasis & { supplier: string; pricelist: string; pdfFile: string; validFrom: string }
  defaults: {
    edgeBandingPerM: number
    doorThicknessMm: number
    carcassThicknessMm: number
    worktopThicknessMm: number
    worktopWidthMm: number
  }
  decors: CatalogDecor[]
}

export const decorsCatalog = elgradDecorsJson as DecorsCatalog
export const decors: CatalogDecor[] = decorsCatalog.decors

interface ServicesCatalog {
  schema: { version: string; currency: string }
  source: CatalogVatBasis & {
    supplier: string
    pdfFile: string
    pdfPage: number
    validFrom: string
    extractedAt: string
  }
  cutting: Record<string, number>
  edgeBanding: Record<string, number>
  cncMachining: Record<string, number>
  pressing: Record<string, number>
}

export const services = elgradServicesJson as ServicesCatalog

/** Lookup helpers used by the picker UI and the BOM calculator. */
export function findDecor(code: string, structure?: string): CatalogDecor | null {
  return (
    decors.find((d) => d.code === code && (!structure || d.structure === structure)) ??
    decors.find((d) => d.code === code) ??
    null
  )
}

export function decorsByUse(use: DecorUse): CatalogDecor[] {
  return decors.filter((d) => d.uses.includes(use))
}

export function decorsByFamily(family: DecorFamily, use?: DecorUse): CatalogDecor[] {
  return decors.filter(
    (d) => d.family === family && (!use || d.uses.includes(use))
  )
}

/** Resolve the door-panel price for a decor in EUR/m². */
export function doorPricePerM2(decor: CatalogDecor): number | null {
  return decor.prices.iverica18 ?? null
}

/** Resolve the worktop price (€/m') at the requested standard width. */
export function worktopPricePerM(
  decor: CatalogDecor,
  widthMm: 600 | 650 | 920 = 600
): number | null {
  if (widthMm === 600) return decor.prices.worktop600 ?? null
  if (widthMm === 650) return decor.prices.worktop650 ?? null
  if (widthMm === 920) return decor.prices.worktop920 ?? null
  return null
}
