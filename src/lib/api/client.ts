import type { TranslationKey } from '@/lib/i18n/core'

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

/**
 * A failed API call that remembers its status, so the UI can say WHY in the
 * homeowner's language. The server's `error` text is English (it's for logs
 * and devs); throw this and render `t(apiErrorKey(err, …))` instead of
 * `err.message` — hr-HR homeowners were seeing "Too many vision calls".
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * The i18n key to show for a failed call: the specific reason when the status
 * gives one, else the caller's own line. `byStatus` overrides per route — a
 * 429 from render-concept is the per-session render cap, not "slow down".
 */
export function apiErrorKey(
  err: unknown,
  fallback: TranslationKey,
  byStatus: Partial<Record<number, TranslationKey>> = {}
): TranslationKey {
  if (!(err instanceof ApiError)) return fallback
  const override = byStatus[err.status]
  if (override) return override
  if (err.status === 401 || err.code === 'auth_required') return 'api.error.session'
  if (err.status === 429) return 'api.error.tooMany'
  if (err.status === 413) return 'api.error.tooLarge'
  return fallback
}
