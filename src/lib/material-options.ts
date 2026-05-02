import type { SelectOption } from '@/lib/types'

/**
 * Canonical option sets for the "Confirm the look" step. Values match the
 * enum values returned by /api/inspiration-vision so prefills land cleanly.
 */

export const DOOR_MATERIAL_OPTIONS: SelectOption[] = [
  { value: 'shaker', label: 'Shaker', description: 'Painted, classic profile.', icon: 'palette' },
  { value: 'slab', label: 'Slab', description: 'Flat, modern, handleless-friendly.', icon: 'sparkles' },
  { value: 'beaded_inset', label: 'Beaded inset', description: 'Traditional, detailed framing.', icon: 'leaf' },
  { value: 'glass_front', label: 'Glass front', description: 'For uppers / display cabs.', icon: 'gem' },
  { value: 'mixed', label: 'Mixed', description: 'A blend across cabinets.', icon: 'star' },
]

export const WORKTOP_OPTIONS: SelectOption[] = [
  { value: 'quartz', label: 'Quartz (engineered)', description: 'Veined or solid; durable.', icon: 'sparkles' },
  { value: 'marble', label: 'Marble', description: 'Soft, characterful, needs care.', icon: 'gem' },
  { value: 'quartzite', label: 'Quartzite', description: 'Natural stone, harder than marble.', icon: 'gem' },
  { value: 'granite', label: 'Granite', description: 'Tough, traditional.', icon: 'gem' },
  { value: 'butcher_block', label: 'Butcher block', description: 'Solid timber.', icon: 'leaf' },
  { value: 'concrete', label: 'Concrete', description: 'Industrial finish.', icon: 'flame' },
  { value: 'stainless', label: 'Stainless', description: 'Pro-kitchen feel.', icon: 'wrench' },
  { value: 'soapstone', label: 'Soapstone', description: 'Soft, dark, patinas over time.', icon: 'gem' },
]

export const BACKSPLASH_OPTIONS: SelectOption[] = [
  { value: 'subway_tile', label: 'Subway tile', description: 'Classic 3×6 or 2×8.', icon: 'grid' },
  { value: 'zellige', label: 'Zellige', description: 'Hand-glazed Moroccan tile.', icon: 'palette' },
  { value: 'mosaic', label: 'Mosaic', description: 'Small-format pattern.', icon: 'grid' },
  { value: 'slab_match', label: 'Slab match', description: 'Same stone as worktop, full height.', icon: 'gem' },
  { value: 'painted', label: 'Painted wall', description: 'No tile — paint behind.', icon: 'palette' },
  { value: 'none', label: 'None', description: 'Open shelving / no backsplash.', icon: 'leaf' },
]

export const HARDWARE_OPTIONS: SelectOption[] = [
  { value: 'warm_brass', label: 'Warm brass', description: 'Classic, warm undertone.', icon: 'gem' },
  { value: 'brushed_nickel', label: 'Brushed nickel', description: 'Cool, soft.', icon: 'sparkles' },
  { value: 'matte_black', label: 'Matte black', description: 'High contrast, modern.', icon: 'flame' },
  { value: 'mixed', label: 'Mixed metals', description: 'A considered blend.', icon: 'palette' },
  { value: 'none_visible', label: 'No visible hardware', description: 'Push-to-open / handleless.', icon: 'sparkles' },
]
