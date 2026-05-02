import type { LeadProfile, StubEstimate } from '@/lib/types'

/**
 * PLACEHOLDER cost-model engine.
 *
 * Per product-foundations.md Principle 6: we may produce a confidence-bounded
 * range, never a single-number quote. This helper produces a deliberately
 * naive ±20% range from the stated budget band (or scope as fallback) so the
 * homeowner sees something concrete in the wrap-up while we build the real
 * cost-model engine in a follow-up. The handoff carries the placeholder flag
 * so the maker dashboard renders this differently.
 */
const BUDGET_MIDPOINTS_USD: Record<string, number> = {
  under_15k: 12000,
  '15k_30k': 22500,
  '30k_60k': 45000,
  '60k_plus': 80000,
}

const SCOPE_MIDPOINTS_USD: Record<number, number> = {
  // count of scope booleans true → midpoint (very rough)
  0: 12000,
  1: 16000,
  2: 22000,
  3: 28000,
  4: 35000,
  5: 42000,
  6: 50000,
  7: 58000,
  8: 65000,
  9: 72000,
  10: 80000,
  11: 90000,
  12: 100000,
  13: 110000,
}

function countTrueValues(obj: Record<string, unknown> | undefined): number {
  if (!obj) return 0
  return Object.values(obj).filter((v) => v === true).length
}

function midpointFromBudget(profile: LeadProfile): number | null {
  const key = profile.budgetRange?.toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return null
  return BUDGET_MIDPOINTS_USD[key] ?? null
}

function midpointFromScope(profile: LeadProfile): number {
  const n = countTrueValues(profile.scope as Record<string, unknown> | undefined)
  return SCOPE_MIDPOINTS_USD[Math.min(n, 13)] ?? 30000
}

export function buildStubEstimate(profile: LeadProfile): StubEstimate | null {
  const explicit = midpointFromBudget(profile)
  const fromScope = midpointFromScope(profile)
  // Use the explicit budget band if present, but bias by ±10% if it doesn't
  // match scope wildly.
  const midpoint = explicit ?? fromScope
  const low = Math.round(midpoint * 0.8 * 100) / 100
  const high = Math.round(midpoint * 1.2 * 100) / 100
  const basis = explicit
    ? `Centered on stated budget band (${profile.budgetRange ?? 'unknown'}); ±20% placeholder range. Real engine will use scope + materials + structural + trades.`
    : `Derived from ${countTrueValues(profile.scope as Record<string, unknown> | undefined)} scope items selected; ±20% placeholder range. Real engine will use stated budget + materials + structural + trades.`
  return {
    low,
    high,
    basis,
    placeholder: true,
  }
}
