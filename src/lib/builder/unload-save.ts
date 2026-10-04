/**
 * The builder's last change, kept across a reload or a closed tab (IMP-06).
 *
 * The local copy of the journey lives in IndexedDB, and an IndexedDB write
 * started while the page is being left never lands (lib/page-hide.ts). So a
 * pick, a group Continue or a paid re-render made in the last moment before a
 * reload — after the builder's autosave fired, before its IndexedDB write
 * finished, or inside the autosave window itself — came back as the build
 * from before it. The server copy does not rescue it: its unload write is a
 * plain fetch, and on a reload the local copy wins anyway.
 *
 * The guard closes that gap with the one write a leaving page does keep: a
 * synchronous localStorage record of the build the local copy does not hold
 * yet. It is small — image-free except for re-renders the local copy has no
 * pixels for (normally none, at most the one that just landed) — and it lives
 * only until an IndexedDB write that holds that build lands. On the next load
 * a record newer than the IndexedDB copy is merged over it: the picks and the
 * group from the record, the re-render pixels from either.
 *
 * Pure apart from the injected storage, so the node-only test harness can run
 * the whole pick → hide → reload path.
 */
import { OMITTED_IMAGE, stripImages } from '@/lib/project/checkpoint'
import type { ProjectSnapshot } from '@/lib/project/snapshot'
import type { StoredSnapshot } from '@/lib/session-store'
import { isBuilderScreenId, type BuilderScreenId, type BuilderState } from './inventory'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface PendingBuilderRecord {
  v: 1
  /** Epoch ms of the write — compared with the IndexedDB copy's savedAt. */
  savedAt: number
  builderState: BuilderState
  builderGroupId: BuilderScreenId
}

/** One key per project, like the IndexedDB copy, so two kitchens never mix. */
export function pendingBuilderKey(projectId?: string): string {
  return `softclose:builder-unsaved:${projectId ? `project:${projectId}` : 'anon'}`
}

const isPixels = (url: unknown): url is string => typeof url === 'string' && url.startsWith('data:image/')

/** Ids of the re-renders a build holds the pixels of. */
export function rerenderIdsWithPixels(state: unknown): Set<string> {
  const rerenders = (state as BuilderState | undefined)?.rerenders
  return new Set((Array.isArray(rerenders) ? rerenders : []).filter((r) => isPixels(r?.imageDataUrl)).map((r) => r.id))
}

/**
 * The record for `state`: image-free, except re-renders whose pixels are not
 * in the local copy yet (`localIds`) — a paid render must not come back as a
 * marker. `withPixels: false` drops those too (the storage quota fallback).
 */
export function composePendingRecord(
  state: BuilderState,
  groupId: BuilderScreenId,
  localIds: ReadonlySet<string>,
  savedAt: number,
  { withPixels = true }: { withPixels?: boolean } = {}
): PendingBuilderRecord {
  const stripped = stripImages(state)
  const rerenders = state.rerenders?.map((r, i) =>
    withPixels && isPixels(r.imageDataUrl) && !localIds.has(r.id) ? r : stripped.rerenders![i]
  )
  return { v: 1, savedAt, builderState: { ...stripped, rerenders }, builderGroupId: groupId }
}

/** A stored record, or null for anything missing, unreadable or foreign. */
export function parsePendingRecord(raw: string | null): PendingBuilderRecord | null {
  if (!raw) return null
  try {
    const rec = JSON.parse(raw) as Partial<PendingBuilderRecord> | null
    if (
      !rec ||
      rec.v !== 1 ||
      typeof rec.savedAt !== 'number' ||
      !Number.isFinite(rec.savedAt) ||
      !rec.builderState ||
      typeof rec.builderState !== 'object' ||
      !isBuilderScreenId(rec.builderGroupId)
    ) {
      return null
    }
    return rec as PendingBuilderRecord
  } catch {
    return null
  }
}

/**
 * The IndexedDB copy with a newer record merged over it: the record's build
 * and group, each marker re-render given back its pixels from the IndexedDB
 * copy (same id). A record no newer than the copy — the copy already holds
 * it, or more — changes nothing, and nor does a record with no copy to merge
 * into (there is no journey around it to restore).
 */
