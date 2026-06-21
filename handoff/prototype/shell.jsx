/* ──────────────────────────────────────────────────────────────────────────
   The unified shell. ONE chrome for all three acts — including the builder.
   Three nav treatments share the same model and the same persistent right rail
   (render anchor + live price range). The chrome never changes at the seam.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useStateS } = React

/* ── status helpers ───────────────────────────────────────────────────── */

function stepStatus(id, current) {
  const a = stepIndex(id), b = stepIndex(current)
  return a < b ? 'done' : a === b ? 'current' : 'todo'
}
function actStatus(act, current) {
  const idx = act.steps.map(stepIndex)
  const c = stepIndex(current)
  if (c > Math.max(...idx)) return 'done'
  if (c < Math.min(...idx)) return 'todo'
  return 'current'
}
function actProgress(act, current) {
  const c = stepIndex(current)
  return { done: act.steps.filter((s) => stepIndex(s) < c).length, total: act.steps.length }
}

/* ── markers + rows ───────────────────────────────────────────────────── */

function Marker({ status }) {
  if (status === 'done') return <span className="mk mk-done">✓</span>
  if (status === 'current') return <span className="mk mk-cur"><span className="mk-pulse" /></span>
  return <span className="mk mk-todo" />
}

function StepRow({ id, current, onGo, lang }) {
  const st = stepStatus(id, current)
  const s = STEPS[id]
  const order = s.group ? String(actOf(id).steps.filter((x) => STEPS[x].group).indexOf(id) + 1).padStart(2, '0') : null
  const rb = st === 'done' && s.readback ? t(s.readback, lang) : null
  return (
    <button type="button" onClick={() => onGo(id)} className={'srow srow-' + st + (s.seam ? ' srow-seam' : '')}>
      <Marker status={st} />
      <span className="srow-main">
        <span className="srow-label">
          {order && <span className="srow-order">{order}</span>}
          {t(s.label, lang)}
          {s.seam && <span className="srow-tag">{t({ en: 'handoff', hr: 'predaja' }, lang)}</span>}
        </span>
        {rb && <span className="srow-rb">{rb}</span>}
      </span>
    </button>
  )
}

/* ── Treatment 1 · Two-level rail ─────────────────────────────────────── */

