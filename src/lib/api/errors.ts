/**
 * One place to turn a provider/model failure into a homeowner-safe response.
 *
 * Seen in production 2026-09-19: the render step showed the raw OpenAI text
 * "Incorrect API key provided: ''…" to the homeowner. Provider messages leak
 * infra detail and read as broken. Log the full error server-side (Vercel
 * function logs), return a calm generic message the UI can show as-is or map.
 */
export function providerFailure(route: string, err: unknown, fallback: string): { error: string } {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  console.error(`[${route}] provider call failed —`, detail)
  return { error: fallback }
}

/** Generic copy — routes pass their own when a more specific calm line exists. */
export const AI_UNAVAILABLE = 'The AI service could not process this right now. Please try again in a moment.'

/**
 * Signed-out answer for a route handler.
 *
 * A route must never `redirect()` to the login page: the intake calls these
 * with fetch(), and readJson() would hand the HTML login page to the UI as an
 * error string. A 401 the client can recognise beats a page it cannot parse.
 */
export const AUTH_REQUIRED = 'Your session has expired. Sign in again to continue.'

export function unauthorized(): Response {
  return Response.json({ error: AUTH_REQUIRED, code: 'auth_required' }, { status: 401 })
}
