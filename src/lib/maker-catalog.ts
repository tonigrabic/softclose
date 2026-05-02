import type { MoodBoardItem } from '@/lib/types'

/**
 * Studio favorites — small, in-repo catalog so homeowners can pin from
 * the maker's curated set instead of random web images.
 *
 * `imageUrl` uses an inline SVG data URL so the demo has no external image
 * dependency. Replace these with real product CDN URLs in production.
 */
export interface CatalogItem extends Omit<MoodBoardItem, 'source' | 'id'> {
  id: string
  hue: number
  category: 'door' | 'worktop' | 'hardware' | 'lighting' | 'island'
}

function tile(label: string, hue: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
<defs>
<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
<stop offset='0' stop-color='hsl(${hue},32%,86%)'/>
<stop offset='1' stop-color='hsl(${hue},28%,58%)'/>
</linearGradient>
<pattern id='p' width='14' height='14' patternUnits='userSpaceOnUse'>
<rect width='14' height='14' fill='url(#g)'/>
<path d='M0 14 L14 0' stroke='hsl(${hue},25%,45%)' stroke-opacity='0.08'/>
</pattern>
</defs>
<rect width='400' height='300' fill='url(#p)'/>
<text x='200' y='162' text-anchor='middle' font-size='20' font-weight='600' font-family='system-ui,sans-serif' fill='hsl(${hue},38%,22%)'>${label}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const RAW: Omit<CatalogItem, 'imageUrl'>[] = [
  { id: 'door-shaker-soft-white', title: 'Shaker — Soft White', vendor: 'Studio range', vendorSku: 'D-SHK-001', category: 'door', hue: 35, tags: ['shaker', 'painted'] },
  { id: 'door-shaker-deep-green', title: 'Shaker — Deep Green', vendor: 'Studio range', vendorSku: 'D-SHK-014', category: 'door', hue: 150, tags: ['shaker', 'bold'] },
  { id: 'door-slab-walnut', title: 'Slab — Walnut Veneer', vendor: 'Studio range', vendorSku: 'D-SLB-022', category: 'door', hue: 25, tags: ['slab', 'wood'] },
  { id: 'door-slab-charcoal', title: 'Slab — Charcoal Matte', vendor: 'Studio range', vendorSku: 'D-SLB-031', category: 'door', hue: 220, tags: ['slab', 'dark'] },
  { id: 'wt-quartz-calacatta', title: 'Quartz — Calacatta', vendor: 'Stone partner', vendorSku: 'WT-QZ-101', category: 'worktop', hue: 200, tags: ['quartz', 'veined'] },
  { id: 'wt-quartzite-taj', title: 'Quartzite — Taj Mahal', vendor: 'Stone partner', vendorSku: 'WT-QT-204', category: 'worktop', hue: 50, tags: ['quartzite', 'warm'] },
  { id: 'wt-oak-butcher', title: 'Solid Oak — Butcher Edge', vendor: 'Workshop', vendorSku: 'WT-OAK-009', category: 'worktop', hue: 30, tags: ['wood'] },
  { id: 'hw-blum-soft', title: 'Blum Soft-Close Hinges', vendor: 'Blum', vendorSku: 'HW-BL-300', category: 'hardware', hue: 0, tags: ['premium', 'hinge'] },
  { id: 'hw-brass-pulls', title: 'Brushed Brass Pulls', vendor: 'Studio range', vendorSku: 'HW-BR-052', category: 'hardware', hue: 45, tags: ['brass', 'pulls'] },
  { id: 'lt-pendant-globe', title: 'Glass Globe Pendants', vendor: 'Lighting partner', vendorSku: 'LT-GL-012', category: 'lighting', hue: 200, tags: ['pendant'] },
  { id: 'is-marble-top', title: 'Island — Marble Waterfall', vendor: 'Studio range', vendorSku: 'IS-MB-007', category: 'island', hue: 210, tags: ['island', 'marble'] },
  { id: 'is-warm-oak', title: 'Island — Warm Oak Base', vendor: 'Studio range', vendorSku: 'IS-OK-010', category: 'island', hue: 32, tags: ['island', 'wood'] },
]

export const MAKER_CATALOG: CatalogItem[] = RAW.map((r) => ({
  ...r,
  imageUrl: tile(r.title ?? r.id, r.hue),
}))

export function catalogToMoodBoardItem(item: CatalogItem): MoodBoardItem {
  return {
    id: `cat-${item.id}-${Date.now()}`,
    source: 'catalog',
    imageUrl: item.imageUrl,
    title: item.title,
    vendor: item.vendor,
    vendorSku: item.vendorSku,
    tags: item.tags,
  }
}
