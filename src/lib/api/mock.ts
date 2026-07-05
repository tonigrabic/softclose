/**
 * Mock-AI mode — run the whole Part-1 funnel with zero AI spend.
 *
 * Server-side seam: each AI route returns a canned fixture (see
 * `src/lib/api/mock-fixtures/`) when `MOCK_AI=1`, BEFORE rate limiting, so the
 * client, error handling, caps UI and persistence all exercise production code
 * paths against instant, free responses. `/api/handoff` makes no AI call and
 * needs no mock.
 *
 * Toggle: `npm run dev:mock` (sets MOCK_AI for the routes and
 * NEXT_PUBLIC_MOCK_AI for the client badge). Never active in production.
 */
export function mockAiEnabled(): boolean {
  return process.env.MOCK_AI === '1' && process.env.NODE_ENV !== 'production'
}

/** Small artificial latency so loading states stay visible/testable. */
export function mockDelay(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
