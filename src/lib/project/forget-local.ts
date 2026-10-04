/**
 * The copies of a journey this browser keeps, forgotten when the homeowner
 * deletes their kitchen (IMP-09): the IndexedDB snapshot (photos and renders
 * included) and the builder's unload record in localStorage.
 *
 * Client-safe and best-effort — private windows and blocked storage must not
 * stand between someone and deleting their kitchen.
 */
import { pendingBuilderKey } from '@/lib/builder/unload-save'
import { clearSnapshot } from '@/lib/session-store'

export async function forgetLocalJourney(projectId: string): Promise<void> {
  try {
    await clearSnapshot(projectId)
  } catch {
    /* clearSnapshot already swallows; belt and braces */
  }
  try {
    localStorage.removeItem(pendingBuilderKey(projectId))
  } catch {
    /* no localStorage (private window, blocked storage) — nothing to forget */
  }
}