function NavRail({ current, onGo, lang }) {
  return (
    <nav className="nav">
      <p className="nav-cap">{t(UI.yourBrief, lang)}</p>
      <div className="rail">
        {ACTS.map((act) => {
          const as = actStatus(act, current)
          const pr = actProgress(act, current)
          return (
            <div key={act.id} className={'rail-act rail-' + as}>
              <button type="button" className="rail-acthead" onClick={() => onGo(act.steps[0])}>
                <span className="rail-num">{act.num}</span>
                <span className="rail-actlabel">{t(act.label, lang)}</span>
                {as === 'done'
                  ? <span className="rail-check">✓</span>
                  : <span className="rail-count">{pr.done}/{pr.total}</span>}
              </button>
              {as === 'current' && (
                <div className="rail-steps">
                  {act.steps.map((id) => <StepRow key={id} id={id} current={current} onGo={onGo} lang={lang} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Treatment 2 · Top acts + side steps ──────────────────────────────── */

function TopActs({ current, onGo, lang }) {
  return (
    <div className="topacts">
      {ACTS.map((act, i) => {
        const as = actStatus(act, current)
        const pr = actProgress(act, current)
        return (
          <React.Fragment key={act.id}>
            <button type="button" onClick={() => onGo(act.steps[0])} className={'topact topact-' + as}>
              <span className="topact-num">{as === 'done' ? '✓' : act.num}</span>
              <span className="topact-text">
                <span className="topact-phase">{t(act.phase, lang)}</span>
                <span className="topact-label">{t(act.label, lang)}</span>
              </span>
              {as === 'current' && (
                <span className="topact-bar"><span style={{ width: `${(pr.done / pr.total) * 100}%` }} /></span>
              )}
            </button>
            {i < ACTS.length - 1 && <span className="topact-sep" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function NavSteps({ current, onGo, lang }) {
  const act = actOf(current)
  return (
    <nav className="nav">
      <p className="nav-cap">{t(act.label, lang)}</p>
      <div className="rail-steps flat">
        {act.steps.map((id) => <StepRow key={id} id={id} current={current} onGo={onGo} lang={lang} />)}
      </div>
    </nav>
  )
}

/* ── Treatment 3 · Unified spine ──────────────────────────────────────── */

function NavSpine({ current, onGo, lang }) {
  return (
    <nav className="nav">
      <p className="nav-cap">{t(UI.whereYouAre, lang)}</p>
      <div className="spine">
        {ACTS.map((act) => {
          const as = actStatus(act, current)
          const pr = actProgress(act, current)
          return (
            <div key={act.id} className={'spine-act spine-' + as}>
              <button type="button" className="spine-node" onClick={() => onGo(act.steps[0])}>
                <span className={'spine-dot spine-dot-' + as}>{as === 'done' ? '✓' : act.num}</span>
                <span className="spine-actlabel">
                  <span className="spine-phase">{t(act.phase, lang)}</span>
                  {t(act.label, lang)}
                  {as !== 'current' && <span className="spine-count">{as === 'done' ? t(UI.done, lang) : `${pr.total}`}</span>}
                </span>
              </button>
              {as === 'current' && (
                <div className="spine-steps">
                  {act.steps.map((id) => <StepRow key={id} id={id} current={current} onGo={onGo} lang={lang} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

/* ── Right rail · persistent render anchor + live range ───────────────── */

function RenderCard({ lang }) {
  return (
    <div className="rcard">
      <RenderTile ratio="4 / 3" label={t({ en: 'Your concept', hr: 'Vaš koncept' }, lang)} small />
      <div className="rcard-cap">
        <p className="rcard-t">{t({ en: 'Your kitchen', hr: 'Vaša kuhinja' }, lang)}</p>
        <p className="rcard-s">{t({ en: 'L-shape · 380 × 320 cm', hr: 'L-oblik · 380 × 320 cm' }, lang)}</p>
      </div>
    </div>
  )
}

function RangeCard({ current, lang }) {
  const r = rangeAt(current)
  if (!r) return null
  const seam = current === 'counted'
  const fill = Math.max(8, Math.min(100, ((26 - r.pct) / 14) * 100))
  return (
    <div className={'range' + (seam ? ' range-fresh' : '')}>
      <p className="range-cap">{t(UI.estimate, lang)}</p>
      <div className="range-nums">
        <span>{eur(r.low, lang)}</span>
        <span className="range-dash">–</span>
        <span>{eur(r.high, lang)}</span>
      </div>
      <div className="range-meter"><span style={{ width: `${fill}%` }} /></div>
      <p className="range-band">± {r.pct}% · {t(UI.sharpens, lang)}</p>
      <p className="range-note">{t(UI.estimateNote, lang)}</p>
    </div>
  )
}

function RightRail({ current, lang }) {
  const hasRender = stepIndex(current) >= stepIndex('render')
  const hasRange = !!rangeAt(current)
  return (
    <aside className="right">
      {hasRender ? <RenderCard lang={lang} /> : (
        <div className="rplaceholder">
          {t({ en: 'Your concept render and live price range will live here — always in view.', hr: 'Vaš koncept i živi raspon cijene bit će ovdje — stalno vidljivi.' }, lang)}
        </div>
      )}
      {hasRange && <RangeCard current={current} lang={lang} />}
    </aside>
  )
}

/* ── Footer (Back / Continue) ─────────────────────────────────────────── */

function Footer({ current, onGo, lang }) {
  const prev = prevStep(current)
  const next = nextStep(current)
  const s = STEPS[current]
  const label = s.seam ? UI.begin : s.terminal ? UI.send : UI.continue
  return (
    <div className="footer">
      <button type="button" className="btn btn-ghost" disabled={!prev} onClick={() => prev && onGo(prev)}>
        ← {t(UI.back, lang)}
      </button>
      <button type="button" className={'btn btn-primary' + (s.seam ? ' btn-seam' : '')}
        onClick={() => next && onGo(next)} disabled={!next}>
        {t(label, lang)} {!s.terminal && '→'}
      </button>
    </div>
  )
}

/* ── Desktop shell ────────────────────────────────────────────────────── */

function DesktopShell({ treatment, current, onGo, lang }) {
  const showTop = treatment === 'top'
  let LeftNav = NavRail
  if (treatment === 'top') LeftNav = NavSteps
  if (treatment === 'spine') LeftNav = NavSpine
  return (
    <div className="shell">
      <div className="shell-brand">
        <span className="brand-mark" />
        <span className="brand-name">softclose</span>
        <span className="brand-sub">{t({ en: 'kitchen brief', hr: 'sažetak kuhinje' }, lang)}</span>
      </div>
      {showTop && <TopActs current={current} onGo={onGo} lang={lang} />}
      <div className="cols">
        <div className="col-left"><LeftNav current={current} onGo={onGo} lang={lang} /></div>
        <main className="col-mid">
          <div className="body-anim" key={current}>
            <Body lang={lang} id={current} />
            <Footer current={current} onGo={onGo} lang={lang} />
          </div>
        </main>
        <div className="col-right"><RightRail current={current} lang={lang} /></div>
      </div>
    </div>
  )
}

/* ── Mobile shell (shell + builder) ───────────────────────────────────── */

function MobileShell({ current, onGo, lang }) {
  const [sheet, setSheet] = useStateS(false)
  const [rangeOpen, setRangeOpen] = useStateS(false)
  const act = actOf(current)
  const pr = actProgress(act, current)
  const idxInAct = act.steps.indexOf(current) + 1
  const r = rangeAt(current)
  return (
    <div className="mshell">
      {/* top bar: thumbnail + progress pill */}
      <div className="mtop">
        {stepIndex(current) >= stepIndex('render')
          ? <div className="mthumb"><RenderTile ratio="1 / 1" /></div>
          : <span className="brand-mark" />}
        <button type="button" className="mpill" onClick={() => setSheet(true)}>
          <span className="mpill-act">{t(act.phase, lang)} · {t(act.label, lang)}</span>
          <span className="mpill-step">{t(STEPS[current].label, lang)} · {idxInAct}/{pr.total} ▾</span>
        </button>
      </div>

      {/* body */}
      <main className="mbody">
        <div className="body-anim" key={current}>
          <Body lang={lang} id={current} />
        </div>
      </main>

      {/* bottom: live range bar + nav buttons */}
      {r && (
        <button type="button" className="mrange" onClick={() => setRangeOpen((v) => !v)}>
          <span className="mrange-l">{t(UI.estimate, lang)}</span>
          <span className="mrange-v">{eur(r.low, lang)} – {eur(r.high, lang)}</span>
          <span className="mrange-b">± {r.pct}%</span>
        </button>
      )}
      {rangeOpen && r && (
        <div className="mrange-exp">{t(UI.estimateNote, lang)}</div>
      )}
      <div className="mfoot">
        <button type="button" className="btn btn-ghost" disabled={!prevStep(current)} onClick={() => onGo(prevStep(current))}>←</button>
        <button type="button" className={'btn btn-primary' + (STEPS[current].seam ? ' btn-seam' : '')}
          disabled={!nextStep(current)} onClick={() => onGo(nextStep(current))}>
          {t(STEPS[current].seam ? UI.begin : STEPS[current].terminal ? UI.send : UI.continue, lang)} →
        </button>
      </div>

      {/* bottom sheet nav */}
      {sheet && (
        <div className="msheet-scrim" onClick={() => setSheet(false)}>
          <div className="msheet" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grab" />
            <p className="nav-cap">{t(UI.yourBrief, lang)}</p>
            <div className="rail">
              {ACTS.map((a) => {
                const as = actStatus(a, current)
                const p = actProgress(a, current)
                return (
                  <div key={a.id} className={'rail-act rail-' + as}>
                    <button type="button" className="rail-acthead" onClick={() => { onGo(a.steps[0]); setSheet(false) }}>
                      <span className="rail-num">{a.num}</span>
                      <span className="rail-actlabel">{t(a.label, lang)}</span>
                      {as === 'done' ? <span className="rail-check">✓</span> : <span className="rail-count">{p.done}/{p.total}</span>}
                    </button>
                    {as === 'current' && (
                      <div className="rail-steps">
                        {a.steps.map((id) => <StepRow key={id} id={id} current={current} lang={lang}
                          onGo={(x) => { onGo(x); setSheet(false) }} />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

Object.assign(window, { DesktopShell, MobileShell })
