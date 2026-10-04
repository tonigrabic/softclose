/**
 * A trailing-edge debouncer with an explicit flush — the engine behind
 * `useDebouncedCallback`.
 *
 * Pure (no React), so the timing rules are testable in this repo's node-only
 * vitest harness with fake timers; the hook is thin glue over it, the same
 * split as `lib/project/checkpoint.ts` and `useProjectCheckpoint`.
 *
 * Every fire tells the callee why it fired: the window ran out (`timer`), the
 * caller asked (`flush`), the page is being hidden or left (`hide`), or the
 * owner unmounted (`unmount`). A caller can then do the cheap thing on a timer
 * and the durable thing when the page may not live to see the next render.
 */

export type FlushCause = 'timer' | 'flush' | 'hide' | 'unmount'

export interface Debouncer<A extends unknown[]> {
  /** (Re)start the window with the latest arguments; earlier pending ones are dropped. */
  run(...args: A): void
  /** Fire now if a call is pending. True when it fired. */
  flush(cause?: Exclude<FlushCause, 'timer'>): boolean
  /** Drop the pending call, if any. */
  cancel(): void
  pending(): boolean
}

export type DebouncedFn<A extends unknown[]> = (cause: FlushCause, ...args: A) => void

/** The owner's side: it can also swap the callback a fire reaches. */
export interface DebouncerHandle<A extends unknown[]> extends Debouncer<A> {
  /**
   * Point later fires at `fn`. A hook calls this from an effect after every
   * commit, so a fire always reaches the latest render's callback — without a
   * ref read during render, which the React lint (rightly) refuses.
   */
  setCallback(fn: DebouncedFn<A>): void
}

export function createDebouncer<A extends unknown[]>(fn: DebouncedFn<A>, delayMs: number): DebouncerHandle<A> {
  let callback = fn
  let timer: ReturnType<typeof setTimeout> | null = null
  let args: A | null = null

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  // Take the pending call before invoking it, so a callee that calls run()
  // again opens a fresh window instead of being wiped by this fire.
  const fire = (cause: FlushCause): boolean => {
    clear()
    if (args === null) return false
    const a = args
    args = null
    callback(cause, ...a)
    return true
  }

  return {
    run(...next: A) {
      args = next
      clear()
      timer = setTimeout(() => {
        timer = null
        fire('timer')
      }, delayMs)
    },
    flush(cause = 'flush') {
      return fire(cause)
    },
    cancel() {
      clear()
      args = null
    },
    pending() {
      return args !== null
    },
    setCallback(next) {
      callback = next
    },
  }
}
