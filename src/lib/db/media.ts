/**
 * Media offload: base64 data URLs inside a brief → Supabase Storage objects.
 *
 * Why: a persisted brief carried every photo and render inline (10.9 MB before
 * client-side compression, ~1.3 MB after). Postgres rows are the wrong home
 * for images: slow to query, expensive to list, impossible to CDN. Objects go
 * to the private bucket `softclose-media`; the row keeps `storage://` refs;
 * the maker page swaps them for short-lived signed URLs at render time.
 *
 * Pure deep-walk + injectable uploader/signer so the transform is unit-testable
 * without a network.
 */
import { supabaseAdmin } from './supabase'

export const MEDIA_BUCKET = 'softclose-media'
const REF_PREFIX = `storage://${MEDIA_BUCKET}/`

export type Uploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<void>
export type Signer = (paths: string[]) => Promise<Record<string, string>>

function parseDataUrl(s: string): { contentType: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(s)
  if (!m) return null
  return { contentType: m[1].toLowerCase(), bytes: new Uint8Array(Buffer.from(m[2], 'base64')) }
}

function extFor(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Replace every `data:image/...` string under `value` with a `storage://` ref,
 * uploading each once (identical strings share one object).
 */
export async function offloadMedia<T>(
  value: T,
  prefix: string,
  upload: Uploader
): Promise<{ value: T; count: number; bytes: number }> {
  const seen = new Map<string, string>()
  let count = 0
  let bytes = 0
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string') {
      if (!v.startsWith('data:image/')) return v
      const cached = seen.get(v)
      if (cached) return cached
      const parsed = parseDataUrl(v)
      if (!parsed) return v
      count += 1
      bytes += parsed.bytes.byteLength
      const path = `${prefix}/${String(count).padStart(3, '0')}.${extFor(parsed.contentType)}`
      await upload(path, parsed.bytes, parsed.contentType)
      const ref = `${REF_PREFIX}${path}`
      seen.set(v, ref)
      return ref
    }
    if (Array.isArray(v)) {
      const out: unknown[] = []
      for (const item of v) out.push(await walk(item))
      return out
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = await walk(item)
      return out
    }
    return v
  }
  return { value: (await walk(value)) as T, count, bytes }
}

/** Collect every `storage://` ref under `value`. */
export function collectMediaRefs(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith(REF_PREFIX)) out.add(value.slice(REF_PREFIX.length))
  } else if (Array.isArray(value)) {
    for (const v of value) collectMediaRefs(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectMediaRefs(v, out)
  }
  return out
}

/** Replace every `storage://` ref with the URL the signer returns for it. */
export async function resolveMedia<T>(value: T, sign: Signer): Promise<T> {
  const paths = [...collectMediaRefs(value)]
  if (paths.length === 0) return value
  const urls = await sign(paths)
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (!v.startsWith(REF_PREFIX)) return v
      return urls[v.slice(REF_PREFIX.length)] ?? v
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) out[k] = walk(item)
      return out
    }
    return v
  }
  return walk(value) as T
}

/* ── Supabase-backed uploader / signer (server only) ─────────────────────── */

export function storageUploader(): Uploader | null {
  const db = supabaseAdmin()
  if (!db) return null
  return async (path, bytes, contentType) => {
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType, upsert: true })
    if (error) throw error
  }
}

export function storageSigner(ttlSeconds = 60 * 60): Signer | null {
  const db = supabaseAdmin()
  if (!db) return null
  return async (paths) => {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, ttlSeconds)
    if (error || !data) return {}
    const out: Record<string, string> = {}
    for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
    return out
  }
}
