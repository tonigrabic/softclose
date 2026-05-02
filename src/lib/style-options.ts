import type { SelectOption } from '@/lib/types'
import { getOptionFallbackImage } from '@/lib/option-visuals'

/**
 * Canonical style directions the homeowner picks from. Mirrors the values the
 * AI was previously emitting in the chat-orchestrated flow, but now lives in
 * code so the inspiration step is fully deterministic.
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
  {
    value: 'natural_organic',
    label: 'Natural organic',
    description: 'Light wood, soft greens, hand-finished.',
    icon: 'leaf',
  },
].map((opt) => ({
  ...opt,
  imageUrl: getOptionFallbackImage(opt.value) ?? undefined,
}))

export const STYLE_LABELS: Record<string, string> = Object.fromEntries(
  STYLE_OPTIONS.map((s) => [s.value, s.label])
)
