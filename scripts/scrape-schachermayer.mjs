#!/usr/bin/env node
/**
 * Schachermayer hr-HR catalog scrape via Firecrawl.
 *
 * Output: src/lib/catalog/schachermayer-hardware.json (SKU + name + brand +
 * image + spec snippets — no prices, since pricing is B2B login-walled).
 *
 * Run:
 *   FIRECRAWL_API_KEY=... node scripts/scrape-schachermayer.mjs
 *
 * Or — since the key is in /Users/maci/Projects/softclose/.env.local:
 *   set -a; source ../../.env.local; set +a
 *   node scripts/scrape-schachermayer.mjs
 *
 * Strategy:
 *   - Hit a focused list of category landing pages (hardware drawers, hinges,
 *     sinks, taps) instead of the full 14k catalog.
 *   - Use Firecrawl's /v1/scrape with formats=['json'] + a JSON schema so the
 *     model returns a structured product list without us regex-parsing HTML.
 *   - Combine, dedupe, and write to disk.
 *
 * Conservative: limited URLs, generous backoff, hard cap on items per page.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'src/lib/catalog/schachermayer-hardware.json')

// Pull the key from env or fall back to the main repo's .env.local — try a
// few likely locations so the script works from a worktree without copying.
let FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
if (!FIRECRAWL_API_KEY) {
  const candidates = [
    resolve(ROOT, '.env.local'),
    resolve(ROOT, '../../../.env.local'),
    resolve(ROOT, '../../.env.local'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const raw = readFileSync(path, 'utf8')
    const m = raw.match(/^FIRECRAWL_API_KEY=(.+)$/m)
    if (m) {
      FIRECRAWL_API_KEY = m[1].trim()
      console.log(`> read FIRECRAWL_API_KEY from ${path}`)
      break
    }
  }
}
if (!FIRECRAWL_API_KEY) {
  console.error('Missing FIRECRAWL_API_KEY (env var or ../../.env.local).')
  process.exit(1)
}

// Focused MVP target list. Each entry will be passed to Firecrawl /scrape with
// the same JSON schema; results are merged. Add categories conservatively.
const TARGETS = [
  // Furniture hardware (drawer systems, hinges)
  { url: 'https://webshop.schachermayer.com/cat/hr-HR/products/okov-za-namje-taj/10000_61_1', kind: 'hardware' },
  // Sinks, taps, sanitary
  { url: 'https://webshop.schachermayer.com/cat/hr-HR/products/sudoperi-slavine-sanitarije-sauna-infracrvena-oprema/10000_494_1', kind: 'sink_tap' },
  // Kitchen appliances
  { url: 'https://webshop.schachermayer.com/cat/hr-HR/products/kuhinjski-ure-aji/10000_1858_1', kind: 'appliance' },
]

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Product display name' },
          sku: { type: 'string', description: 'Schachermayer SKU / article number' },
          brand: { type: 'string', description: 'Manufacturer brand (Blum, Grass, Franke, etc.)' },
          imageUrl: { type: 'string', description: 'Product image URL if visible' },
          productUrl: { type: 'string', description: 'Detail page URL' },
          shortSpec: { type: 'string', description: '1-line spec hint (size, finish, etc.)' },
        },
        required: ['name'],
      },
    },
    pageNote: { type: 'string', description: 'One-sentence description of the page' },
  },
  required: ['products'],
}

async function scrapeOnce(url, timeoutMs) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      url,
      formats: ['json'],
      jsonOptions: {
        schema: PRODUCT_SCHEMA,
        prompt:
          'Extract the products visible on this kitchen / cabinet hardware webshop category page. ' +
          'For each product card return: display name, SKU/article number if shown, brand, image URL, ' +
          'detail page URL, and a one-line spec hint. Skip ads and non-product content. Return up to 40 products.',
      },
      onlyMainContent: true,
      waitFor: 2000,
      timeout: timeoutMs,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firecrawl failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  return data?.data?.json ?? data?.json ?? null
}

async function scrapeOne(url) {
  console.log(`> scraping ${url}`)
  // Schachermayer's heavier categories (14k items) need a longer load budget;
  // start fast and retry slow before giving up.
  const attempts = [60_000, 120_000]
  let lastErr = null
  for (const t of attempts) {
    try {
      return await scrapeOnce(url, t)
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('SCRAPE_TIMEOUT') && !msg.includes('408')) throw err
      console.log(`  timeout at ${t}ms — retrying with longer budget`)
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr ?? new Error('Scrape failed')
}

// Load any prior output and merge into it — Schachermayer's heavier pages are
// flaky, so a fresh run that fails for one category should NOT erase data
// captured from a previous successful run for that same category.
const merged = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { schema: { version: '1.0' }, source: { supplier: 'Schachermayer (hr-HR)' }, byKind: {} }
merged.source = { ...merged.source, scrapedAt: new Date().toISOString() }
merged.byKind = merged.byKind ?? {}

function dedupeByKey(items, keyFn) {
  const seen = new Map()
  for (const it of items) {
    const k = keyFn(it)
    if (!k) continue
    if (!seen.has(k)) seen.set(k, it)
  }
  return Array.from(seen.values())
}

for (const target of TARGETS) {
  const previous = merged.byKind[target.kind]?.products ?? []
  try {
    const result = await scrapeOne(target.url)
    if (!result || !Array.isArray(result.products) || result.products.length === 0) {
      console.warn(`  no products this run — keeping ${previous.length} from prior run`)
      merged.byKind[target.kind] = {
        sourceUrl: target.url,
        products: previous,
        note: result?.pageNote ?? merged.byKind[target.kind]?.note ?? null,
      }
      continue
    }
    const combined = dedupeByKey([...previous, ...result.products], (p) => p.sku ?? p.productUrl ?? p.name)
    merged.byKind[target.kind] = {
      sourceUrl: target.url,
      products: combined,
      note: result.pageNote ?? null,
    }
    console.log(`  ${result.products.length} new (${combined.length} total after merge)`)
    await new Promise((r) => setTimeout(r, 1500))
  } catch (err) {
    console.error(`  ERROR ${target.url}: ${err instanceof Error ? err.message : err}`)
    // Preserve prior data on failure.
    merged.byKind[target.kind] = {
      sourceUrl: target.url,
      products: previous,
      error: String(err),
    }
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(merged, null, 2))
const total = Object.values(merged.byKind).reduce((s, k) => s + (k.products?.length ?? 0), 0)
console.log(`> wrote ${total} products across ${TARGETS.length} categories -> ${OUT.replace(ROOT + '/', '')}`)
