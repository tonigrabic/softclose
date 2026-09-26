#!/usr/bin/env node
/**
 * Refresh the curated Elgrad decor subset (src/lib/catalog/elgrad-decors.json)
 * from the raw price-list parse (elgrad-decors-raw.json).
 *
 * The curated file carries hand-authored metadata (names, family/tone/finish,
 * hexHint, uses) that a price-list reissue must NOT touch. Only `prices` and
 * the `source` block are rewritten, matched by code + structure.
 *
 * Flow when Elgrad reissues the cjenik:
 *   1. node scripts/parse-elgrad-cjenik.mjs data/elgrad-cjenik-YYYY-MM-DD.pdf
 *   2. node scripts/refresh-elgrad-curated.mjs
 *   3. npx vitest run   (estimate snapshots move — regenerate with -u and log why)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = resolve(ROOT, 'src/lib/catalog/elgrad-decors-raw.json')
const CURATED = resolve(ROOT, 'src/lib/catalog/elgrad-decors.json')

const raw = JSON.parse(readFileSync(RAW, 'utf8'))
const curated = JSON.parse(readFileSync(CURATED, 'utf8'))

const rows = raw.rows ?? raw.decors ?? []
// First row per code+structure wins: the standard board precedes its variants
// (e.g. U708 ST9 row 41 = 18 mm standard, row 42 = 19 mm P3 moisture-resistant).
const byKey = new Map()
for (const r of rows) if (!byKey.has(`${r.code}|${r.structure}`)) byKey.set(`${r.code}|${r.structure}`, r)
const byCode = new Map()
for (const r of rows) if (!byCode.has(r.code)) byCode.set(r.code, r)

let changed = 0
let missing = 0
const priceKeys = ['iverica18', 'iverica25', 'worktop600', 'worktop920']
for (const d of curated.decors) {
  const src = byKey.get(`${d.code}|${d.structure}`) ?? byCode.get(d.code)
  if (!src) {
    missing++
    console.warn(`! ${d.code} ${d.structure}: not in raw parse — prices left as-is`)
    continue
  }
  const next = {}
  for (const k of priceKeys) next[k] = src.prices?.[k] ?? null
  // Keep any price the raw parse cannot supply for this structure only if the
  // curated file already had it (e.g. worktop rows listed under another
  // structure) — never invent, never silently drop.
  for (const k of priceKeys) if (next[k] == null && d.prices?.[k] != null) next[k] = d.prices[k]
  if (JSON.stringify(next) !== JSON.stringify(d.prices)) changed++
  d.prices = next
}

curated.source = {
  ...curated.source,
  pdfFile: raw.source?.file ?? curated.source.pdfFile,
  validFrom: raw.source?.validFrom ?? curated.source.validFrom,
  extractedAt: new Date().toISOString().slice(0, 10),
}

writeFileSync(CURATED, JSON.stringify(curated, null, 2) + '\n')
console.log(`> ${curated.decors.length} curated decors · ${changed} price sets updated · ${missing} unmatched`)
console.log(`> source now: ${curated.source.pdfFile} (valid from ${curated.source.validFrom})`)
