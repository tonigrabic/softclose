'use client'

import { useEffect, useState } from 'react'
import { createDebouncer, type DebouncedFn, type Debouncer } from './debounce'

export interface DebouncedCallbackOptions {
  /** Fire a pending call when the owner unmounts, instead of dropping it. */
  flushOnUnmount?: boolean
  /**
   * Fire a pending call when the tab is hidden or the page is left — a reload
   * or a closing tab inside the window would otherwise lose it.
   */
  flushOnPageHide?: boolean
}

/**
 * A stable debouncer around the latest `fn`.
 *
 * Thin glue over `createDebouncer` (lib/debounce.ts), which holds every timing
 * rule and is what the tests cover. The debouncer is created once, so it is a
 * safe effect dependency; after every commit it is pointed at that render's
 * `fn`, so a fire (always after a commit: a timer, an event, a cleanup)
 * reaches the latest callback.
 *
 * StrictMode's simulated unmount finds nothing pending on mount, so the
 * unmount flush is a no-op there; and with no "disposed" state the debouncer
 * keeps working after the simulated remount.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: DebouncedFn<A>,
  delayMs: number,
  opts: DebouncedCallbackOptions = {}
): Debouncer<A> {
  const [debouncer] = useState(() => createDebouncer<A>(fn, delayMs))
  useEffect(() => {
    debouncer.setCallback(fn)
  })

  const { flushOnUnmount = false, flushOnPageHide = false } = opts

  useEffect(() => {
    if (!flushOnUnmount) return
    return () => {
      debouncer.flush('unmount')
    }
  }, [debouncer, flushOnUnmount])

  useEffect(() => {
    if (!flushOnPageHide) return
    // `visibilitychange` (hidden) is the reliable signal on mobile; `pagehide`
    // covers a desktop reload or close that skips it. Whichever comes second
    // finds nothing pending. Not `beforeunload`: it disables the bfcache.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') debouncer.flush('hide')
    }
    const onPageHide = () => {
      debouncer.flush('hide')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [debouncer, flushOnPageHide])

  return debouncer
}
