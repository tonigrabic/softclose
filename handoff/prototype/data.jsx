/* ──────────────────────────────────────────────────────────────────────────
   softclose — IA model + bilingual copy for the prototype.
   The journey is THREE ACTS. Each act owns a set of steps. The builder's
   component groups are steps inside Act 2 — same grain, one nav.
   All in-product copy is bilingual: t(node, lang) where node = {en, hr}.
   ────────────────────────────────────────────────────────────────────────── */

function t(node, lang) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  return node[lang] ?? node.en ?? ''
}

/* The three acts. `kind` distinguishes capture steps from builder groups so the
   nav can render the right micro-affordance, but they live in ONE list. */
const ACTS = [
  {
    id: 'space',
    num: 1,
    label: { en: 'Your space', hr: 'Vaš prostor' },
    phase: { en: 'Capture', hr: 'Snimanje' },
    blurb: {
      en: 'Show us the room. We read the layout and render a first concept.',
      hr: 'Pokažite nam prostor. Očitavamo raspored i izrađujemo prvi koncept.',
    },
    steps: ['type', 'photos', 'inspiration', 'render', 'confirm'],
  },
  {
    id: 'build',
    num: 2,
    label: { en: 'Build it', hr: 'Gradnja' },
    phase: { en: 'Build', hr: 'Sastavljanje' },
    blurb: {
      en: 'Choose every part of the kitchen. A live price range sharpens as you go.',
      hr: 'Odaberite svaki dio kuhinje. Raspon cijene se izoštrava kako birate.',
    },
    steps: [
      'counted', 'cabinets', 'doors', 'worktop', 'backsplash', 'hardware',
      'appliances', 'sink', 'lighting', 'finishing', 'scope', 'wishlist',
    ],
  },
  {
    id: 'offer',
    num: 3,
    label: { en: 'Your offer', hr: 'Vaša ponuda' },
    phase: { en: 'Close', hr: 'Zaključak' },
    blurb: {
      en: 'A few practicalities, then your price range — your maker confirms it.',
      hr: 'Nekoliko praktičnih stvari, zatim vaš raspon cijene — vaš majstor ga potvrđuje.',
    },
    steps: ['logistics', 'contact', 'offer'],
  },
]

/* Step dictionary. eyebrow/title/why are in-product. readback is the tiny
   captured-value line the nav shows once a step is done. group=true marks
   builder component groups (Act 2). seam=true marks the handoff screen. */
