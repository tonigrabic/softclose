/**
 * Swatch resolution for catalog decors.
 *
 * Every curated Elgrad decor is an EGGER board, and EGGER publishes a real
 * swatch + tileable texture per decor. `decor-images.json` is the generated
 * manifest (code + structure → URLs); a decor without an entry falls back to
 * its hexHint colour square.
 *
 * TESTING ONLY: the URLs hotlink EGGER's image server (Toni, 2026-09-26).
 * EGGER's photos are copyrighted — before launch, get their permission and
 * serve fixed sizes from our own storage (their image ids change with each
 * collection). Flip DECOR_IMAGES_ENABLED to fall back to colour squares.
 */

import { findDecor } from '@/lib/catalog'
import decorImages from '@/lib/catalog/decor-images.json'

const DECOR_IMAGES_ENABLED = true

export interface DecorSwatch {
  code: string
  structure: string
  /** Real swatch image URL, or null → use hexHint. */
  imagePath: string | null
  /** Approximate sRGB hex used as fallback / loading placeholder. */
  hexHint: string
  /** True for wood decors — the picker shows these larger so the grain reads. */
  isWood: boolean
}

type ImageEntry = { swatch: string; texture: string | null; isWood: boolean }
const IMAGES = decorImages.images as Record<string, ImageEntry>

export function decorSwatch(code: string, structure?: string): DecorSwatch | null {
  const decor = findDecor(code, structure)
  if (!decor) return null
  const img = DECOR_IMAGES_ENABLED ? IMAGES[`${decor.code} ${decor.structure}`] : undefined
  return {
    code: decor.code,
    structure: decor.structure,
    imagePath: img?.swatch ?? null,
    hexHint: decor.hexHint,
    isWood: img?.isWood ?? (decor.family === 'oak' || decor.family === 'walnut'),
  }
}

/** "Klasična bijela (W960 ST7)" — how makers read a decor (name + Elgrad code). */
export function decorLabel(name: string, code: string, structure: string): string {
  return `${name} (${code} ${structure})`
}
