/**
 * Unit display + parsing. Storage is always cm; this module formats for
 * the homeowner and parses whatever they type back into cm.
 *
 * Locale-aware default: en-US / en-GB → ft+in, everything else → cm.
 */
import type { DisplayUnit } from './model'

export function detectDefaultUnit(): DisplayUnit {
  if (typeof navigator === 'undefined') return 'cm'
  const lang = navigator.language?.toLowerCase() ?? ''
  return lang.startsWith('en-us') || lang.startsWith('en-gb') ? 'ft_in' : 'cm'
}

const CM_PER_INCH = 2.54
const CM_PER_FOOT = 30.48

export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH
}

export function cmToFeetInches(cm: number): { ft: number; in: number } {
  const totalInches = cm / CM_PER_INCH
  const ft = Math.floor(totalInches / 12)
  const inches = Math.round((totalInches - ft * 12) * 10) / 10
  if (inches === 12) return { ft: ft + 1, in: 0 }
  return { ft, in: inches }
}

/** Format a cm value for display in either unit. */
export function formatLength(cm: number, unit: DisplayUnit): string {
  if (unit === 'cm') {
    return `${Math.round(cm)} cm`
  }
  const { ft, in: inches } = cmToFeetInches(cm)
  if (inches === 0) return `${ft}′`
  return `${ft}′ ${inches}″`
}

/**
 * Compact form, suitable for small canvas labels. We round inches to a
 * whole number and roll over to the next foot when that round produces 12
 * (e.g. 60 cm = 1 ft 11.6 in → "2′" rather than the nonsense "1′12″").
 */
export function formatLengthCompact(cm: number, unit: DisplayUnit): string {
  if (unit === 'cm') return `${Math.round(cm)}`
  const parts = cmToFeetInches(cm)
  let ft = parts.ft
  let roundedIn = Math.round(parts.in)
  if (roundedIn === 12) {
    ft += 1
    roundedIn = 0
  }
  if (roundedIn === 0) return `${ft}′`
  return `${ft}′${roundedIn}″`
}

/**
 * Parse a string the homeowner typed and return cm.
 *
 * Handles everything common:
 *   "260"          → 260 cm
 *   "260cm"        → 260 cm
 *   "2.6m"         → 260 cm
 *   "2.6 m"        → 260 cm
 *   "8'6"          → 8 ft 6 in
 *   "8' 6"         → same
 *   "8'6\""        → same
 *   "8' 6\""       → same
 *   "8.5'"         → 8.5 ft
 *   "102in"        → 102 in
 *   "102\""        → 102 in
 *   "102 inches"   → 102 in
 */
export function parseLengthToCm(raw: string): number | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null

  // Feet+inches: 8'6 / 8' 6 / 8'6" / 8' 6"
  const ftIn = text.match(/^(\d+(?:\.\d+)?)\s*(?:ft|'|′|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"|″|inches?)?)?$/)
  if (ftIn) {
    const ft = parseFloat(ftIn[1])
    const inches = ftIn[2] ? parseFloat(ftIn[2]) : 0
    return ft * CM_PER_FOOT + inches * CM_PER_INCH
  }

  // Inches only: 102", 102in, 102 inches
  const inches = text.match(/^(\d+(?:\.\d+)?)\s*(?:in|"|″|inches?)$/)
  if (inches) return parseFloat(inches[1]) * CM_PER_INCH

  // Metres: 2.6m, 2.6 m
  const metres = text.match(/^(\d+(?:\.\d+)?)\s*m$/)
  if (metres) return parseFloat(metres[1]) * 100

  // Centimetres: 260, 260 cm, 260cm
  const cm = text.match(/^(\d+(?:\.\d+)?)\s*(?:cm)?$/)
  if (cm) return parseFloat(cm[1])

  return null
}
