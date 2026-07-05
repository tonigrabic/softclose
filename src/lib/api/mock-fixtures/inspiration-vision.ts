/** Canned inspiration read for mock-AI mode. */
import type { InspirationVisionResult } from '@/app/api/inspiration-vision/route'

export const MOCK_INSPIRATION: InspirationVisionResult = {
  styleGuess: 'modern_minimal',
  doorMaterialGuess: 'slab',
  worktopGuess: 'quartz',
  backsplashGuess: 'slab_match',
  hardwareTierGuess: 'matte_black',
  styleHints: ['handleless fronts', 'warm wood accents'],
  materialHints: ['matte dark green', 'oak open shelving'],
  paletteHints: ['deep green', 'warm oak', 'brushed brass'],
  summary: 'Modern minimal direction — matte handleless fronts with warm wood accents.',
}