export function mergePendingRecord(
  stored: StoredSnapshot<ProjectSnapshot> | null,
  pending: PendingBuilderRecord | null
): { rec: StoredSnapshot<ProjectSnapshot> | null; merged: boolean } {
  if (!stored || !pending) return { rec: stored, merged: false }
  const storedAt = Date.parse(stored.savedAt)
  if (Number.isFinite(storedAt) && pending.savedAt <= storedAt) return { rec: stored, merged: false }

  const base = stored.data
  const pixels = new Map<string, string>()
  for (const r of (base.profile?.builderState as BuilderState | undefined)?.rerenders ?? []) {
    if (isPixels(r.imageDataUrl)) pixels.set(r.id, r.imageDataUrl)
  }
  const rerenders = pending.builderState.rerenders?.map((r) =>
    r.imageDataUrl === OMITTED_IMAGE && pixels.has(r.id) ? { ...r, imageDataUrl: pixels.get(r.id)! } : r
  )
  const builderState: BuilderState = { ...pending.builderState, ...(rerenders ? { rerenders } : {}) }
  return {
    rec: {
      ...stored,
      savedAt: new Date(pending.savedAt).toISOString(),
      data: { ...base, profile: { ...base.profile, builderState }, builderGroupId: pending.builderGroupId },
    },
    merged: true,
  }
}

export interface BuilderUnloadGuard {
  /**
   * A build the local copy does not hold yet — an autosave, a Continue out of
   * the builder, the escape hatch. Only the latest is kept.
   */
  track(state: BuilderState, groupId: BuilderScreenId): void
  /**
   * An IndexedDB write of `snapshot` landed. Clears the record once the
   * tracked build is in it — or at once with nothing tracked: the copy is
   * then newer than any record (a journey started over the resume offer).
   */
  landed(snapshot: Pick<ProjectSnapshot, 'profile' | 'builderGroupId'>): void
  /**
   * Synchronous: record the tracked build in storage. For the page-hide
   * handler and the builder's urgent flush; a no-op with nothing tracked, so
   * opening a restored build never writes.
   */
  writeNow(now?: number): void
  /**
   * Load time: the IndexedDB copy with a newer record merged in. The record
   * stays until an IndexedDB write lands; once the merged journey is actually
   * applied, `track` its build, so that write clears it — and a reload before
   * then still has it. (Not tracked here: the anonymous funnel only applies
   * it if the homeowner takes the resume offer.)
   */
  restore(stored: StoredSnapshot<ProjectSnapshot> | null): { rec: StoredSnapshot<ProjectSnapshot> | null; merged: boolean }
  /** Start over, or a discarded resume offer: forget the build and its record. */
  clear(): void
}

export function createBuilderUnloadGuard(storage: StorageLike | null, key: string): BuilderUnloadGuard {
  let tracked: { state: BuilderState; groupId: BuilderScreenId } | null = null
  // Re-renders the IndexedDB copy has the pixels of: the record can leave those out.
  let localIds: Set<string> = new Set()

  const remove = () => {
    try {
      storage?.removeItem(key)
    } catch {
      // Blocked storage: nothing was written there either.
    }
  }
  const put = (rec: PendingBuilderRecord): boolean => {
    try {
      storage?.setItem(key, JSON.stringify(rec))
      return true
    } catch {
      return false
    }
  }

  return {
    track(state, groupId) {
      tracked = { state, groupId }
    },
    landed(snapshot) {
      const state = snapshot.profile?.builderState
      localIds = rerenderIdsWithPixels(state)
      if (tracked && (state !== tracked.state || snapshot.builderGroupId !== tracked.groupId)) return
      tracked = null
      remove()
    },
    writeNow(now = Date.now()) {
      if (!storage || !tracked) return
      const { state, groupId } = tracked
      // Over the quota (a big render on a full origin): the picks and the group still matter most.
      if (!put(composePendingRecord(state, groupId, localIds, now))) {
        put(composePendingRecord(state, groupId, localIds, now, { withPixels: false }))
      }
    },
    restore(stored) {
      let pending: PendingBuilderRecord | null = null
      try {
        pending = parsePendingRecord(storage?.getItem(key) ?? null)
      } catch {
        pending = null
      }
      localIds = rerenderIdsWithPixels(stored?.data.profile?.builderState)
      const out = mergePendingRecord(stored, pending)
      // Older than the IndexedDB copy: that copy already holds it, or more.
      if (!out.merged && pending && stored) remove()
      return out
    },
    clear() {
      tracked = null
      remove()
    },
  }
}
