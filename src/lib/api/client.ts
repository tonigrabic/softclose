/**
 * Parse an API response without ever throwing a JSON error at the homeowner.
 *
 * Production 2026-09-19: Vercel answered a too-large request with the plain
 * text "Request Entity Too Large" and the UI showed
 * `Unexpected token 'R', "Request En"... is not valid JSON`. Any non-JSON body
 * now becomes a calm `{ error }` that the existing error paths already render.
 */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    const error =
      res.status === 413
        ? 'That upload is too large to send. Please try a smaller photo.'
        : res.ok
          ? 'Unexpected reply from the server. Please try again.'
          : `The server could not process this (${res.status}). Please try again.`
    return { error } as T & { error?: string }
  }
}
