import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, getSettings, saveSettings } from '../../../services/storage'
import { requestPermission } from '../../../services/notifications'

const STEPS = 6

// Inline icons (stroke style, no emoji) ------------------------------------
const Ic = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const PinIcon  = <Ic d={<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></>} />
const BellIcon = <Ic d={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>} />
const CardIcon = <Ic d={<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>} />
const BtIcon   = <Ic d={<path d="M7 7l10 10-5 4V3l5 4L7 17"/>} />
const CheckIcon = <Ic d={<path d="M20 6 9 17l-5-5"/>} size={16} />

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // collected state
  const [locationOn, setLocationOn] = useState(getSettings().location)
  const [notifOn, setNotifOn]       = useState(false)
  const [payOn, setPayOn]           = useState(false)
  const [permitOn, setPermitOn]     = useState(false)
  const [budgetOn, setBudgetOn]     = useState(false)
  const [budget, setBudget]         = useState('')
  const [endPref, setEndPref]       = useState('balanced')

  if (!getProfile()) { navigate('/login', { replace: true }); return null }

  async function toggleLocation() {
    if (locationOn) { setLocationOn(false); return }
    const granted = await new Promise(res => {
      if (!navigator.geolocation) return res(false)
      navigator.geolocation.getCurrentPosition(() => res(true), () => res(false), { timeout: 8000 })
    })
    setLocationOn(granted)
  }
  async function toggleNotif() {
    if (notifOn) { setNotifOn(false); return }
    const granted = await requestPermission()
    setNotifOn(granted)
  }

  function finish() {
    saveSettings({
      onboardingDone: true,
      location: locationOn,
      paymentConnected: payOn,
      // The zone(s) the permit covers are picked in Settings — a permit is tied
      // to a parking zone, which we can only match against the RDW zone data.
      permitZones: [],
      monthlyBudget: budgetOn ? budget.trim() : '',
      endPreference: endPref,
    })
    navigate('/', { replace: true })
  }

  const next = () => (step < STEPS - 1 ? setStep(step + 1) : finish())
  const back = () => step > 0 && setStep(step - 1)

  return (
    <div className="screen onboarding">
      <div className="ob-progress">
        {Array.from({ length: STEPS }, (_, i) => (
          <div key={i} className={`ob-seg${i <= step ? ' on' : ''}`} />
        ))}
      </div>

      <div className="ob-body">
        {step === 0 && (
          <>
            <div className="ob-hero">
              <div className="loop-stage">
                <div className="loop-ring" />
                <div className="loop-car">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M5 13h14v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/></svg>
                </div>
                <div className="loop-chip c1">{PinIcon} Geparkeerd</div>
                <div className="loop-chip c2">{CheckIcon} Gestopt</div>
                <div className="loop-chip c3 mono">€2,10</div>
              </div>
            </div>
            <h1 className="ob-title">Parkeren dat oplet, zodat jij dat niet hoeft.</h1>
            <p className="ob-text">ParkMatiq merkt wanneer je parkeert, start de meter voor je en stopt zodra je wegrijdt — je betaalt alleen de minuten die je echt gebruikt.</p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="ob-title">Een paar toestemmingen</h1>
            <p className="ob-text">Deze maken het automatisch detecteren mogelijk. ParkMatiq volgt je niet op de achtergrond buiten parkeermomenten.</p>
            <ObRow icon={PinIcon} title="Locatie" sub="Herken parkeerzone & tarief" on={locationOn} onToggle={toggleLocation} />
            <ObRow icon={BellIcon} title="Meldingen" sub="Bevestigingen & verloop-alerts" on={notifOn} onToggle={toggleNotif} />
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="ob-title">Verbind je essentials</h1>
            <p className="ob-text">Tik om te koppelen. Een betaalmethode laat ParkMatiq de meter direct betalen.</p>
            <ConnectRow color="#1a1f36" label="Betaalmethode" sub="Kaart · ●●●● 4291" icon={CardIcon} done={payOn} onTap={() => setPayOn(true)} />
            {/* A web app can't see the car's Bluetooth; this needs the native app. */}
            <ConnectRow color="#0a7d33" label="Bluetooth" sub="Detectie van wegrijden · komt met de app-versie" icon={BtIcon} soon />
            <p className="ob-note">Demo — de echte betaal- en Bluetooth-koppeling komt bij de livegang.</p>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="ob-title">Maak het van jou</h1>
            <p className="ob-text">Zet aan wat voor jou geldt. Actieve opties vragen om een detail.</p>

            <div className="ob-toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Ik heb een bewonersvergunning</span>
                <span className="toggle-desc">Geen kosten in je vergunningsgebied</span>
              </div>
              <Switch on={permitOn} onToggle={() => setPermitOn(v => !v)} label="Bewonersvergunning" />
            </div>
            <div className={`inline-input-wrap${permitOn ? ' open' : ''}`}>
              <p className="ob-text" style={{ margin: 0 }}>
                Kies straks bij Instellingen de parkeerzone van je vergunning — een
                vergunning geldt per zone, niet per postcode.
              </p>
            </div>

            <div className="ob-toggle-row">
              <div className="toggle-info">
                <span className="toggle-label">Maandbudget instellen</span>
                <span className="toggle-desc">Waarschuw me voor ik te veel uitgeef</span>
              </div>
              <Switch on={budgetOn} onToggle={() => setBudgetOn(v => !v)} label="Maandbudget" />
            </div>
            <div className={`inline-input-wrap${budgetOn ? ' open' : ''}`}>
              <input className="ob-input mono" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Budget in € bijv. 40" />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="ob-title">Wanneer stoppen we sessies?</h1>
            <p className="ob-text">ParkMatiq vraagt altijd voor het stoppen — dit bepaalt hoe snel het dat voorstelt.</p>
            <RadioOpt sel={endPref === 'balanced'} onPick={() => setEndPref('balanced')} title="Gebalanceerd" sub="Bevestig na wegrijden, korte wachttijd" />
            <RadioOpt sel={endPref === 'eager'} onPick={() => setEndPref('eager')} title="Elke cent sparen" sub="Stel stoppen voor zodra ik vertrek" />
            <RadioOpt sel={endPref === 'manual'} onPick={() => setEndPref('manual')} title="Nooit automatisch" sub="Alleen stoppen als ik er zelf op tik" />
          </>
        )}

        {step === 5 && (
          <>
            <div className="ob-hero">
              <div className="ob-done-badge">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
            </div>
            <h1 className="ob-title">Je bent klaar.</h1>
            <p className="ob-text">Parkeer ergens in een ParkMatiq-stad en wij nemen het over. Dit is jouw instelling:</p>
            <div className="card" style={{ marginBottom: 0 }}>
              <SummaryItem on={locationOn} text="Automatisch parkeren detecteren" offText="Automatisch detecteren (locatie uit)" />
              <SummaryItem on={notifOn} text="Verloop-herinneringen actief" offText="Verloop-herinneringen (meldingen uit)" />
              <SummaryItem
                on={endPref !== 'manual'}
                text={endPref === 'eager' ? 'Stoppen voorstellen zodra je wegrijdt' : 'Bevestigen voor stoppen'}
                offText="Alleen handmatig stoppen"
              />
            </div>
          </>
        )}
      </div>

      <div className="ob-nav">
        {step > 0 && <button className="btn btn-ghost" onClick={back}>Terug</button>}
        <button className="btn btn-yellow" onClick={next}>
          {step === 0 ? 'Beginnen' : step === STEPS - 1 ? 'Naar ParkMatiq' : 'Doorgaan'}
        </button>
      </div>
    </div>
  )
}

