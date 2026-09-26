/**
 * RAL Classic — the colour system lacquered MDF fronts are ordered in.
 *
 * Makers and lacquer shops talk in codes ("RAL 9016"), so the code is the
 * label; RAL publishes names only in German and English. Hex values are RAL's
 * own on-screen swatches — approximations, so the picker carries a "check on a
 * physical RAL card" note (see ral.json `source`).
 */
import ralJson from './ral.json'

export interface RalColour {
  /** "RAL 9016" */
  code: string
  nameEn: string
  nameDe: string
  hex: string
  group: string
  /** Pearl / metallic / fluorescent can't be shown on a screen — the picker offers solids only. */
  finish: 'solid' | 'pearl' | 'metallic' | 'fluorescent'
}

export const ralColours = ralJson.colours as RalColour[]

const BY_CODE = new Map(ralColours.map((c) => [c.code, c]))

/** The colours most chosen for lacquered kitchen fronts, in order. */
export const RAL_KITCHEN_SHORTLIST: RalColour[] = ralJson.kitchenShortlist
  .map((code) => BY_CODE.get(code))
  .filter((c): c is RalColour => Boolean(c))

/** The default lacquer white — tops the only regional most-requested list. */
export const DEFAULT_RAL = 'RAL 9016'

/** "9016", "ral9016", "RAL 9016" → "RAL 9016"; anything else → null. */
export function normalizeRalCode(input: string): string | null {
  const m = input.trim().match(/^(?:ral\s*)?(\d{4})$/i)
  return m ? `RAL ${m[1]}` : null
}

/** A solid RAL Classic colour by code, or null (unknown, or not showable). */
export function findRal(code: string | null | undefined): RalColour | null {
  if (!code) return null
  const c = BY_CODE.get(normalizeRalCode(code) ?? code)
  return c && c.finish === 'solid' ? c : null
}
