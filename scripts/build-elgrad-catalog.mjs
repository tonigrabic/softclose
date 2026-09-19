#!/usr/bin/env node
/**
 * softclose_products (Supabase) → src/lib/catalog/elgrad-products.json
 *
 * Turns the scraped Elgrad webshop rows (real retail prices, incl. VAT) into a
 * pickable supplier catalog classified into the builder's kinds/types with
 * Croatian keyword rules. Also emits per-type price bands (p20–p80) so the
 * estimate's UNPICKED appliance/hardware ranges are grounded in real prices
 * instead of hand-set reference RRPs.
 *
 *   node scripts/build-elgrad-catalog.mjs            # write JSON
 *   DRY_RUN=1 node scripts/build-elgrad-catalog.mjs  # print classification only
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'src/lib/catalog/elgrad-products.json')
for (const line of existsSync(resolve(ROOT, '.env.local')) ? readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const DRY = process.env.DRY_RUN === '1'

/** First matching rule wins. Keys are the builder's vocabulary. */
const APPLIANCE_RULES = [
  ['dishwasher', ['perilica posuđa', 'perilica posud', 'perilic']],
  ['hob', ['ploča za kuhanje', 'ploca za kuhanje', 'indukcij', 'staklokeram', 'plinska ploča', 'kuhališt']],
  ['oven', ['pećnic', 'pecnic']],
  ['extractor', ['napa', 'nape ', 'odsis']],
  ['fridge', ['hladnjak', 'hladnj', 'frižid', 'zamrziva']],
  ['microwave', ['mikrovaln']],
  ['wine_fridge', ['vinsk']],
  ['coffee', ['kav']],
  ['sink', ['sudoper']],
    ['tap', ['slavin', 'mješalic', 'mjesalic', 'pipa', 'armatur']],
]
const HARDWARE_RULES = [
  ['drawer_system', ['ladic', 'vodilic', 'izvlak', 'tandembox', 'legrabox', 'nova pro', 'atira', 'actro', 'quadro']],
  ['hinge', ['šarnir', 'sarnir', 'spojnic', 'panta']],
  ['lift_system', ['podizn', 'aventos', 'lift', 'podizač', 'kinvaro', 'free fold', 'free flap']],
  ['handle', ['ručk', 'ručic', 'rucka', 'rucic', 'gumb', 'profil za ručk', 'gola profil']],
  ['lighting', ['led', 'rasvjet', 'svjetil', 'svjetlo', 'napajan', 'transformator']],
  ['organiser', ['košar', 'kosar', 'organiz', 'pribor', 'uložak', 'ulozak', 'separator', 'držač tanjur', 'sušil']],
  ['plinth_leg', ['nog', 'sokl', 'nožic', 'kotač']],
  ['waste', ['otpad', 'smeć', 'smec', 'koš za']],
  ['connector', ['spojni', 'ekscent', 'vijak', 'vijci', 'tipl', 'moždan', 'konektor']],
]
function classify(name, rules, fallback) {
  const n = name.toLowerCase()
  for (const [type, kws] of rules) if (kws.some((k) => n.includes(k))) return type
  return fallback
}
function percentile(sorted, p) {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]
}

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('softclose_products')
      .select('sku,name,brand,category,unit,price_eur,url,image_url,last_seen_at')
      .eq('supplier', 'elgrad')
      .not('price_eur', 'is', null)
      .order('sku')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  console.log(`> ${rows.length} priced Elgrad rows`)

  const products = rows.map((r) => {
    const isAppliance = r.category === 'kucanski-uredaji'
    const type = isAppliance ? classify(r.name, APPLIANCE_RULES, 'other') : classify(r.name, HARDWARE_RULES, 'other')
    const kind = isAppliance ? (type === 'sink' || type === 'tap' ? 'sink_tap' : 'appliance') : 'hardware'
    return {
      supplier: 'elgrad',
      sku: r.sku,
      name: r.name,
      brand: r.brand ?? undefined,
      kind,
      type,
      unit: r.unit ?? undefined,
      priceEur: Number(r.price_eur),
      priceBasis: 'retail_incl_vat',
      observedAt: r.last_seen_at?.slice(0, 10),
      productUrl: r.url ?? undefined,
      imageUrl: r.image_url ?? undefined,
    }
  })

  // Keep the bundle honest: only the types the builder can actually pick. The
  // long tail (connectors, legs, plinths, 'other') stays in the DB for later.
  const PICKABLE = new Set(['appliance/hob','appliance/oven','appliance/extractor','appliance/fridge','appliance/dishwasher','appliance/microwave','appliance/wine_fridge','appliance/coffee','sink_tap/sink','sink_tap/tap','hardware/drawer_system','hardware/hinge','hardware/handle','hardware/lift_system','hardware/lighting','hardware/organiser','hardware/waste'])
  const pickable = products.filter((p) => PICKABLE.has(`${p.kind}/${p.type}`))
  console.log(`> pickable subset: ${pickable.length} of ${products.length}`)
  const counts = {}
  for (const p of products) counts[`${p.kind}/${p.type}`] = (counts[`${p.kind}/${p.type}`] ?? 0) + 1
  console.log('> classification:', Object.fromEntries(Object.entries(counts).sort()))

  // Tier-grounding subsets (cleaned of accessories) — the estimate's UNPICKED
  // hardware bands read these percentiles instead of hand-set RRPs.
  const lower = (p) => p.name.toLowerCase()
  const subsets = {
    'hardware/runner_set': products.filter((p) => p.type === 'drawer_system' && ['vodilic', 'ladic', 'set', 'komplet'].some((k) => lower(p).includes(k)) && p.priceEur >= 8),
    'hardware/hinge_unit': products.filter((p) => p.type === 'hinge' && ['šarnir', 'sarnir', 'spojnic'].some((k) => lower(p).includes(k)) && p.priceEur >= 1.5 && p.priceEur <= 40),
    'hardware/knob': products.filter((p) => p.type === 'handle' && lower(p).includes('gumb') && p.priceEur >= 0.8),
    'hardware/bar': products.filter((p) => p.type === 'handle' && (lower(p).includes('ručk') || lower(p).includes('rucka')) && !lower(p).includes('gumb') && p.priceEur >= 0.8 && p.priceEur <= 60),
  }
  const bands = {}
  for (const [key, items] of Object.entries(subsets)) {
    const prices = items.map((p) => p.priceEur).sort((a, b) => a - b)
    if (prices.length < 10) continue
    bands[key] = { n: prices.length, min: prices[0], p10: percentile(prices, 10), p20: percentile(prices, 20), p25: percentile(prices, 25), p40: percentile(prices, 40), median: percentile(prices, 50), p60: percentile(prices, 60), p75: percentile(prices, 75), p80: percentile(prices, 80), p90: percentile(prices, 90), max: prices[prices.length - 1] }
    console.log('  tier band', key, bands[key])
  }
  for (const key of new Set(products.map((p) => `${p.kind}/${p.type}`))) {
    const prices = products.filter((p) => `${p.kind}/${p.type}` === key).map((p) => p.priceEur).sort((a, b) => a - b)
    bands[key] = { n: prices.length, min: prices[0], p10: percentile(prices, 10), p20: percentile(prices, 20), p25: percentile(prices, 25), p40: percentile(prices, 40), median: percentile(prices, 50), p60: percentile(prices, 60), p75: percentile(prices, 75), p80: percentile(prices, 80), p90: percentile(prices, 90), max: prices[prices.length - 1] }
  }
  for (const [k, b] of Object.entries(bands)) if (k.startsWith('appliance/') || ['hardware/drawer_system', 'hardware/hinge', 'hardware/handle'].includes(k)) console.log('  band', k, b)

  if (DRY) return
  const out = {
    schema: { version: '1.0' },
    source: {
      supplier: 'Elgrad d.o.o. webshop',
      url: 'https://webshop.elgrad.hr',
      priceBasis: 'Public retail price incl. VAT as shown on webshop.elgrad.hr; refreshed by scripts/scrape-elgrad-webshop.mjs → softclose_products → this file.',
      generatedAt: new Date().toISOString().slice(0, 10),
    },
    bands,
    products: pickable,
  }
  writeFileSync(OUT, JSON.stringify(out) + '\n')
  console.log(`> wrote ${pickable.length} products → ${OUT}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
