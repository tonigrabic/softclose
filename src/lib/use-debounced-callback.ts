'use client'

import { useEffect, useState } from 'react'
import { createDebouncer, type DebouncedFn, type Debouncer } from './debounce'
import { subscribePageHide } from './page-hide'

export interface DebouncedCallbackOptions {
  /** Fire a pending call when the owner unmounts, instead of dropping it. */
  flushOnUnmount?: boolean
  /**
   * Fire a pending call (cause `hide`) when the tab is hidden or the page is
   * left. The fire itself is synchronous; on a reload or a closed tab only the
   * callee's synchronous work survives (see lib/page-hide.ts), so a callee
   * that must survive those writes something synchronous there.
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
    // Whichever of visibilitychange / pagehide comes second finds nothing pending.
    return subscribePageHide(() => {
      debouncer.flush('hide')
    })
  }, [debouncer, flushOnPageHide])

  return debouncer
}