// --- small building blocks -------------------------------------------------
function Switch({ on, onToggle, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      className={`switch${on ? ' switch-on' : ''}`} onClick={onToggle}>
      <span className="switch-knob" />
    </button>
  )
}

function ObRow({ icon, title, sub, on, onToggle }) {
  return (
    <div className="card ob-perm-row">
      <span className="ob-row-icon">{icon}</span>
      <div className="toggle-info">
        <span className="toggle-label">{title}</span>
        <span className="toggle-desc">{sub}</span>
      </div>
      <Switch on={on} onToggle={onToggle} label={title} />
    </div>
  )
}

function ConnectRow({ color, label, sub, icon, done, onTap, soon }) {
  return (
    <button className={`connect-row${done ? ' done' : ''}`} onClick={onTap} type="button" disabled={soon}>
      <span className="connect-logo" style={{ background: color }}>{icon}</span>
      <div className="connect-txt">
        <span className="toggle-label">{label}</span>
        <span className="toggle-desc">{sub}</span>
      </div>
      <span className="connect-status">{soon ? 'Binnenkort' : done ? '✓ Verbonden' : 'Verbind'}</span>
    </button>
  )
}

function RadioOpt({ sel, onPick, title, sub }) {
  return (
    <button className={`radio-opt${sel ? ' sel' : ''}`} onClick={onPick} type="button">
      <span className="radio-dot" />
      <span className="radio-txt">
        <span className="radio-label">{title}</span>
        <span className="radio-sub">{sub}</span>
      </span>
    </button>
  )
}

function SummaryItem({ on = true, text, offText }) {
  return (
    <div className={`ob-summary-item${on ? '' : ' off'}`}>
      <span className="ob-chk">
        {on
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>}
      </span>
      {on ? text : (offText || text)}
    </div>
  )
}
