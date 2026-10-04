/**
 * The debounce behind the builder's autosave (IMP-06).
 *
 * `useDebouncedCallback` is thin glue over `createDebouncer`, the same split as
 * `useProjectCheckpoint` over `lib/project/checkpoint.ts`: vitest here runs in
 * node with no DOM, so the timing rules live in the pure engine and are tested
 * there, with fake timers.
 *
 * What these guard: one save per burst of picks (not one per tap), the latest
 * pick is the one saved, a hidden tab or an unmount inside the window still
 * saves, and a cancelled save stays cancelled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer, type FlushCause } from '@/lib/debounce'

function setup(delay = 500) {
  const calls: { cause: FlushCause; args: [string, number] }[] = []
  const d = createDebouncer<[string, number]>((cause, ...args) => calls.push({ cause, args }), delay)
  return { d, calls }
}

describe('createDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once at exactly the delay, with the latest arguments and cause "timer"', () => {
    const { d, calls } = setup()
    d.run('a', 1)
    d.run('b', 2)
    vi.advanceTimersByTime(499)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual([{ cause: 'timer', args: ['b', 2] }])
    vi.advanceTimersByTime(10_000)
    expect(calls).toHaveLength(1)
  })

  it('every run restarts the window: three runs 400 ms apart are one call, 500 ms after the last', () => {
    const { d, calls } = setup()
    d.run('a', 1)
    vi.advanceTimersByTime(400)
    d.run('b', 2)
    vi.advanceTimersByTime(400)
    d.run('c', 3)
    vi.advanceTimersByTime(499)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual([{ cause: 'timer', args: ['c', 3] }])
  })

  it('flush fires at once with the pending arguments, and the timer never fires after it', () => {
    const { d, calls } = setup()
    d.run('a', 1)
    vi.advanceTimersByTime(200)
    expect(d.flush('hide')).toBe(true)
    expect(calls).toEqual([{ cause: 'hide', args: ['a', 1] }])
    vi.advanceTimersByTime(10_000)
    expect(calls).toHaveLength(1)
  })

  it('flush defaults to cause "flush"; with nothing pending it returns false and calls nothing', () => {
    const { d, calls } = setup()
    expect(d.flush()).toBe(false)
    expect(d.flush('unmount')).toBe(false)
    expect(calls).toEqual([])
    d.run('a', 1)
    expect(d.flush()).toBe(true)
    expect(calls).toEqual([{ cause: 'flush', args: ['a', 1] }])
    // A second flush (pagehide after visibilitychange) finds nothing.
    expect(d.flush('hide')).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('cancel drops the pending call; a later flush or the timer does nothing', () => {
    const { d, calls } = setup()
    d.run('a', 1)
    d.cancel()
    expect(d.pending()).toBe(false)
    expect(d.flush('unmount')).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(calls).toEqual([])
  })

  it('pending() tracks the window, and a run after a fire opens a new one', () => {
    const { d, calls } = setup()
    expect(d.pending()).toBe(false)
    d.run('a', 1)
    expect(d.pending()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(d.pending()).toBe(false)
    d.run('b', 2)
    expect(d.pending()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(calls.map((c) => c.args)).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('setCallback points a pending fire at the latest callback (the hook does this after every commit)', () => {
    const first: string[] = []
    const latest: string[] = []
    const d = createDebouncer<[string]>((_cause, v) => first.push(v), 500)
    d.run('a')
    d.setCallback((_cause, v) => latest.push(v))
    vi.advanceTimersByTime(500)
    expect(first).toEqual([])
    expect(latest).toEqual(['a'])
  })

  it('a callee that runs again from inside the fire opens a fresh window', () => {
    const calls: string[] = []
    const d = createDebouncer<[string]>((_cause, v) => {
      calls.push(v)
      if (v === 'first') d.run('second')
    }, 500)
    d.run('first')
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['first'])
    expect(d.pending()).toBe(true)
    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['first', 'second'])
  })
})
