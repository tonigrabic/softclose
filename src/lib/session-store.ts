/**
 * Local session persistence — the homeowner's whole in-progress journey,
 * saved in the browser so a reload / accidental tab close does not wipe it.
 *
 * IndexedDB, not localStorage: photos and renders are base64 data URLs, a few
 * MB each, and localStorage's ~5 MB cap would silently drop the snapshot.
 * Every call is try/catch'd — private windows, blocked storage and Safari
 * quirks must degrade to "no resume offer", never to an error the homeowner
 * sees. Server-side sessions (cross-device resume) are a separate follow-up;
 * this covers the P0 anxiety case: "I refreshed and lost everything".
 */

const DB_NAME = 'softclose'
const STORE = 'session'
export const SNAPSHOT_VERSION = 1

/**
 * One key per project, so two kitchens on one browser cannot overwrite each
 * other — and, more seriously, so a shared machine cannot offer customer B the
 * journey (photos included) that customer A left behind. `anon` is the old
 * unauthenticated funnel, whose behaviour is unchanged.
 */
function keyFor(projectId?: string): string {
  return projectId ? `project:${projectId}` : 'anon'
}

export interface StoredSnapshot<T> {
  version: number
  savedAt: string
  data: T
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveSnapshot<T>(data: T, projectId?: string): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const rec: StoredSnapshot<T> = { version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data }
      tx.objectStore(STORE).put(rec, keyFor(projectId))
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export async function loadSnapshot<T>(projectId?: string): Promise<StoredSnapshot<T> | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyFor(projectId))
      req.onsuccess = () => {
        const rec = req.result as StoredSnapshot<T> | undefined
        resolve(rec && rec.version === SNAPSHOT_VERSION ? rec : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function clearSnapshot(projectId?: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(keyFor(projectId))
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
