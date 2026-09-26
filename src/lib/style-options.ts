import type { SelectOption } from '@/lib/types'
import { getOptionFallbackImage } from '@/lib/option-visuals'

/**
 * Canonical style directions the homeowner picks from. Mirrors the values the
 * AI was previously emitting in the chat-orchestrated flow, but now lives in
 * code so the inspiration step is fully deterministic. `label` is the English
 * fallback; the UI shows the `style.<value>` translation.
 */
export const STYLE_OPTIONS: SelectOption[] = [
  {
    value: 'modern_minimal',
    label: 'Modern minimal',
    description: 'Handleless slab cabinets, calm neutrals.',
    icon: 'sparkles',
  },
  {
    value: 'warm_shaker',
    label: 'Warm shaker',
    description: 'Painted shaker doors, brushed brass.',
    icon: 'leaf',
  },
  {
    value: 'industrial',
    label: 'Industrial',
    description: 'Dark cabinets, brick or steel accents.',
    icon: 'flame',
  },
  {
    value: 'transitional',
    label: 'Transitional',
    description: 'Soft neutrals, balance of new and classic.',
    icon: 'palette',
  },
  {
    value: 'bold_dark',
    label: 'Bold + dark',
    description: 'Deep navy or charcoal, contrasting hardware.',
    icon: 'gem',
  },
  // Shown as "Rustic" since maker testing (2026-09-23). The value stays
  // `natural_organic` so saved journeys and the render prompt keep matching.
  {
    value: 'natural_organic',
    label: 'Rustic',
    description: 'Solid wood with visible grain, warm earthy tones.',
    icon: 'leaf',
  },
].map((opt) => ({
  ...opt,
  imageUrl: getOptionFallbackImage(opt.value) ?? undefined,
}))

export const STYLE_LABELS: Record<string, string> = Object.fromEntries(
  STYLE_OPTIONS.map((s) => [s.value, s.label])
)
