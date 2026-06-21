/**
 * One-off: stamp `priceEur` reference RRPs onto the scraped Schachermayer
 * products. Schachermayer's own prices sit behind a B2B login, so these are
 * curated Croatian-market reference prices (incl. VAT, 2026) — close enough
 * for a homeowner-facing estimate; the maker's account price replaces them
 * at quote time. First matching rule wins; the script fails loudly if any
 * product is left unpriced so a future re-scrape can't silently ship
 * priceless items.
 *
 * Run: node scripts/add-reference-prices.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = new URL('../src/lib/catalog/schachermayer-hardware.json', import.meta.url)

/** [regex over `${brand} ${name}`, priceEur] — first match wins. */
const RULES = [
  // ── hardware: Blum drawer systems / hinges / small fittings ──
  [/TANDEMBOX vodilica BLUMOTION/i, 38],
  [/TANDEMBOX antaro\/intivo, stranica/i, 29],
  [/TANDEMBOX antaro prihvatnik fronte/i, 6.5],
  [/TANDEMBOX antaro držač stražnje/i, 4.8],
  [/TANDEMBOX antaro pokrivna kapica/i, 1.2],
  [/ANTARO Tandembox reling/i, 9.5],
  [/TANDEM spojka/i, 3.6],
  [/AVENTOS .*pričvrsnik fronte/i, 14],
  [/TIP-ON za vrata/i, 11],
  [/CLIP top BLUMOTION .*spojnica/i, 9.8],
  [/CLIP top (standardna|širokokutna) spojnica/i, 6.2],
  [/CLIP (ekscentar )?podložna pločica/i, 1.4],
  [/zidna letvica za ovjes/i, 12],
  [/ovjes ormara 806/i, 4.2],
  [/pokrivne kapice za model 806/i, 0.9],
  [/podesiva noga sokla/i, 1.8],
  [/Gornji dio nogice/i, 0.8],

  // ── sink_tap: sinks, taps, accessories ──
  [/GRANMASTER sudoper QUBE 60 sa slavinom/i, 329],
  [/GRANMASTER ugradbeni sudoper Horizon/i, 219],
  [/GRANMASTER ugradbeni sudoper Riva/i, 235],
  [/GRANMASTER sudoper Luka/i, 189],
  [/GRANMASTER kuhinjska slavina/i, 139],
  [/BLANCO ugradbeni sudoper Elon XL/i, 295],
  [/BLANCO ugradbeni sudoper Legra XL/i, 245],
  [/BLANCO kuhinjska slavina Mila/i, 119],
  [/BLANCO dispenzer/i, 49],
  [/RODI sudoper Okio Plus 103/i, 205],
  [/RODI (ugradbeni )?sudoper Okio Line 80/i, 185],
  [/RODI (ugradbeni )?sudoper Okio Line 78/i, 175],
  [/RODI (ugradbeni )?sudoper Okio Line 65/i, 159],
  [/RODI sudoper New Manaus/i, 129],
  [/SOLIDO kuhinjska slavina/i, 95],
  [/HAAS sifon/i, 18],
  [/TEKA brtva/i, 9],
  [/REHAU .*brtva/i, 14],
  [/Pričvrsna kopča/i, 6],

  // ── appliance: built-in white goods ──
  [/MIELE perilica posuđa G 7191/i, 1390],
  [/MIELE ugradbena pećnica H 2455/i, 849],
  [/ELECTROLUX ugradbena pećnica EOF3H50/i, 419],
  [/ELECTROLUX pećnica EOF3H70/i, 469],
  [/ELECTROLUX indukcijska ploča .*LIB60420/i, 389],
  [/ELECTROLUX indukcijska ploča .*LIV63431/i, 449],
  [/ELECTROLUX staklokeramička ploča EHF 6346/i, 299],
  [/Electrolux kombinirana staklokeramička plinska/i, 409],
  [/ELECTROLUX ugradbena domino ploča/i, 289],
  [/ELECTROLUX perilica posuđa EEA12100L/i, 429],
  [/ELECTROLUX perilica posuđa EES48200L/i, 519],
  [/ELECTROLUX ugradbena mikrovalna/i, 339],
  [/GORENJE ugradbeni podpultni hladnjak/i, 599],
  [/GORENJE ugradbena teleskopska napa/i, 149],
  [/ELICA izvlačna napa Elite 14.*900/i, 459],
  [/ELICA ugradbena napa Lane/i, 329],
  [/ELICA ugradbena napa Era C/i, 219],
  [/ELICA ugradbena napa Era/i, 199],
  [/FABER ugradbena napa INCA SMART/i, 259],
  [/DOMETIC spojnica za hladnjak/i, 24],
  [/OPTIMAIRO redukcija/i, 6],
]

const catalog = JSON.parse(readFileSync(PATH, 'utf8'))
const unpriced = []
let priced = 0

for (const [kind, entry] of Object.entries(catalog.byKind)) {
  for (const p of entry.products) {
    const hay = `${p.brand ?? ''} ${p.name}`
    const rule = RULES.find(([re]) => re.test(hay))
    if (!rule) {
      unpriced.push(`${kind}: ${hay}`)
      continue
    }
    p.priceEur = rule[1]
    priced++
  }
}

if (unpriced.length > 0) {
  console.error('UNPRICED PRODUCTS — add rules:\n' + unpriced.join('\n'))
  process.exit(1)
}

catalog.source.priceBasis =
  'priceEur = curated Croatian-market reference RRP (incl. VAT, 2026-06) — supplier B2B prices are login-walled; maker account price replaces these at quote time.'

writeFileSync(PATH, JSON.stringify(catalog, null, 2) + '\n')
console.log(`priced ${priced} products, 0 unpriced`)
