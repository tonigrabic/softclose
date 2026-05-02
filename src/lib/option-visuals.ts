/**
 * Inline SVG fallback illustrations for the standard option values used by
 * the intake. Used when an option doesn't carry an explicit `imageUrl`,
 * so the homeowner sees an evocative tile instead of a bare gradient.
 */
import { renderFloorPlanSvg } from '@/lib/floor-plan'

interface StyleTile {
  primary: string
  secondary: string
  accent: string
  hardware: 'pulls' | 'knobs' | 'handleless'
  worktopBand: string
}

const STYLE_TILES: Record<string, StyleTile> = {
  modern_minimal: {
    primary: '#f4f4f5',
    secondary: '#e4e4e7',
    accent: '#1f2937',
    hardware: 'handleless',
    worktopBand: '#9ca3af',
  },
  warm_shaker: {
    primary: '#fde9c8',
    secondary: '#f5d8a3',
    accent: '#78350f',
    hardware: 'knobs',
    worktopBand: '#a16207',
  },
  industrial: {
    primary: '#3f3f46',
    secondary: '#52525b',
    accent: '#fbbf24',
    hardware: 'pulls',
    worktopBand: '#a8a29e',
  },
  transitional: {
    primary: '#fafafa',
    secondary: '#d4d4d8',
    accent: '#52525b',
    hardware: 'pulls',
    worktopBand: '#737373',
  },
  bold_dark: {
    primary: '#1e293b',
    secondary: '#0f172a',
    accent: '#cbd5e1',
    hardware: 'pulls',
    worktopBand: '#e2e8f0',
  },
  natural_organic: {
    primary: '#d4eedc',
    secondary: '#bbe5c5',
    accent: '#365314',
    hardware: 'knobs',
    worktopBand: '#65a30d',
  },
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function hardwareMarks(theme: StyleTile, x: number): string {
  if (theme.hardware === 'pulls') {
    return `<rect x='${x + 18}' y='130' width='32' height='3' rx='1.5' fill='${theme.accent}' />`
  }
  if (theme.hardware === 'knobs') {
    return `<circle cx='${x + 34}' cy='132' r='3' fill='${theme.accent}' />`
  }
  return ''
}

function styleTile(key: string): string | null {
  const theme = STYLE_TILES[key]
  if (!theme) return null
  const doors = [12, 86, 160]
    .map(
      (x) =>
        `<rect x='${x}' y='90' width='68' height='80' rx='3' fill='${theme.primary}' stroke='${theme.accent}' stroke-opacity='0.35' stroke-width='1.5' />`
    )
    .join('')
  const hardware = [12, 86, 160].map((x) => hardwareMarks(theme, x)).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 180'>
<defs>
<linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'>
<stop offset='0' stop-color='${theme.secondary}' />
<stop offset='1' stop-color='${theme.primary}' />
</linearGradient>
</defs>
<rect width='240' height='180' fill='url(#bg)' />
<rect x='8' y='78' width='224' height='10' rx='1.5' fill='${theme.worktopBand}' opacity='0.9' />
${doors}
${hardware}
</svg>`
  return svgDataUrl(svg)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, '_')
}

function layoutTile(value: string): string | null {
  const shape = normalize(value)
  const KNOWN = ['galley', 'l_shape', 'u_shape', 'island', 'peninsula', 'open', 'unsure']
  if (!KNOWN.includes(shape)) return null
  const svg = renderFloorPlanSvg({
    layoutShape: shape,
    hasIsland: shape === 'island',
  })
  return svgDataUrl(svg)
}

/**
 * Try to produce a fallback illustration for an option value. Returns null
 * when we don't know how to draw it; callers should fall back to a gradient.
 */
export function getOptionFallbackImage(value: string): string | null {
  const key = normalize(value)
  return styleTile(key) ?? layoutTile(key)
}
