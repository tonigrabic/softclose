/* ──────────────────────────────────────────────────────────────────────────
   Prototype controller: live switches for language (HR/EN), nav treatment, and
   device. Wraps the shell in browser / phone chrome so it reads as in-product.
   ────────────────────────────────────────────────────────────────────────── */

const { useState: useStateA } = React

const TREATMENTS = [
  { id: 'rail', tab: 'Rail', name: 'Two-level rail', note: 'Acts stack in the left rail; the active act expands into its steps. Closest to today’s “Your brief”.' },
  { id: 'top', tab: 'Top', name: 'Acts on top', note: 'Macro on a top bar, micro on the side — the two grains never share a column.' },
  { id: 'spine', tab: 'Spine', name: 'Unified spine', note: 'One continuous timeline from photo to offer. The chrome literally never changes.' },
]

function Segmented({ options, value, onChange, small }) {
  return (
    <div className={'seg' + (small ? ' seg-sm' : '')}>
      {options.map((o) => (
        <button key={o.id} type="button"
          className={'seg-btn' + (value === o.id ? ' seg-on' : '')}
          onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function BrowserChrome({ children, lang }) {
  return (
    <div className="chrome">
      <div className="chrome-bar">
        <span className="dot dot-r" /><span className="dot dot-y" /><span className="dot dot-g" />
        <div className="chrome-url">softclose.app/brief</div>
        <span className="chrome-lang">{lang === 'hr' ? 'hr-HR' : 'en'}</span>
      </div>
      <div className="chrome-body">{children}</div>
    </div>
  )
}

function PhoneChrome({ children }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">{children}</div>
    </div>
  )
}

function ProtoApp() {
  const [lang, setLang] = useStateA('en')
  const [treatment, setTreatment] = useStateA('rail')
  const [device, setDevice] = useStateA('desktop')
  const [current, setCurrent] = useStateA('counted')

  const onGo = (id) => { if (id) setCurrent(id) }
  const tNote = TREATMENTS.find((x) => x.id === treatment)

  return (
    <div className="proto">
      {/* control bar */}
      <div className="controls">
        <div className="ctl">
          <span className="ctl-label">Language</span>
          <Segmented value={lang} onChange={setLang} options={[{ id: 'en', label: 'EN' }, { id: 'hr', label: 'HR' }]} small />
        </div>
        <div className="ctl">
          <span className="ctl-label">Device</span>
          <Segmented value={device} onChange={setDevice} options={[{ id: 'desktop', label: 'Desktop' }, { id: 'mobile', label: 'Mobile' }]} small />
        </div>
        <div className={'ctl ctl-grow' + (device === 'mobile' ? ' ctl-dim' : '')}>
          <span className="ctl-label">Nav model</span>
          <Segmented value={treatment} onChange={setTreatment}
            options={TREATMENTS.map((x) => ({ id: x.id, label: x.tab }))} />
        </div>
        <button type="button" className="ctl-jump" onClick={() => setCurrent('confirm')}>
          ⤺ Replay the seam
        </button>
      </div>

      {/* treatment caption */}
      <p className="treat-note">
        {device === 'mobile'
          ? 'Mobile collapses all three models into one: a progress pill that opens the two-level nav, and a live-range bar pinned to the bottom.'
          : <><b>{tNote.name}.</b> {tNote.note}</>}
      </p>

      {/* the framed prototype */}
      <div className="stage">
        {device === 'desktop'
          ? <BrowserChrome lang={lang}><DesktopShell treatment={treatment} current={current} onGo={onGo} lang={lang} /></BrowserChrome>
          : <PhoneChrome><MobileShell current={current} onGo={onGo} lang={lang} /></PhoneChrome>}
      </div>

      <p className="stage-hint">
        Click any step in the nav, or use <b>Continue</b>. Start of Act 1 sits before the render exists; the seam is <b>“What we counted”</b>, where the range first appears.
      </p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('proto-root')).render(<ProtoApp />)
