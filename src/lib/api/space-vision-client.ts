import { ApiError, readJson } from '@/lib/api/client'
import type { SpaceVisionResult } from '@/lib/types'

/**
 * Read the space photos as one room (`/api/space-vision`). One function for the
 * photo step's "Pročitaj" button and the room step's read-on-entry, so the two
 * can never send different payloads. Throws an `ApiError`; callers render it
 * through `apiErrorKey`.
 */
export async function requestSpaceVision(photos: string[], locale: string): Promise<SpaceVisionResult> {
  const res = await fetch('/api/space-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos, locale }),
  })
  const data = await readJson(res)
  if (!res.ok || data.error) {
    throw new ApiError(data.error ?? `Vision call failed (${res.status})`, res.status, data.code as string | undefined)
  }
  return data.result as SpaceVisionResult
}
