/**
 * Deprecated. The intake flow no longer uses an AI orchestrator.
 *
 * The deterministic state machine (src/lib/flow.ts) drives the UI directly
 * and calls focused AI endpoints when needed:
 *  - /api/space-vision         → extract layout + style hints from space photos
 *  - /api/inspiration-vision   → extract style/material guesses from inspiration
 *  - /api/render-concept       → img2img concept render
 *  - /api/match-reference      → match a reference image to the studio catalog
 *  - /api/translate-wishlist   → free text → TranslatedField[]
 *  - /api/summarize-brief      → final wrap-up summary lines
 *
 * This route is kept only so any in-flight clients get a clean 410 instead of
 * a 404 or a stack trace. Remove once nothing references it.
 */
export async function POST() {
  return Response.json(
    {
      error:
        'The /api/chat orchestrator has been removed. The intake flow now runs as a deterministic state machine on the client; AI calls go to focused endpoints instead.',
    },
    { status: 410 }
  )
}
