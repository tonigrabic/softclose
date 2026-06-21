/**
 * Swatch resolution for catalog decors.
 *
 * MVP: returns the local /decor-swatches/<code>.jpg path if we ever drop a
 * downloaded image in /public/decor-swatches; otherwise undefined and the
 * picker falls back to the hexHint colour square.
 *
 * Later: a build-time script downloads from EGGER's public decor library.
 * Until then, hexHint is good enough for the picker UI.
 */

import { findDecor } from '@/lib/catalog'

export interface DecorSwatch {
  code: string
  structure: string
  /** Path under /public if a real image exists; else null. */
  imagePath: string | null
  /** Approximate sRGB hex used as fallback / loading placeholder. */
  hexHint: string
}

export function decorSwatch(code: string, structure?: string): DecorSwatch | null {
  const decor = findDecor(code, structure)
  if (!decor) return null
  return {
    code: decor.code,
    structure: decor.structure,
    // Wired but file may not exist yet. UI must handle missing image gracefully.
    imagePath: `/decor-swatches/${decor.code}-${decor.structure}.jpg`,
    hexHint: decor.hexHint,
  }
}
