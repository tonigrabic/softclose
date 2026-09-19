/**
 * Client-side image compression for everything we ship to the API routes.
 *
 * Why: Vercel rejects function request bodies over 4.5 MB with a bare-text 413.
 * A phone photo (1–5 MB) and a 1024² PNG render (≈2 MB) as base64 blow past
 * that together — production 2026-09-19: /api/builder-hypothesis → 413, and
 * the final /api/handoff (whole profile with every image) would have too.
 * Vision models also need nowhere near full resolution.
 *
 * Re-encodes to JPEG at ≤ maxDim on the long edge. Fails soft: any error
 * returns the original data URL so the flow never breaks on an odd file.
 */
export interface CompressOptions {
  /** Long-edge cap in px. 1280 keeps kitchen detail legible for vision + render anchoring. */
  maxDim?: number
  /** JPEG quality 0–1. */
  quality?: number
}

export async function compressImageDataUrl(dataUrl: string, opts: CompressOptions = {}): Promise<string> {
  const { maxDim = 1280, quality = 0.82 } = opts
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) return dataUrl
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    // Skip when already small AND already JPEG — nothing to gain.
    if (scale === 1 && dataUrl.startsWith('data:image/jpeg') && approxBytes(dataUrl) < 600 * 1024) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    // Flatten transparency (PNG renders) onto white before JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const out = canvas.toDataURL('image/jpeg', quality)
    // Never return something bigger than what we started with.
    return approxBytes(out) < approxBytes(dataUrl) ? out : dataUrl
  } catch {
    return dataUrl
  }
}

/** Read a File as a compressed JPEG data URL (upload path). */
export async function fileToCompressedDataUrl(file: File, opts?: CompressOptions): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  return compressImageDataUrl(raw, opts)
}

export function approxBytes(dataUrl: string): number {
  const b64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((b64.length * 3) / 4)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}
