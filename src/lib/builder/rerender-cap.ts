/**
 * The builder's re-render cap (AGENTS.md rule 2: renders are capped at five a
 * session — each one is paid image generation, and each one is stored).
 *
 * Counted from the build itself, never from component state. Re-renders
 * persist with the build since IMP-06, so a count kept in the panel's
 * `useState` restarted at zero on every reload or remount while the restored
 * build still held its renders: five more were offered each time, without
 * bound. The build's `rerenders[]` is append-only (the reducer's
 * `push_rerender` is the only thing that touches it; the Original lives
 * outside it), so its length is the number of re-renders this build has used.
 *
 * Every entry counts, shown or not: a re-render restored from the server copy
 * (a second device) carries an `omitted://image` marker instead of its pixels
 * and is hidden from the carousel, but it was generated and paid for all the
 * same. Should entries ever become removable, this needs a persisted counter
 * on BuilderState instead.
 */
import type { BuilderState } from './inventory'

export const MAX_RERENDERS_PER_SESSION = 5

/** Re-renders this build has already used, restored marker-only ones included. */
export function rerendersUsed(state: Pick<BuilderState, 'rerenders'>): number {
  return Array.isArray(state.rerenders) ? state.rerenders.length : 0
}

/** Re-renders still on offer for this build — never below zero. */
export function rerendersRemaining(state: Pick<BuilderState, 'rerenders'>): number {
  return Math.max(0, MAX_RERENDERS_PER_SESSION - rerendersUsed(state))
}
