/**
 * Canned render for mock-AI mode. Reads the downscaled sample render from
 * /public and returns it as a REAL `data:image/jpeg;base64,…` URL — required
 * because downstream consumers (/api/builder-hypothesis, render iteration's
 * previousRenderImage) validate the `data:image/` prefix.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

let cachedDataUrl: string | null = null

export async function mockRenderDataUrl(): Promise<string> {
  if (cachedDataUrl) return cachedDataUrl
  const file = path.join(process.cwd(), 'public', 'sample-renders', 'mock-render-small.jpg')
  const buf = await readFile(file)
  cachedDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
  return cachedDataUrl
}
