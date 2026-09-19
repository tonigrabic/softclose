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

/** Codes with a real file under /public/decor-swatches — empty until the fetch script runs. */
const AVAILABLE_SWATCH_IMAGES: ReadonlySet<string> = new Set<string>([])

function swatchImagePath(code: string, structure: string): string | null {
  const key = `${code}-${structure}`
  return AVAILABLE_SWATCH_IMAGES.has(key) ? `/decor-swatches/${key}.jpg` : null
}

export function decorSwatch(code: string, structure?: string): DecorSwatch | null {
  const decor = findDecor(code, structure)
  if (!decor) return null
  return {
    code: decor.code,
    structure: decor.structure,
    // No swatch images are shipped yet (public/decor-swatches/ does not exist),
    // so resolve to null and let the picker use hexHint. Pointing at a path that
    // 404s cost ~80 failed requests per builder session (verified in-browser
    // 2026-09-19). When the EGGER fetch script lands, gate this on a generated
    // manifest, not on a hopeful path.
    imagePath: swatchImagePath(decor.code, decor.structure),
    hexHint: decor.hexHint,
  }
}