const STEPS = {
  /* ── Act 1 · Your space ─────────────────────────────────────────────── */
  type: {
    act: 'space',
    label: { en: 'What we’re doing', hr: 'Što radimo' },
    why: { en: 'A full remodel or a lighter refresh — sets the frame.', hr: 'Potpuna obnova ili osvježenje — postavlja okvir.' },
    readback: { en: 'Full remodel', hr: 'Potpuna obnova' },
  },
  photos: {
    act: 'space',
    label: { en: 'Your space', hr: 'Vaš prostor' },
    why: { en: 'Photos so we can read your existing kitchen.', hr: 'Fotografije da očitamo vašu postojeću kuhinju.' },
    readback: { en: '4 photos · L-shape', hr: '4 fotografije · L-oblik' },
  },
  inspiration: {
    act: 'space',
    label: { en: 'Inspiration', hr: 'Inspiracija' },
    why: { en: 'A direction we can render against.', hr: 'Smjer prema kojem možemo renderirati.' },
    readback: { en: 'Warm minimal · oak', hr: 'Toplo minimalno · hrast' },
  },
  render: {
    act: 'space',
    label: { en: 'AI concept', hr: 'AI koncept' },
    why: { en: 'A render anchored to your space, in your direction.', hr: 'Render usidren u vaš prostor, u vašem smjeru.' },
    readback: { en: 'Render chosen', hr: 'Render odabran' },
  },
  confirm: {
    act: 'space',
    label: { en: 'Confirm the look', hr: 'Potvrdite izgled' },
    why: { en: 'Best guesses pulled from your render — adjust anything.', hr: 'Najbolje pretpostavke iz vašeg rendera — prilagodite bilo što.' },
    readback: { en: 'Oak · quartz · matte', hr: 'Hrast · kvarc · mat' },
  },

  /* ── Act 2 · Build it ───────────────────────────────────────────────── */
  counted: {
    act: 'build', seam: true,
    label: { en: 'What we counted', hr: 'Što smo izmjerili' },
    why: { en: 'Everything we’ll build on, pulled from your plan. Confirm and we begin.', hr: 'Sve na čemu gradimo, iz vašeg tlocrta. Potvrdite i krećemo.' },
    readback: { en: 'Layout confirmed', hr: 'Raspored potvrđen' },
  },
  cabinets: {
    act: 'build', group: true,
    label: { en: 'Cabinet boxes', hr: 'Korpusi ormarića' },
    why: { en: 'The carcasses and how each run is filled.', hr: 'Korpusi i kako se popunjava svaki niz.' },
    readback: { en: 'Moisture-resistant · magic corner', hr: 'Vodootporno · magični kut' },
  },
  doors: {
    act: 'build', group: true,
    label: { en: 'Doors & fronts', hr: 'Vrata i fronte' },
    why: { en: 'The face of the kitchen — style and finish.', hr: 'Lice kuhinje — stil i završetak.' },
    readback: { en: 'Handleless · oak melamine', hr: 'Bez ručki · hrast melamin' },
  },
  worktop: {
    act: 'build', group: true,
    label: { en: 'Worktop', hr: 'Radna ploča' },
    why: { en: 'Material, thickness and edge.', hr: 'Materijal, debljina i rub.' },
    readback: { en: 'Quartz · 20 mm', hr: 'Kvarc · 20 mm' },
  },
  backsplash: {
    act: 'build', group: true,
    label: { en: 'Backsplash', hr: 'Zidna obloga' },
    why: { en: 'What protects the wall behind the counter.', hr: 'Što štiti zid iza radne ploče.' },
    readback: { en: 'Matching slab', hr: 'Ploča u istom dekoru' },
  },
  hardware: {
    act: 'build', group: true,
    label: { en: 'Hardware', hr: 'Okovi' },
    why: { en: 'Drawer runners, hinges, handles.', hr: 'Vodilice ladica, šarke, ručke.' },
    readback: { en: 'Blum · soft-close', hr: 'Blum · soft-close' },
  },
  appliances: {
    act: 'build', group: true,
    label: { en: 'Appliances', hr: 'Uređaji' },
    why: { en: 'What goes in, and who supplies it.', hr: 'Što ide unutra i tko nabavlja.' },
    readback: { en: '5 integrated', hr: '5 ugradbenih' },
  },
  sink: {
    act: 'build', group: true,
    label: { en: 'Sink & taps', hr: 'Sudoper i slavine' },
    why: { en: 'Bowls, mount and the tap.', hr: 'Korita, ugradnja i slavina.' },
    readback: { en: 'Undermount · pull-out', hr: 'Podgradni · izvlačna' },
  },
  lighting: {
    act: 'build', group: true,
    label: { en: 'Lighting', hr: 'Rasvjeta' },
    why: { en: 'Under-cabinet, plinth and pendants.', hr: 'Ispod elemenata, sokl i viseće.' },
    readback: { en: 'Under-cabinet LED', hr: 'LED ispod elemenata' },
  },
  finishing: {
    act: 'build', group: true,
    label: { en: 'Finishing', hr: 'Završno' },
    why: { en: 'Plinth, cornice, end panels — the trim.', hr: 'Sokl, vijenac, bočne ploče — detalji.' },
    readback: { en: 'Recessed plinth', hr: 'Uvučeni sokl' },
  },
  scope: {
    act: 'build',
    label: { en: 'Scope of work', hr: 'Opseg radova' },
    why: { en: 'What else is being touched — demo, trades, install. This moves the range.', hr: 'Što se još dira — rušenje, instalacije, montaža. Ovo mijenja raspon.' },
    readback: { en: '4 items in scope', hr: '4 stavke u opsegu' },
  },
  wishlist: {
    act: 'build',
    label: { en: 'In your words', hr: 'Vašim riječima' },
    why: { en: 'Must-haves and deal-breakers, however you’d say them.', hr: 'Što morate imati i što nikako — kako god biste rekli.' },
    readback: { en: '3 notes captured', hr: '3 bilješke zabilježene' },
  },

  /* ── Act 3 · Your offer ─────────────────────────────────────────────── */
  logistics: {
    act: 'offer',
    label: { en: 'Logistics & timing', hr: 'Logistika i rokovi' },
    why: { en: 'Access, living arrangement, and roughly when.', hr: 'Pristup, stanovanje tijekom radova i otprilike kada.' },
    readback: { en: 'Street level · 3–6 mo', hr: 'U prizemlju · 3–6 mj' },
  },
  contact: {
    act: 'offer',
    label: { en: 'Contact', hr: 'Kontakt' },
    why: { en: 'How your maker reaches you.', hr: 'Kako vas vaš majstor kontaktira.' },
    readback: { en: 'Ana · email', hr: 'Ana · email' },
  },
  offer: {
    act: 'offer', terminal: true,
    label: { en: 'Your offer', hr: 'Vaša ponuda' },
    why: { en: 'Your price range — an estimate your maker confirms.', hr: 'Vaš raspon cijene — procjena koju vaš majstor potvrđuje.' },
    readback: null,
  },
}

