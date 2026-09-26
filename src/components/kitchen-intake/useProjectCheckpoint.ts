'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyConflict,
  MAX_CHECKPOINT_BYTES,
  nextBackoffMs,
  snapshotFingerprint,
  stripImages,
} from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'

export type CheckpointState = 'idle' | 'saving' | 'saved' | 'pending' | 'conflict' | 'error' | 'disabled'

/** Idle debounce. Long enough that dragging a slider is one write, short enough
 *  that a customer who wanders off has lost at most a few seconds of work. */
const IDLE_MS = 2_500
/** …but never hold a write longer than this, so continuous fiddling in the
 *  builder still reaches the server. */
const MAX_WAIT_MS = 15_000
/** A flush holds up a submit at most this long; the submit never waits on a slow save. */
const FLUSH_TIMEOUT_MS = 4_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface CheckpointApi {
  queue: (snapshot: ProjectSnapshot, opts?: { immediate?: boolean }) => void
  /** Write `snapshot` now and resolve once it has landed (or failed, or timed out). */
  flush: (snapshot: ProjectSnapshot) => Promise<void>
  state: CheckpointState
}

/**
 * Mirror the journey to the server, alongside the existing IndexedDB save.
 *
 * Thin on purpose: every decision it makes — what to strip, whether anything
 * changed, how long to back off, whether a 409 is really a conflict — lives in
 * `lib/project/checkpoint.ts`, which the test suite can reach. This file is the
 * timers and the fetch.
 *
 * It must never interrupt the homeowner. Every failure is swallowed into a
 * state the save indicator can show quietly; IndexedDB still has their work.
 */
export function useProjectCheckpoint(opts: { projectId?: string; initialRevision?: number }): CheckpointApi {
  const { projectId } = opts
  const [state, setState] = useState<CheckpointState>(projectId ? 'idle' : 'disabled')
  const revision = useRef(opts.initialRevision ?? 0)

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const pendingSnapshot = useRef<ProjectSnapshot | null>(null)
  const lastSentFingerprint = useRef<string | null>(null)
  const attempt = useRef(0)
  // Set once a conflict is confirmed: we stop writing rather than race another
  // device. There is no defensible automatic merge of conceptRenders or
  // builderState, and last-writer-wins would let a phone erase an hour of work.
  const halted = useRef(false)

  const clearTimers = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (maxTimer.current) clearTimeout(maxTimer.current)
    idleTimer.current = null
    maxTimer.current = null
  }

  // `send` needs to reschedule itself on failure, so it is held in a ref rather
  // than closing over itself — and the ref is what the retry timer calls, so a
  // re-render never leaves a stale copy running.
  const sendRef = useRef<() => Promise<void>>(async () => {})

  const send = useCallback(async () => {
    if (!projectId || halted.current) return
    const snapshot = pendingSnapshot.current
    if (!snapshot || inFlight.current) return

    const payload = stripImages(snapshot)
    const fingerprint = snapshotFingerprint(payload)
    if (fingerprint === lastSentFingerprint.current) {
      // Nothing actually changed. Skipping is not just thrift: the maker's
      // "changed since submit" flag is `updated_at > brief.created_at`, so a
      // no-op write would fabricate customer activity that never happened.
      pendingSnapshot.current = null
      return
    }

    const body = JSON.stringify({
      baseRevision: revision.current,
      step: snapshot.currentStepId,
      snapshot: payload,
    })
    if (body.length > MAX_CHECKPOINT_BYTES) {
      console.error('[checkpoint] refusing to send an oversized snapshot', body.length)
      setState('error')
      pendingSnapshot.current = null
      return
    }

    inFlight.current = true
    setState('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        revision?: number
        reason?: string
        serverFingerprint?: string | null
      }

      if (res.ok && data.ok) {
        revision.current = data.revision ?? revision.current + 1
        lastSentFingerprint.current = fingerprint
        attempt.current = 0
        pendingSnapshot.current = null
        setState('saved')
        return
      }

      if (res.status === 409 && data.reason === 'conflict') {
        const { alreadyApplied } = classifyConflict(fingerprint, data.serverFingerprint ?? null)
        if (alreadyApplied) {
          // Our own earlier write won — a StrictMode double-mount, or a retry
          // after a timeout that actually landed. Adopt the revision, carry on.
          revision.current = data.revision ?? revision.current
          lastSentFingerprint.current = fingerprint
          pendingSnapshot.current = null
          setState('saved')
          return
        }
        // A genuinely different device is editing this project. Stop writing
        // rather than race: there is no defensible automatic merge of
        // conceptRenders or builderState, and last-writer-wins would let a
        // phone tab erase an hour of laptop work. IndexedDB still holds ours.
        halted.current = true
        setState('conflict')
        return
      }

      if (res.status === 503 || data.reason === 'no_db') {
        // No database configured — the anonymous local-only behaviour. Silent.
        halted.current = true
        setState('disabled')
        return
      }

      // Any other 4xx is permanent: not our project, session gone, a payload
      // the server will never accept. Retrying it just burns requests on a
      // backoff forever, which is exactly what a 404 did the first time this
      // ran. Stop and let the local copy stand.
      if (res.status >= 400 && res.status < 500) {
        console.error('[checkpoint] refused:', res.status, data.reason)
        halted.current = true
        setState('error')
        return
      }

      throw new Error(data.reason ?? `checkpoint ${res.status}`)
    } catch {
      attempt.current += 1
      setState('pending')
      const wait = nextBackoffMs(attempt.current - 1)
      inFlight.current = false
      setTimeout(() => void sendRef.current(), wait)
      return
    } finally {
      inFlight.current = false
    }
  }, [projectId])

  useEffect(() => {
    sendRef.current = send
  }, [send])

  const queue = useCallback(
    (snapshot: ProjectSnapshot, queueOpts?: { immediate?: boolean }) => {
      if (!projectId || halted.current) return
      pendingSnapshot.current = snapshot
      clearTimers()
      if (queueOpts?.immediate) {
        void send()
        return
      }
      idleTimer.current = setTimeout(() => void send(), IDLE_MS)
      maxTimer.current = setTimeout(() => void send(), MAX_WAIT_MS)
    },
    [projectId, send]
  )

  // Submitting the brief must be the project's LAST write. The maker's "changed
  // since submit" flag is `updated_at > brief.created_at`, and the submit itself
  // changes the snapshot (isDone, wrapUpData) — left to the idle timer, that save
  // lands a few seconds after the brief and flags every fresh brief as edited.
  // Flushed first, the same snapshot queued afterwards is a fingerprint no-op.
  // A save that fails or stalls must not block the submit: it degrades to the
  // old behaviour (a false "changed"), never to a lost brief.
  const flush = useCallback(
    async (snapshot: ProjectSnapshot) => {
      if (!projectId || halted.current) return
      const write = (async () => {
        // A save already on the wire finishes first, so ours is the one that lands last.
        while (inFlight.current) await sleep(50)
        pendingSnapshot.current = snapshot
        clearTimers()
        await send()
      })()
      await Promise.race([write, sleep(FLUSH_TIMEOUT_MS)])
    },
    [projectId, send]
  )

  // Flush when the tab is hidden — a closing tab, a phone going to sleep.
  // Deliberately not `pagehide` + `keepalive`: keepalive caps the body at 64 KB
  // and a real snapshot is bigger, so it would silently drop the save.
  useEffect(() => {
    if (!projectId) return
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pendingSnapshot.current) {
        clearTimers()
        void send()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [projectId, send])

  useEffect(() => clearTimers, [])

  return { queue, flush, state }
}
