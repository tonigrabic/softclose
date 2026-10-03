import type { LeadProfile } from '@/lib/types'

/**
 * What the builder-hypothesis call may know about the homeowner (IMP-32).
 *
 * The render read is decor only: finishes, materials, appliance types. The
 * layout is fixed and measured by the homeowner at the room step, so the call
 * gets no plan, no contract and no anchor photo. It used to get the whole
 * LeadProfile, which carries every render and space photo as data URLs, so the
 * body could hit 413, and 2,000 characters of client JSON went into the prompt.
 *
 * This whitelist is the whole profile context now: a few short preference ids.
 * The client builds it with `decorProfileHints`; the server never trusts it and
 * re-checks it with `sanitizeDecorProfileHints` before it reaches the prompt.
 */
export interface DecorProfileHints {
  stylePreferences?: string[]
  doorMaterial?: string
  worktopPreference?: string
  backsplashPreference?: string
  appliancesIntegrated?: string
}

const MAX_STRING = 60
const MAX_ARRAY = 8

const STRING_KEYS = ['doorMaterial', 'worktopPreference', 'backsplashPreference', 'appliancesIntegrated'] as const

/** A short, non-empty string, or undefined. Over-long values are dropped, not cut. */
function shortString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim()
  if (!s || s.length > MAX_STRING || s.startsWith('data:')) return undefined
  return s
}

function shortList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  for (const item of raw) {
    const s = shortString(item)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= MAX_ARRAY) break
  }
  return out.length ? out : undefined
}

/**
 * Whitelist and bound an untrusted object into DecorProfileHints: strings of at
 * most 60 characters, at most 8 style ids, unknown keys dropped. Never throws.
 */
export function sanitizeDecorProfileHints(raw: unknown): DecorProfileHints {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: DecorProfileHints = {}
  const styles = shortList(r.stylePreferences)
  if (styles) out.stylePreferences = styles
  for (const key of STRING_KEYS) {
    const s = shortString(r[key])
    if (s) out[key] = s
  }
  return out
}

/** The decor-relevant preferences from the profile, bounded the same way the server checks them. */
export function decorProfileHints(p: LeadProfile): DecorProfileHints {
  return sanitizeDecorProfileHints({
    stylePreferences: p.stylePreferences,
    doorMaterial: p.doorMaterial,
    worktopPreference: p.worktopPreference,
    backsplashPreference: p.backsplashPreference,
    appliancesIntegrated: p.appliancesIntegrated,
  })
}
