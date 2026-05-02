export const DESIGNER_NAME = 'Sarah'
export const STUDIO_NAME = 'Sarah Chen Kitchens'

/**
 * Legacy AI-orchestration prompt used by the now-deprecated /api/chat route.
 *
 * The intake flow has moved to a deterministic state machine (see
 * src/lib/flow.ts) where the AI is invoked at three focused moments instead
 * of as the master orchestrator: vision (space + inspiration), img2img
 * render, wishlist translation, and final brief summary.
 *
 * This stub is kept only to avoid breaking the /api/chat import while we
 * remove that route. Once /api/chat is gone, delete this function too.
 */
export function buildSystemPrompt(): string {
  return `You are a friendly assistant gathering project info on behalf of ${DESIGNER_NAME}, a kitchen designer at ${STUDIO_NAME}. The deterministic intake flow now drives the conversation; this prompt is unused.`
}
