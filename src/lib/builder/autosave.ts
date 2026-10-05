/**
 * Builder autosave rules (IMP-06) — pure, so the node-only test harness can
 * reach them; BuilderShell is thin glue over these and `useDebouncedCallback`.
 *
 * The build used to leave BuilderShell only on the last Continue or the
 * escape hatch, so a reload anywhere in the eight groups lost every pick and
 * every paid re-render. Now every real change is handed to the intake, which
 * patches `profile.builderState` (and the current group) into the snapshot the
 * IndexedDB copy and the server checkpoint already carry.
 *
 * What must NOT save is as important as what must: the maker's "changed since
 * you got the brief" flag is `updated_at > brief.created_at`, so a save on
 * mount — a resume, the maker looking in — would invent customer activity.
 */
import { snapshotFingerprint, OMITTED_IMAGE } from '@/lib/project/checkpoint'
import { isBuilderScreenId, type BuilderScreenId, type BuilderState } from './inventory'

/** Long enough that a run of chip taps is one save, short enough that a reload rarely beats it. */
export const BUILDER_AUTOSAVE_MS = 500

/**
 * A save-worthy change: every pick, the render list and the group — not the
 * timestamp the reducer stamps on every action, and not the re-render pixels
 * (a re-render is a new id; its image never changes after it lands).
 */
export function builderSaveKey(state: BuilderState, groupId: BuilderScreenId): string {
  return snapshotFingerprint({
    ...state,
    lastUpdatedAt: undefined,
    rerenders: state.rerenders?.map((r) => ({ id: r.id, trigger: r.trigger })),
    groupId,
  })
}

/**
 * The first key seeds the gate and is never saved: the mount value is what is
 * stored (or the relock of it, which re-derives the same units and stamps a
 * new `lastUpdatedAt` on every resume). After that only a key different from
 * the last one passes — re-tapping the chip already picked, or confirming a
 * group that is already confirmed, saves nothing.
 */
export function createSaveGate(): (key: string) => boolean {
  let last: string | null = null
  return (key) => {
    if (last === null) {
      last = key
      return false
    }
    if (key === last) return false
    last = key
    return true
  }
}

/**
 * Re-renders that can be shown. A build restored from the server copy (a
 * second device, the maker's read-only view) carries `omitted://image` markers
 * where the pixels were — checkpoints are image-free — so those are hidden and
 * the preview falls back to the Original.
 */
export function visibleRerenders(state: BuilderState): NonNullable<BuilderState['rerenders']> {
  return (state.rerenders ?? []).filter((r) => Boolean(r.imageDataUrl) && r.imageDataUrl !== OMITTED_IMAGE)
}

/** The group a resumed builder opens at: the stored one, or the first group for anything else. */
export function resumeBuilderGroup(saved: unknown): BuilderScreenId {
  return isBuilderScreenId(saved) ? saved : 'cabinetBoxes'
}