/* Live price range. Hidden through Act 1 (rangeAt returns null). Appears at the
   seam — wide, low-confidence — and the ± band NARROWS as builder steps pass.
   The band width is itself the status signal: ±22% → ±14%. The midpoint drifts
   up slightly as cost-bearing choices (appliances, scope) are added. EUR. */
const RANGE_BY_STEP = {
  counted:    { mid: 21000, pct: 22 },
  cabinets:   { mid: 21200, pct: 20 },
  doors:      { mid: 21300, pct: 19 },
  worktop:    { mid: 21600, pct: 18 },
  backsplash: { mid: 21700, pct: 17 },
  hardware:   { mid: 21800, pct: 16 },
  appliances: { mid: 22400, pct: 16 },
  sink:       { mid: 22500, pct: 15 },
  lighting:   { mid: 22600, pct: 15 },
  finishing:  { mid: 22800, pct: 14 },
  scope:      { mid: 23600, pct: 14 },
  wishlist:   { mid: 23600, pct: 14 },
  logistics:  { mid: 23600, pct: 14 },
  contact:    { mid: 23600, pct: 14 },
  offer:      { mid: 23600, pct: 14 },
}

/* Ordered flat list of step ids, across all acts — the spine. */
const ORDER = ACTS.flatMap((a) => a.steps)

function stepIndex(id) { return ORDER.indexOf(id) }
function actOf(id) { return ACTS.find((a) => a.id === STEPS[id].act) }
function nextStep(id) { const i = stepIndex(id); return i < ORDER.length - 1 ? ORDER[i + 1] : null }
function prevStep(id) { const i = stepIndex(id); return i > 0 ? ORDER[i - 1] : null }

/* Range visible only from the seam onward. Derives low/high from {mid, pct} so
   every surface (rail, offer, mobile) shows the same numbers. Rounded to 100. */
function rangeAt(id) {
  const i = stepIndex(id), seam = stepIndex('counted')
  if (i < seam) return null
  const r = RANGE_BY_STEP[id] ?? RANGE_BY_STEP.counted
  const round = (n) => Math.round(n / 100) * 100
  return { low: round(r.mid * (1 - r.pct / 100)), high: round(r.mid * (1 + r.pct / 100)), pct: r.pct }
}

/* EUR formatting, locale-aware. HR: "21.800 €" · EN: "€21,800". */
function eur(n, lang) {
  const grouped = Math.round(n).toLocaleString(lang === 'hr' ? 'de-DE' : 'en-US')
  return lang === 'hr' ? `${grouped} €` : `€${grouped}`
}

/* UI chrome strings (not step content). */
const UI = {
  back: { en: 'Back', hr: 'Natrag' },
  continue: { en: 'Continue', hr: 'Nastavi' },
  begin: { en: 'Begin building', hr: 'Započni gradnju' },
  estimate: { en: 'Estimated range', hr: 'Procijenjeni raspon' },
  estimateNote: { en: 'An estimate your maker confirms — never a final quote.', hr: 'Procjena koju vaš majstor potvrđuje — nikad konačna cijena.' },
  sharpens: { en: 'Sharpens as you choose', hr: 'Izoštrava se kako birate' },
  whereYouAre: { en: 'Where you are', hr: 'Gdje se nalazite' },
  yourBrief: { en: 'Your brief', hr: 'Vaš sažetak' },
  step: { en: 'Step', hr: 'Korak' },
  of: { en: 'of', hr: 'od' },
  done: { en: 'done', hr: 'gotovo' },
  send: { en: 'Send to your maker', hr: 'Pošalji majstoru' },
  menu: { en: 'Steps', hr: 'Koraci' },
}

Object.assign(window, {
  t, ACTS, STEPS, RANGE_BY_STEP, ORDER, UI,
  stepIndex, actOf, nextStep, prevStep, rangeAt, eur,
})
