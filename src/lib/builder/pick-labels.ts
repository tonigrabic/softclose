/**
 * What the homeowner picked in the builder, in the words the builder used.
 *
 * The wrap-up and its fallback summary show these, not the inspiration-vision
 * guesses on the profile (doorMaterial, worktopPreference, …). Those are an
 * early read of the reference photos, taken before the builder; the builder is
 * where the homeowner actually chose, and the two can disagree ("shaker" from
 * the photos, slab doors in the build).
 *
 * Labels reuse the builder's own keys (doors.material.*, doors.profile.*,
 * worktop.family.*, backsplash.kind.*) and the catalog's decor names, so the
 * summary repeats exactly what the picker said. Pure and server-safe.
 */
import { findDecor } from '@/lib/catalog'
import { tDynamic, type Locale } from '@/lib/i18n/core'
import { normalizeBuilderState } from './normalize'
import type { BuilderState } from './inventory'

export interface BuilderPickLabels {
  doors: string | null
  worktop: string | null
  backsplash: string | null
}

/** `saved` is `LeadProfile.builderState` (typed `unknown` there); null when absent. */
export function builderPickLabels(saved: unknown, locale: Locale): BuilderPickLabels | null {
  if (!saved || typeof saved !== 'object') return null
  const state = normalizeBuilderState(saved as BuilderState)

  const label = (key: string, raw: string) => {
    const text = tDynamic(key, locale)
    return text === key ? raw.replace(/_/g, ' ') : text
  }
  const decor = (code?: string, structure?: string) => {
    if (!code) return null
    const d = findDecor(code, structure)
    if (!d) return code
    return `${locale === 'en-US' && d.nameEn ? d.nameEn : d.name} (${d.code})`
  }
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ')

  const { doors, worktop, backsplash } = state
  // Decor codes are Elgrad board rows — they only apply to laminate/compact.
  const worktopDecor =
    worktop.family === 'laminate' || worktop.family === 'compact'
      ? decor(worktop.decorCode, worktop.decorStructure)
      : null
  const otherDecor = backsplash.kind === 'other' ? backsplash.otherDecor?.trim() : undefined

  // Fronts are material first: a decor for iveral, a RAL colour + profile for
  // lacquered MDF, nothing more to say for aluminium with glass.
  const doorsDetail =
    doors.material === 'iveral'
      ? decor(doors.decorCode, doors.decorStructure)
      : doors.material === 'lacquered_mdf'
        ? join(doors.ralCode || null, label(`doors.profile.${doors.profile}`, doors.profile))
        : null

  return {
    doors: join(label(`doors.material.${doors.material}`, doors.material), doorsDetail),
    worktop: join(label(`worktop.family.${worktop.family}`, worktop.family), worktopDecor),
    // "Other" means the homeowner typed the decor — their words say more than "Other".
    backsplash: otherDecor || label(`backsplash.kind.${backsplash.kind}`, backsplash.kind),
  }
}
