'use client'

import { useEffect, useState } from 'react'
import {
  createCheckpointClient,
  type CheckpointClient,
  type CheckpointState,
} from '@/lib/project/checkpoint-client'

export type { CheckpointState }

export interface CheckpointApi {
  /** Stable for the component's life, so it is a safe effect dependency. */
  queue: CheckpointClient['queue']
  /** Stable for the component's life. See CheckpointClient['flush']. */
  flush: CheckpointClient['flush']
  /** Stable for the component's life. See CheckpointClient['submitting']. */
  submitting: CheckpointClient['submitting']
  state: CheckpointState
}

const disabledQueue: CheckpointClient['queue'] = () => {}
const disabledFlush: CheckpointClient['flush'] = async () => false
const disabledSubmitting: CheckpointClient['submitting'] = () => null

/**
 * Mirror the journey to the server, alongside the existing IndexedDB save.
 *
 * Thin glue over `createCheckpointClient` (lib/project/checkpoint-client.ts),
 * which holds the timers, the fetch and the backoff and is what the tests
 * drive. The client is created once — the project, its starting revision and
 * fingerprint belong to the page — so `queue` and `flush` never change
 * identity: an effect that depends on them runs when its snapshot changes,
 * not on every render (a per-render re-queue re-armed the idle timer on each
 * 'saving'/'pending' render and turned a 429 into a POST every few seconds).
 */
export function useProjectCheckpoint(opts: {
  projectId?: string
  initialRevision?: number
  /**
   * Fingerprint of what the server already holds (`snapshotFingerprint` of
   * the stripped initial snapshot). Seeds the "nothing changed" check, so a
   * visit that changes nothing writes nothing — every write moves
   * `updated_at`, and that is the maker's "changed since the brief" signal.
   */
  initialFingerprint?: string | null
}): CheckpointApi {
  const [state, setState] = useState<CheckpointState>(opts.projectId ? 'idle' : 'disabled')
  const [client] = useState(() =>
    opts.projectId
      ? createCheckpointClient({
          projectId: opts.projectId,
          initialRevision: opts.initialRevision,
          initialFingerprint: opts.initialFingerprint,
          onState: setState,
        })
      : null
  )

  // Flush when the tab is hidden — a phone going to sleep, a tab switch.
  // Deliberately not `pagehide` + `keepalive`: keepalive caps the body at 64 KB
  // and a real snapshot is bigger, so it would silently drop the save. (On a
  // reload or a closed tab this fetch rarely lands; the local copy and the
  // builder's unload record cover those.)
  useEffect(() => {
    if (!client) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') client.hide()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      client.dispose()
    }
  }, [client])

  return {
    queue: client?.queue ?? disabledQueue,
    flush: client?.flush ?? disabledFlush,
    submitting: client?.submitting ?? disabledSubmitting,
    state,
  }
}
