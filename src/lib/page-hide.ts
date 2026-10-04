/**
 * "The page may not live to see the next render": the tab is being hidden, or
 * the page is being left (a reload, a closed tab, a navigation).
 *
 * `visibilitychange` (hidden) is the reliable signal on mobile; `pagehide`
 * covers a desktop reload or close that skips it. A handler can run twice for
 * one exit, so it must be idempotent. Not `beforeunload`: it disables the
 * bfcache.
 *
 * What a handler may rely on: only synchronous work. A write started here
 * that needs another task to finish — an IndexedDB open or transaction, a
 * plain fetch — is lost on a reload or close (measured in Chromium: none of
 * open-per-call, already-open, or explicit-commit IndexedDB puts landed),
 * while a localStorage write in the same handler persists. Async work still
 * lands on a tab or app switch, where the page lives on.
 *
 * The targets are injectable so the node-only test harness can drive it with
 * plain EventTargets.
 */
export interface PageHideTargets {
  win: EventTarget
  doc: EventTarget & { visibilityState: string }
}

function browserTargets(): PageHideTargets | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return { win: window, doc: document }
}

/** Call `handler` whenever the page is hidden or left. Returns the unsubscribe. */
export function subscribePageHide(handler: () => void, targets: PageHideTargets | null = browserTargets()): () => void {
  if (!targets) return () => {}
  const { win, doc } = targets
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') handler()
  }
  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pagehide', handler)
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility)
    win.removeEventListener('pagehide', handler)
  }
}
