#!/usr/bin/env node
/**
 * Elgrad webshop → softclose_products (Supabase).
 *
 * webshop.elgrad.hr shows retail prices (incl. VAT) publicly. The product list
 * is served by a plain POST to modules/ponuda/__module-router.asp which returns
 * a JSON action list; the `render-template` action carries one structured
 * object per product (sifra, naziv, cijena_mpc, mjerna_jedinica, slika, url_slug).
 * A session cookie from the category page is required.
 *
 * Run (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local):
 *   node scripts/scrape-elgrad-webshop.mjs                # all categories below
 *   node scripts/scrape-elgrad-webshop.mjs okovi          # one category
 *   DRY_RUN=1 node scripts/scrape-elgrad-webshop.mjs      # parse only, no DB writes
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://webshop.elgrad.hr'
const UA = 'Mozilla/5.0 (softclose price sync; contact: toni)'
const PER_PAGE = 96
const CATEGORIES = ['okovi', 'kucanski-uredaji']

function loadEnv() {
  const p = resolve(ROOT, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
loadEnv()

const DRY = process.env.DRY_RUN === '1'
const cats = process.argv.slice(2).length ? process.argv.slice(2) : CATEGORIES

async function getCookie(category) {
  const res = await fetch(`${BASE}/ponuda/${category}`, { headers: { 'User-Agent': UA } })
  const cookies = res.headers.getSetCookie?.() ?? []
  return cookies.map((c) => c.split(';')[0]).join('; ')
}

async function fetchPage(category, page, cookie) {
  const body = new URLSearchParams({
    type: 'segment',
    mode: 'segment-artikli',
    pg: String(page),
    kategorija: category,
    grupa: category,
    term: '',
    boja: '0',
    brand: '',
    materijal: '0',
    sort_by: 'filter-sortiraj-po-nazivu',
    per_page: String(PER_PAGE),
    display_mode: 'replace',
  })
  const res = await fetch(`${BASE}/modules/ponuda/__module-router.asp`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE}/ponuda/${category}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${category} p${page}`)
  const actions = await res.json()
  const tpl = actions.find((a) => a.action === 'render-template' && a.target === '.app-container-katalog')
  // `data` is a list of one-element lists (one per product card) — flatten.
  const items = (tpl?.data ?? []).flat().filter((it) => it && typeof it === 'object')
  const info = actions.find((a) => a.action === 'populate-data')?.data?.[0]?.['.app-page-info'] ?? ''
  const total = Number(info.split('/').pop()?.trim() ?? 0)
  return { items, total }
}

function parsePrice(s) {
  if (!s) return null
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function toRow(it, category) {
  return {
    supplier: 'elgrad',
    sku: it.sifra,
    name: it.naziv,
    brand: it.brand || it.marka || null,
    category,
    subcategory: null,
    unit: it.mjerna_jedinica || null,
    price_eur: parsePrice(it.cijena_mpc),
    price_basis: 'retail_incl_vat',
    url: it.url_slug ? `${BASE}/ponuda/${category}/${it.url_slug}` : null,
    image_url: it.slika ? `${BASE}${it.slika}` : null,
    raw: it,
  }
}

async function main() {
  const db = DRY ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  if (!DRY && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1)
  }
  let grand = 0
  for (const category of cats) {
    const cookie = await getCookie(category)
    const first = await fetchPage(category, 1, cookie)
    const pages = Math.max(1, Math.ceil(first.total / PER_PAGE))
    console.log(`> ${category}: ${first.total} products, ${pages} pages`)
    let rows = first.items.map((it) => toRow(it, category))
    for (let p = 2; p <= pages; p++) {
      await new Promise((r) => setTimeout(r, 400)) // be polite
      const { items } = await fetchPage(category, p, cookie)
      rows.push(...items.map((it) => toRow(it, category)))
    }
    const seen = new Set()
    rows = rows.filter((r) => r.sku && r.name && !seen.has(r.sku) && seen.add(r.sku))
    const priced = rows.filter((r) => r.price_eur != null).length
    console.log(`  parsed ${rows.length} unique SKUs, ${priced} with a price; sample:`, rows[0]?.sku, rows[0]?.price_eur, rows[0]?.unit)
    if (db) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from('softclose_products').upsert(rows.slice(i, i + 200), { onConflict: 'supplier,sku' })
        if (error) throw error
      }
      console.log(`  upserted ${rows.length}`)
    }
    grand += rows.length
  }
  console.log(`> done: ${grand} products${DRY ? ' (dry run)' : ''}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
