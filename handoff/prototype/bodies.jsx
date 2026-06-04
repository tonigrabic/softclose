/* ──────────────────────────────────────────────────────────────────────────
   Step bodies for the prototype. The seam ("What we counted") is the hero —
   it makes the layout contract visible and hands Act 1 → Act 2 in-place.
   Most non-focus steps use a calm, representative body so the shell reads as
   a real product without hand-building all 20 screens.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useStateB } = React

/* ── Small shared primitives ──────────────────────────────────────────── */

function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>
}

function Chip({ label, active, onClick, dot }) {
  return (
    <button type="button" onClick={onClick} className={'chip' + (active ? ' chip-on' : '')}>
      {dot && <span className="chip-dot" style={{ background: dot }} />}
      {label}
    </button>
  )
}

function ChipRow({ lang, label, options, value, onChange, multi }) {
  return (
    <div className="field">
      {label && <p className="field-label">{t(label, lang)}</p>}
      <div className="chips">
        {options.map((o) => {
          const on = multi ? value.includes(o.id) : value === o.id
          return (
            <Chip
              key={o.id}
              label={t(o.label, lang)}
              active={on}
              dot={o.dot}
              onClick={() =>
                multi
                  ? onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])
                  : onChange(o.id)
              }
            />
          )
        })}
      </div>
    </div>
  )
}

/* A warm placeholder standing in for the AI render / photos. */
function RenderTile({ label, ratio = '4 / 3', small }) {
  return (
    <div className="render-tile" style={{ aspectRatio: ratio }}>
      <svg viewBox="0 0 64 48" className="render-glyph" aria-hidden="true">
        <rect x="8" y="20" width="48" height="20" rx="2" />
        <line x1="8" y1="28" x2="56" y2="28" />
        <line x1="20" y1="20" x2="20" y2="40" />
        <line x1="32" y1="28" x2="32" y2="40" />
        <line x1="44" y1="20" x2="44" y2="40" />
        <rect x="14" y="9" width="36" height="9" rx="1.5" />
      </svg>
      {label && <span className={'render-label' + (small ? ' small' : '')}>{label}</span>}
    </div>
  )
}

/* The L-shape floor plan that visualises the layout contract. */
function FloorPlanSvg({ lang }) {
  const cm = { en: 'cm', hr: 'cm' }
  return (
    <svg viewBox="0 0 320 230" className="plan-svg" role="img" aria-label="Floor plan">
      {/* room */}
      <rect x="40" y="32" width="252" height="172" rx="3" className="plan-room" />
      {/* counter runs (thick) */}
      <line x1="52" y1="44" x2="280" y2="44" className="plan-run" />
      <line x1="52" y1="44" x2="52" y2="180" className="plan-run" />
      {/* corner marker */}
      <rect x="46" y="38" width="13" height="13" rx="2" className="plan-corner" />
      {/* appliance dots */}
      {[
        { x: 110, y: 44, key: { en: 'Sink', hr: 'Sudoper' } },
        { x: 200, y: 44, key: { en: 'Hob', hr: 'Ploča' } },
        { x: 52, y: 140, key: { en: 'Fridge', hr: 'Hladnjak' } },
      ].map((a, i) => (
        <g key={i}>
          <circle cx={a.x} cy={a.y} r="6" className="plan-dot" />
        </g>
      ))}
      {/* length labels */}
      <text x="166" y="22" className="plan-len" textAnchor="middle">380 {t(cm, lang)}</text>
      <text x="24" y="116" className="plan-len" textAnchor="middle" transform="rotate(-90 24 116)">320 {t(cm, lang)}</text>
      {/* corner label */}
      <text x="70" y="70" className="plan-note">{t({ en: 'corner', hr: 'kut' }, lang)}</text>
    </svg>
  )
}

/* ── Generic body frame ───────────────────────────────────────────────── */

function BodyFrame({ lang, id, children, tall }) {
  const s = STEPS[id]
  const act = actOf(id)
  return (
    <div className={'body' + (tall ? ' body-tall' : '')}>
      <header className="body-head">
        <Eyebrow>{t(act.phase, lang)} · {t(act.label, lang)}</Eyebrow>
        <h2 className="body-title">{t(s.label, lang)}</h2>
        <p className="body-why">{t(s.why, lang)}</p>
      </header>
      {children}
    </div>
  )
}

/* ── The seam: "What we counted" ──────────────────────────────────────── */

