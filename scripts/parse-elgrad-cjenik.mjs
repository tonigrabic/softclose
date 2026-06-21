#!/usr/bin/env node
/**
 * Parse Elgrad VPC PDF (Veleprodajni cjenik) into a raw JSON dump.
 *
 * Output: src/lib/catalog/elgrad-decors-raw.json
 *
 * Strategy: pdftotext -layout preserves column positions. We detect column
 * X-offsets from the header line ("10 mm  12 mm  16 mm  18 mm  25 mm  38 mm")
 * and snap each €/marker token in a row to the nearest column. This handles
 * blank columns correctly — a missing 12mm price stays missing, instead of
 * shifting all subsequent prices left by one slot.
 *
 * Re-run when Elgrad reissues the cjenik:
 *   1. Drop the new PDF into data/elgrad-cjenik-YYYY-MM-DD.pdf
 *   2. Update DEFAULT_PDF below
 *   3. node scripts/parse-elgrad-cjenik.mjs
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const DEFAULT_PDF = resolve(ROOT, 'data/elgrad-cjenik-2026-03-30.pdf')
const OUT_RAW = resolve(ROOT, 'src/lib/catalog/elgrad-decors-raw.json')

const pdfPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_PDF
const validFromMatch = pdfPath.match(/(\d{4}-\d{2}-\d{2})/)
const validFrom = validFromMatch ? validFromMatch[1] : null

console.log(`> reading ${pdfPath}`)
const text = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8')

const ROW_RE =
  /^\s*(\d+)\s+([A-Z][0-9A-Z]+)\s+(ST\d+|SM|SUPER MAT)\s+([^\d€]+?)(?=\s{2,}|$)/

// One-shot match for a price OR a placeholder marker, with capture group on
// the thing that matters and full-match on the whole token.
const TOKEN_RE = /(?:(\d{1,3},\d{2})\s*€)|(?:(#N\/A|#REF!|NA UPIT))/g

// Column definitions for the "Oplemenjena iverica" + worktop section. We
// detect each column by searching for its label in the page header. Names
// are stable across the document; positions shift slightly per page.
const THICKNESS_COLS = [
  { key: 'iverica10', match: /10\s*mm/, kind: 'iverica', mm: 10 },
  { key: 'iverica12', match: /12\s*mm/, kind: 'iverica', mm: 12 },
  { key: 'iverica16', match: /16\s*mm/, kind: 'iverica', mm: 16 },
  { key: 'iverica18', match: /18\s*mm/, kind: 'iverica', mm: 18 },
  { key: 'iverica25', match: /25\s*mm/, kind: 'iverica', mm: 25 },
  { key: 'iverica38', match: /38\s*mm/, kind: 'iverica', mm: 38 },
  // Worktop columns (thickness 38mm, varying widths) come right after.
  { key: 'worktop600', match: /600\s*mm/, kind: 'worktop', widthMm: 600 },
  { key: 'worktop650', match: /650\s*mm/, kind: 'worktop', widthMm: 650 },
  { key: 'worktop920', match: /920\s*mm/, kind: 'worktop', widthMm: 920 },
]

function detectColumnsForPage(headerLines) {
  const cols = []
  for (const def of THICKNESS_COLS) {
    let best = null
    for (const line of headerLines) {
      const m = line.match(def.match)
      if (!m) continue
      const x = m.index + Math.floor(m[0].length / 2)
      // Defensive: skip column matches inside data rows (line starts with row num).
      if (/^\s*\d+\s+[A-Z][0-9A-Z]+/.test(line)) continue
      best = { ...def, x }
      break
    }
    if (best) cols.push(best)
  }
  return cols
}

function parseRow(line, cols) {
  const head = line.match(ROW_RE)
  if (!head) return null
  const [, rowNum, code, structure, rawName] = head
  const name = rawName.trim().replace(/\s{2,}/g, ' ')
  const headEndX = head[0].length

  const tokens = []
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m.index < headEndX) continue
    const x = m.index + Math.floor(m[0].length / 2)
    tokens.push({
      x,
      price: m[1] ? Number(m[1].replace(',', '.')) : null,
      marker: m[2] ?? null,
    })
  }

  // Snap each token to the nearest column within a tolerance window.
  const TOLERANCE = 6
  const prices = {}
  for (const tok of tokens) {
    let best = null
    let bestDist = Infinity
    for (const col of cols) {
      const d = Math.abs(col.x - tok.x)
      if (d < bestDist && d <= TOLERANCE) {
        bestDist = d
        best = col
      }
    }
    if (!best) continue
    // Don't overwrite — first hit wins (defensive).
    if (prices[best.key] !== undefined) continue
    prices[best.key] = tok.price
  }

  return { rowNum: Number(rowNum), code, structure, name, prices }
}

const lines = text.split(/\r?\n/)
let currentCols = null
const rows = []
const HEADER_WINDOW = 8
const recent = []

for (const line of lines) {
  recent.push(line)
  if (recent.length > HEADER_WINDOW) recent.shift()

  // Re-detect column positions when we hit the "Naziv dekora" header line.
  if (/Naziv dekora/.test(line)) {
    const detected = detectColumnsForPage(recent)
    if (detected.length >= 4) currentCols = detected
    continue
  }
  if (!currentCols) continue
  const row = parseRow(line, currentCols)
  if (row) rows.push(row)
}

mkdirSync(dirname(OUT_RAW), { recursive: true })
const out = {
  schema: { version: '1.0', currency: 'EUR' },
  source: {
    file: 'data/' + pdfPath.split('/').pop(),
    validFrom,
    parsedAt: new Date().toISOString(),
  },
  rowCount: rows.length,
  notes:
    'Section: Oplemenjena iverica (decorative chipboard) + matching worktops. ' +
    'Prices in €/m² for boards, €/m\' for worktops. Columns detected by ' +
    'positional snap to header labels with ±6 char tolerance.',
  rows,
}
writeFileSync(OUT_RAW, JSON.stringify(out, null, 2))
console.log(`> wrote ${rows.length} rows -> ${OUT_RAW.replace(ROOT + '/', '')}`)