function CountedBody({ lang }) {
  const facts = [
    { k: { en: 'Layout', hr: 'Raspored' }, v: { en: 'L-shape', hr: 'L-oblik' } },
    { k: { en: 'Two runs', hr: 'Dva niza' }, v: { en: '380 + 320 cm', hr: '380 + 320 cm' } },
    { k: { en: 'Corner', hr: 'Kut' }, v: { en: '1 · reserved', hr: '1 · rezerviran' } },
    { k: { en: 'Appliances', hr: 'Uređaji' }, v: { en: 'Sink · hob · fridge', hr: 'Sudoper · ploča · hladnjak' } },
    { k: { en: 'Cabinets', hr: 'Ormarići' }, v: { en: '≈ 14 units', hr: '≈ 14 jedinica' } },
    { k: { en: 'Ceiling', hr: 'Strop' }, v: { en: '280 cm (assumed)', hr: '280 cm (pretpostavka)' } },
  ]
  return (
    <BodyFrame lang={lang} id="counted" tall>
      <div className="counted-grid">
        <div className="counted-plan">
          <FloorPlanSvg lang={lang} />
          <p className="counted-cap">
            {t({ en: 'Frozen from your floor plan — your maker can adjust on site.', hr: 'Zamrznuto iz vašeg tlocrta — majstor može prilagoditi na licu mjesta.' }, lang)}
          </p>
        </div>
        <div className="counted-facts">
          {facts.map((f, i) => (
            <div key={i} className="fact">
              <span className="fact-k">{t(f.k, lang)}</span>
              <span className="fact-v">{t(f.v, lang)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="seam-note">
        <span className="seam-dot" />
        {t({ en: 'This is your first estimate — wide on purpose. Every choice you make narrows it.', hr: 'Ovo je vaša prva procjena — namjerno široka. Svaki vaš odabir je sužava.' }, lang)}
      </div>
    </BodyFrame>
  )
}

/* ── Act 1 bodies ─────────────────────────────────────────────────────── */

function TypeBody({ lang }) {
  const [v, setV] = useStateB('full')
  return (
    <BodyFrame lang={lang} id="type">
      <ChipRow lang={lang} value={v} onChange={setV} options={[
        { id: 'full', label: { en: 'Full remodel', hr: 'Potpuna obnova' } },
        { id: 'cab', label: { en: 'Cabinets only', hr: 'Samo ormarići' } },
        { id: 'refresh', label: { en: 'Light refresh', hr: 'Lagano osvježenje' } },
        { id: 'add', label: { en: 'Addition', hr: 'Dogradnja' } },
        { id: 'repair', label: { en: 'Repair', hr: 'Popravak' } },
      ]} />
      <p className="hint">{t({ en: 'No budget question here — your live range becomes that conversation in Build.', hr: 'Ovdje nema pitanja o budžetu — vaš živi raspon postaje taj razgovor u Gradnji.' }, lang)}</p>
    </BodyFrame>
  )
}

function PhotosBody({ lang }) {
  return (
    <BodyFrame lang={lang} id="photos">
      <div className="photo-grid">
        {[0, 1, 2, 3].map((i) => <RenderTile key={i} ratio="1 / 1" small label={i === 3 ? '+' : null} />)}
      </div>
      <div className="read-note">
        <span className="read-dot" />
        {t({ en: 'We read an L-shape, about 380 × 320 cm. You’ll confirm the plan next.', hr: 'Očitali smo L-oblik, otprilike 380 × 320 cm. Tlocrt potvrđujete u sljedećem koraku.' }, lang)}
      </div>
    </BodyFrame>
  )
}

function InspirationBody({ lang }) {
  const [v, setV] = useStateB(['warm', 'oak'])
  return (
    <BodyFrame lang={lang} id="inspiration">
      <ChipRow lang={lang} multi value={v} onChange={setV} options={[
        { id: 'warm', label: { en: 'Warm minimal', hr: 'Toplo minimalno' } },
        { id: 'oak', label: { en: 'Oak & stone', hr: 'Hrast i kamen' } },
        { id: 'classic', label: { en: 'Modern classic', hr: 'Moderna klasika' } },
        { id: 'dark', label: { en: 'Moody dark', hr: 'Tamno' } },
        { id: 'bright', label: { en: 'Bright & white', hr: 'Svijetlo' } },
      ]} />
      <div className="photo-grid two">
        <RenderTile ratio="4 / 3" small label={t({ en: 'Reference', hr: 'Referenca' }, lang)} />
        <RenderTile ratio="4 / 3" small label={t({ en: 'Reference', hr: 'Referenca' }, lang)} />
      </div>
    </BodyFrame>
  )
}

function RenderBody({ lang }) {
  return (
    <BodyFrame lang={lang} id="render">
      <RenderTile ratio="16 / 10" label={t({ en: 'AI concept — anchored to your photo', hr: 'AI koncept — usidren u vašu fotografiju' }, lang)} />
      <div className="chips" style={{ marginTop: 14 }}>
        {[{ en: 'Warmer', hr: 'Toplije' }, { en: 'Lighter wood', hr: 'Svjetlije drvo' }, { en: 'Open shelves', hr: 'Otvorene police' }].map((c, i) => (
          <span key={i} className="chip">{t(c, lang)}</span>
        ))}
        <span className="chip chip-ghost">↻ {t({ en: 'Re-render', hr: 'Ponovno renderiraj' }, lang)}</span>
      </div>
    </BodyFrame>
  )
}

function ConfirmBody({ lang }) {
  const [door, setDoor] = useStateB('oak')
  const [top, setTop] = useStateB('quartz')
  const [hw, setHw] = useStateB('matte')
  return (
    <BodyFrame lang={lang} id="confirm">
      <ChipRow lang={lang} label={{ en: 'Door material', hr: 'Materijal vrata' }} value={door} onChange={setDoor} options={[
        { id: 'oak', label: { en: 'Oak melamine', hr: 'Hrast melamin' } },
        { id: 'matte', label: { en: 'Matte lacquer', hr: 'Mat lak' } },
        { id: 'veneer', label: { en: 'Veneer', hr: 'Furnir' } },
      ]} />
      <ChipRow lang={lang} label={{ en: 'Worktop', hr: 'Radna ploča' }} value={top} onChange={setTop} options={[
        { id: 'quartz', label: { en: 'Quartz', hr: 'Kvarc' } },
        { id: 'laminate', label: { en: 'Laminate', hr: 'Laminat' } },
        { id: 'wood', label: { en: 'Solid wood', hr: 'Masivno drvo' } },
      ]} />
      <ChipRow lang={lang} label={{ en: 'Hardware feel', hr: 'Dojam okova' }} value={hw} onChange={setHw} options={[
        { id: 'matte', label: { en: 'Matte black', hr: 'Mat crna' } },
        { id: 'steel', label: { en: 'Brushed steel', hr: 'Brušeni čelik' } },
        { id: 'brass', label: { en: 'Brass', hr: 'Mjed' } },
      ]} />
    </BodyFrame>
  )
}

/* ── Act 2 builder-group bodies (focus: cabinets, doors) ──────────────── */

function CabinetsBody({ lang }) {
  const [mat, setMat] = useStateB('mr')
  const [corner, setCorner] = useStateB('magic')
  const units = [
    { r: { en: 'Top run · 380 cm', hr: 'Gornji niz · 380 cm' }, d: { en: 'Sink unit · 2 drawer banks · oven housing', hr: 'Element sudopera · 2 niza ladica · kućište pećnice' } },
    { r: { en: 'Left run · 320 cm', hr: 'Lijevi niz · 320 cm' }, d: { en: 'Magic corner · larder · doors + shelf', hr: 'Magični kut · smočnica · vrata + polica' } },
  ]
  return (
    <BodyFrame lang={lang} id="cabinets">
      <ChipRow lang={lang} label={{ en: 'Carcass material', hr: 'Materijal korpusa' }} value={mat} onChange={setMat} options={[
        { id: 'white', label: { en: 'White melamine', hr: 'Bijeli melamin' } },
        { id: 'mr', label: { en: 'Moisture-resistant', hr: 'Vodootporno' } },
        { id: 'match', label: { en: 'Matched to door', hr: 'U boji vrata' } },
      ]} />
      <ChipRow lang={lang} label={{ en: 'Corner solution', hr: 'Rješenje kuta' }} value={corner} onChange={setCorner} options={[
        { id: 'magic', label: { en: 'Magic corner', hr: 'Magični kut' } },
        { id: 'lazy', label: { en: 'Lazy Susan', hr: 'Okretna polica' } },
        { id: 'dead', label: { en: 'Dead corner', hr: 'Slijepi kut' } },
      ]} />
      <div className="unit-list">
        {units.map((u, i) => (
          <div key={i} className="unit">
            <span className="unit-r">{t(u.r, lang)}</span>
            <span className="unit-d">{t(u.d, lang)}</span>
          </div>
        ))}
      </div>
    </BodyFrame>
  )
}

function DoorsBody({ lang }) {
  const [style, setStyle] = useStateB('handleless')
  return (
    <BodyFrame lang={lang} id="doors">
      <ChipRow lang={lang} label={{ en: 'Door style', hr: 'Stil vrata' }} value={style} onChange={setStyle} options={[
        { id: 'slab', label: { en: 'Slab', hr: 'Glatka' } },
        { id: 'shaker', label: { en: 'Shaker', hr: 'Shaker' } },
        { id: 'handleless', label: { en: 'Handleless', hr: 'Bez ručki' } },
        { id: 'glass', label: { en: 'Glass front', hr: 'Staklena fronta' } },
      ]} />
      <div className="field">
        <p className="field-label">{t({ en: 'Decor', hr: 'Dekor' }, lang)}</p>
        <div className="swatches">
          {['#c9a26a', '#e7ddcb', '#3a3a40', '#8a8f7d', '#b6bcc4'].map((c, i) => (
            <span key={i} className={'swatch' + (i === 0 ? ' swatch-on' : '')} style={{ background: c }} />
          ))}
        </div>
      </div>
    </BodyFrame>
  )
}

/* ── Act 2 closers ────────────────────────────────────────────────────── */

function ScopeBody({ lang }) {
  const [v, setV] = useStateB(['demo', 'electrical', 'flooring', 'install'])
  return (
    <BodyFrame lang={lang} id="scope">
      <ChipRow lang={lang} multi value={v} onChange={setV} options={[
        { id: 'demo', label: { en: 'Demo + disposal', hr: 'Rušenje + odvoz' } },
        { id: 'plumbing', label: { en: 'Move plumbing', hr: 'Premještanje vode' } },
        { id: 'electrical', label: { en: 'New electrical', hr: 'Nova struja' } },
        { id: 'flooring', label: { en: 'Flooring', hr: 'Podovi' } },
        { id: 'walls', label: { en: 'Walls', hr: 'Zidovi' } },
        { id: 'install', label: { en: 'Installation', hr: 'Montaža' } },
      ]} />
      <div className="read-note">
        <span className="read-dot" />
        {t({ en: 'Each of these adds a line to your range — you can watch it move.', hr: 'Svaka od ovih dodaje stavku u vaš raspon — možete pratiti promjenu.' }, lang)}
      </div>
    </BodyFrame>
  )
}

function WishlistBody({ lang }) {
  const fields = [
    { l: { en: 'Must-haves', hr: 'Moram imati' }, p: { en: 'Big drawers near the stove…', hr: 'Velike ladice uz štednjak…' } },
    { l: { en: 'Nice-to-haves', hr: 'Bilo bi lijepo' }, p: { en: 'A coffee station…', hr: 'Kutak za kavu…' } },
    { l: { en: 'Deal-breakers', hr: 'Nikako' }, p: { en: 'No open shelving…', hr: 'Bez otvorenih polica…' } },
  ]
  return (
    <BodyFrame lang={lang} id="wishlist">
      <div className="wish">
        {fields.map((f, i) => (
          <div key={i} className="field">
            <p className="field-label">{t(f.l, lang)}</p>
            <div className="fauxarea">{t(f.p, lang)}</div>
          </div>
        ))}
      </div>
    </BodyFrame>
  )
}

/* ── Act 3 bodies ─────────────────────────────────────────────────────── */

function LogisticsBody({ lang }) {
  const [access, setAccess] = useStateB('street')
  const [live, setLive] = useStateB('stay')
  const [when, setWhen] = useStateB('3_6')
  return (
    <BodyFrame lang={lang} id="logistics">
      <ChipRow lang={lang} label={{ en: 'Site access', hr: 'Pristup gradilištu' }} value={access} onChange={setAccess} options={[
        { id: 'street', label: { en: 'Street level', hr: 'U prizemlju' } },
        { id: 'flight', label: { en: 'One flight up', hr: 'Jedan kat' } },
        { id: 'lift', label: { en: 'Lift', hr: 'Lift' } },
      ]} />
      <ChipRow lang={lang} label={{ en: 'During the build', hr: 'Tijekom radova' }} value={live} onChange={setLive} options={[
        { id: 'stay', label: { en: 'Stay in place', hr: 'Ostajem' } },
        { id: 'partial', label: { en: 'Partial move-out', hr: 'Djelomično iseljenje' } },
        { id: 'move', label: { en: 'Fully relocate', hr: 'Potpuno iseljenje' } },
      ]} />
      <ChipRow lang={lang} label={{ en: 'Roughly when', hr: 'Otprilike kada' }} value={when} onChange={setWhen} options={[
        { id: 'asap', label: { en: 'ASAP', hr: 'Što prije' } },
        { id: '1_3', label: { en: '1–3 months', hr: '1–3 mjeseca' } },
        { id: '3_6', label: { en: '3–6 months', hr: '3–6 mjeseci' } },
        { id: 'norush', label: { en: 'No rush', hr: 'Bez žurbe' } },
      ]} />
    </BodyFrame>
  )
}

function ContactBody({ lang }) {
  return (
    <BodyFrame lang={lang} id="contact">
      <div className="field">
        <p className="field-label">{t({ en: 'Your name', hr: 'Vaše ime' }, lang)}</p>
        <div className="fauxinput">Ana Horvat</div>
      </div>
      <div className="field">
        <p className="field-label">{t({ en: 'Email or phone', hr: 'Email ili telefon' }, lang)}</p>
        <div className="fauxinput">ana@example.hr</div>
      </div>
      <p className="hint">{t({ en: 'Used only for your project conversation.', hr: 'Koristi se samo za razgovor o vašem projektu.' }, lang)}</p>
    </BodyFrame>
  )
}

function OfferBody({ lang }) {
  const r = rangeAt('offer')
  const summary = [
    { en: 'L-shape kitchen · 2 runs · 14 units', hr: 'L-kuhinja · 2 niza · 14 jedinica' },
    { en: 'Handleless oak · quartz worktop', hr: 'Bez ručki, hrast · kvarcna ploča' },
    { en: 'Blum soft-close · 5 integrated appliances', hr: 'Blum soft-close · 5 ugradbenih uređaja' },
    { en: 'Demo, electrical, flooring, install in scope', hr: 'Rušenje, struja, podovi, montaža u opsegu' },
  ]
  return (
    <BodyFrame lang={lang} id="offer" tall>
      <div className="offer-card">
        <p className="offer-eyebrow">{t({ en: 'Your kitchen, estimated', hr: 'Vaša kuhinja, procijenjeno' }, lang)}</p>
        <div className="offer-range">
          <span>{eur(r.low, lang)}</span>
          <span className="offer-dash">–</span>
          <span>{eur(r.high, lang)}</span>
        </div>
        <p className="offer-band">± {r.pct}% · {t({ en: 'confidence range', hr: 'raspon pouzdanosti' }, lang)}</p>
        <p className="offer-frame">{t({ en: 'This is an estimate your maker confirms — never a committed quote. Nothing is locked, and there’s no rush.', hr: 'Ovo je procjena koju vaš majstor potvrđuje — nikad obvezujuća cijena. Ništa nije zaključano i nema žurbe.' }, lang)}</p>
      </div>
      <div className="offer-summary">
        <p className="field-label">{t({ en: 'What goes to your maker', hr: 'Što ide vašem majstoru' }, lang)}</p>
        {summary.map((line, i) => (
          <div key={i} className="sum-line"><span className="sum-check">✓</span>{t(line, lang)}</div>
        ))}
      </div>
    </BodyFrame>
  )
}

/* ── Dispatcher ───────────────────────────────────────────────────────── */

const GENERIC = {
  worktop: [
    { label: { en: 'Material', hr: 'Materijal' }, opts: [{ id: 'quartz', label: { en: 'Quartz', hr: 'Kvarc' } }, { id: 'lam', label: { en: 'Laminate', hr: 'Laminat' } }, { id: 'stone', label: { en: 'Sintered stone', hr: 'Sinterirani kamen' } }] },
    { label: { en: 'Thickness', hr: 'Debljina' }, opts: [{ id: '20', label: { en: '20 mm', hr: '20 mm' } }, { id: '38', label: { en: '38 mm', hr: '38 mm' } }] },
  ],
  backsplash: [
    { label: { en: 'Type', hr: 'Vrsta' }, opts: [{ id: 'slab', label: { en: 'Matching slab', hr: 'Ploča u dekoru' } }, { id: 'tile', label: { en: 'Tile', hr: 'Pločice' } }, { id: 'glass', label: { en: 'Glass', hr: 'Staklo' } }] },
  ],
  hardware: [
    { label: { en: 'Drawer system', hr: 'Sustav ladica' }, opts: [{ id: 'budget', label: { en: 'Budget', hr: 'Osnovno' } }, { id: 'mid', label: { en: 'Mid', hr: 'Srednje' } }, { id: 'blum', label: { en: 'Blum premium', hr: 'Blum premium' } }] },
    { label: { en: 'Handles', hr: 'Ručke' }, opts: [{ id: 'jpull', label: { en: 'J-pull', hr: 'J-profil' } }, { id: 'bar', label: { en: 'Pull bar', hr: 'Ručka šipka' } }, { id: 'knob', label: { en: 'Knob', hr: 'Gumb' } }] },
  ],
  appliances: [
    { label: { en: 'Supplied by', hr: 'Nabavlja' }, opts: [{ id: 'maker', label: { en: 'Maker supplies', hr: 'Majstor nabavlja' } }, { id: 'me', label: { en: 'I supply', hr: 'Ja nabavljam' } }, { id: 'mixed', label: { en: 'Mixed', hr: 'Kombinirano' } }] },
  ],
  sink: [
    { label: { en: 'Bowls', hr: 'Korita' }, opts: [{ id: 'single', label: { en: 'Single', hr: 'Jedno' } }, { id: 'half', label: { en: 'One and a half', hr: 'Jedno i pol' } }, { id: 'double', label: { en: 'Double', hr: 'Dvostruko' } }] },
    { label: { en: 'Mount', hr: 'Ugradnja' }, opts: [{ id: 'under', label: { en: 'Undermount', hr: 'Podgradni' } }, { id: 'inset', label: { en: 'Inset', hr: 'Nadgradni' } }] },
  ],
  lighting: [
    { label: { en: 'Lighting', hr: 'Rasvjeta' }, opts: [{ id: 'under', label: { en: 'Under-cabinet LED', hr: 'LED ispod elemenata' } }, { id: 'plinth', label: { en: 'Plinth LED', hr: 'LED u soklu' } }, { id: 'pendant', label: { en: 'Pendants', hr: 'Viseće' } }] },
  ],
  finishing: [
    { label: { en: 'Plinth', hr: 'Sokl' }, opts: [{ id: 'door', label: { en: 'Matched to door', hr: 'U boji vrata' } }, { id: 'recess', label: { en: 'Recessed black', hr: 'Uvučeni crni' } }, { id: 'metal', label: { en: 'Metal strip', hr: 'Metalna traka' } }] },
  ],
}

function GenericGroupBody({ lang, id }) {
  const rows = GENERIC[id] || []
  const [state, setState] = useStateB(() => Object.fromEntries(rows.map((r, i) => [i, r.opts[0].id])))
  return (
    <BodyFrame lang={lang} id={id}>
      {rows.map((r, i) => (
        <ChipRow key={i} lang={lang} label={r.label} options={r.opts}
          value={state[i]} onChange={(v) => setState((s) => ({ ...s, [i]: v }))} />
      ))}
    </BodyFrame>
  )
}

function Body({ lang, id }) {
  switch (id) {
    case 'type': return <TypeBody lang={lang} />
    case 'photos': return <PhotosBody lang={lang} />
    case 'inspiration': return <InspirationBody lang={lang} />
    case 'render': return <RenderBody lang={lang} />
    case 'confirm': return <ConfirmBody lang={lang} />
    case 'counted': return <CountedBody lang={lang} />
    case 'cabinets': return <CabinetsBody lang={lang} />
    case 'doors': return <DoorsBody lang={lang} />
    case 'scope': return <ScopeBody lang={lang} />
    case 'wishlist': return <WishlistBody lang={lang} />
    case 'logistics': return <LogisticsBody lang={lang} />
    case 'contact': return <ContactBody lang={lang} />
    case 'offer': return <OfferBody lang={lang} />
    default: return <GenericGroupBody lang={lang} id={id} />
  }
}

Object.assign(window, { Body, FloorPlanSvg, RenderTile, Chip, ChipRow })
