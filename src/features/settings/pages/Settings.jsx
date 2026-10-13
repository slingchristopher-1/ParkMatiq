import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, saveProfile, clearAllData, getSettings, saveSettings } from '../../../services/storage'
import { supabase, backendEnabled } from '../../../services/backend/supabase'
import { deleteAccount, logout } from '../../../services/backend/sync'
import { normalizePlate, isValidPlate, formatPlate } from '../../../utils/plate'
import { vehicleList } from '../../../utils/vehicles'
import PlateBadge from '../../../components/common/PlateBadge'
import { exportData } from '../../../utils/dataExport'
import { currentTheme, setTheme } from '../../../utils/theme'
import BottomNav from '../../../components/layout/BottomNav'
import PermitZones from '../components/PermitZones'
import { IconUser, IconMail } from '../../../components/common/Icons'

export default function Settings() {
  const navigate = useNavigate()
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [vehicles, setVehicles] = useState([])
  const [newPlate, setNewPlate] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editing, setEditing] = useState(null) // { plate, draft } while renaming
  const [saved, setSaved] = useState(false)
  const [plateErr, setPlateErr] = useState('')
  const [locationOn, setLocationOn] = useState(false)
  const [locBlocked, setLocBlocked] = useState(false)
  const [darkOn, setDarkOn] = useState(false)
  const [budget, setBudget] = useState('')
  const [maxDaily, setMaxDaily] = useState('')
  const [permitZones, setPermitZones] = useState([])
  const [endPref, setEndPref] = useState('balanced')
  // Alleen echt ingelogde accounts (geen gastmodus) krijgen de account-UI.
  const [signedIn, setSignedIn] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [accountMsg, setAccountMsg] = useState('')
  const [dataMsg, setDataMsg] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)

  useEffect(() => {
    if (backendEnabled) {
      supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
    }
  }, [])

  useEffect(() => {
    const p = getProfile()
    if (!p) { navigate('/login', { replace: true }); return }
    setName(p.name)
    setEmail(p.email || '')
    const s = getSettings()
    setVehicles(vehicleList(p, s))
    setLocationOn(s.location)
    setBudget(s.monthlyBudget || '')
    setMaxDaily(s.maxDailyCost || '')
    setPermitZones(s.permitZones || [])
    setEndPref(s.endPreference || 'balanced')
    setDarkOn(currentTheme() === 'dark')
  }, [])

  function toggleDark() {
    const next = darkOn ? 'light' : 'dark'
    setDarkOn(!darkOn)
    setTheme(next)
  }

  function handleBudget(v) {
    setBudget(v)
    saveSettings({ monthlyBudget: v.trim() })
  }

  function handleMaxDaily(v) {
    setMaxDaily(v)
    saveSettings({ maxDailyCost: v.trim() })
  }

  function handlePermitZones(next) {
    setPermitZones(next)
    saveSettings({ permitZones: next })
  }

  function handleEndPref(v) {
    setEndPref(v)
    saveSettings({ endPreference: v })
  }

  async function toggleLocation() {
    if (locationOn) {
      saveSettings({ location: false })
      setLocationOn(false)
      return
    }
    // Turning on: trigger the browser's own location prompt. A web app can't
    // grant OS/browser permission itself — if the browser blocks it, say so.
    const granted = await new Promise(resolve => {
      if (!navigator.geolocation) return resolve(false)
      navigator.geolocation.getCurrentPosition(
        () => resolve(true), () => resolve(false), { timeout: 8000 }
      )
    })
    if (granted) {
      saveSettings({ location: true })
      setLocationOn(true)
      setLocBlocked(false)
    } else {
      setLocBlocked(true)
    }
  }

  function handleSave() {
    if (!name.trim()) return
    const profile = { name: name.trim(), plate: getProfile().plate }
    if (email.trim()) profile.email = email.trim()
    saveProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Vehicles save immediately, like the other preferences. The main vehicle is
  // the profile's plate (see utils/vehicles.js), so changing it rewrites that.
  function persistVehicles(list, mainPlate) {
    saveSettings({ vehicles: list })
    const p = getProfile()
    if (mainPlate !== p.plate) saveProfile({ ...p, plate: mainPlate })
    setVehicles(vehicleList(getProfile(), getSettings()))
  }

  function addVehicle() {
    if (!isValidPlate(newPlate)) { setPlateErr('Dat lijkt geen geldig Nederlands kenteken'); return }
    const plate = normalizePlate(newPlate)
    if (vehicles.some(v => v.plate === plate)) { setPlateErr('Dit kenteken staat er al tussen'); return }
    persistVehicles([...vehicles, { plate, label: newLabel.trim() }], vehicles[0].plate)
    setNewPlate('')
    setNewLabel('')
    setPlateErr('')
  }

  // Renaming saves on Enter or when the field loses focus; Escape cancels.
  function saveLabel() {
    if (!editing) return
    const label = editing.draft.trim()
    setEditing(null)
    const list = vehicles.map(v => v.plate === editing.plate ? { ...v, label } : v)
    persistVehicles(list, vehicles[0].plate)
  }

  function removeVehicle(plate) {
    if (!window.confirm('Dit voertuig verwijderen? Eerdere sessies en bonnen blijven bewaard.')) return
    const rest = vehicles.filter(v => v.plate !== plate)
    persistVehicles(rest, rest[0].plate)
  }

  async function handleClear() {
    const msg = signedIn
      ? 'Weet je zeker dat je je account en alle data wilt verwijderen? Dit verwijdert ook alles op de server en kan niet ongedaan worden gemaakt.'
      : 'Weet je zeker dat je alle data wilt verwijderen? Dit kan niet ongedaan worden gemaakt.'
    if (!window.confirm(msg)) return
    if (backendEnabled) {
      // AVG/GDPR: serververwijdering moet echt lukken — bij een fout laten we
      // de lokale data staan en melden we dat er niets is verwijderd.
      try {
        await deleteAccount()
      } catch (e) {
        window.alert(`Verwijderen op de server is mislukt (${e.message}). Er is niets verwijderd; probeer het later opnieuw.`)
        return
      }
    }
    clearAllData()
    navigate('/login', { replace: true })
  }

  function handleExport() {
    const count = exportData()
    setDataMsg(`Bestand gedownload met ${count} parkeersessie${count === 1 ? '' : 's'}.`)
  }

  async function handlePassword() {
    if (newPassword.length < 8) { setAccountMsg('Kies een wachtwoord van minstens 8 tekens.'); return }
    setAccountBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setAccountBusy(false)
    setNewPassword('')
    setAccountMsg(error ? `Wijzigen mislukt: ${error.message}` : 'Je wachtwoord is gewijzigd.')
  }

  // Supabase mailt een bevestiging naar het nieuwe adres; pas na die link
  // verandert het inlogadres. Het profiel volgt zodra de wijziging rond is.
  async function handleEmail() {
    if (!newEmail.trim()) { setAccountMsg('Vul een nieuw e-mailadres in.'); return }
    setAccountBusy(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setAccountBusy(false)
    if (error) { setAccountMsg(`Wijzigen mislukt: ${error.message}`); return }
    setNewEmail('')
    setAccountMsg('Bevestig de wijziging via de link in je nieuwe mailbox.')
  }

  async function handleLogout() {
    if (!window.confirm('Uitloggen? Lokale gegevens op dit apparaat worden gewist; bij je volgende login worden ze weer van de server geladen.')) return
    await logout()
    clearAllData()
    navigate('/login', { replace: true })
  }

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Instellingen</h1>
      </header>

      <div className="content">

        <div className="card">
          <h2 className="card-title">Profiel</h2>

          <div className="form-group">
            <label>Naam</label>
            <div className="input-row">
              <IconUser size={17} />
              <input
                value={name}
                onChange={e => { setName(e.target.value); setSaved(false) }}
                placeholder="Je naam"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="form-group">
            <label>E-mailadres</label>
            <div className="input-row">
              <IconMail size={17} />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setSaved(false) }}
                placeholder="E-mailadres (optioneel)"
                autoComplete="email"
                disabled={signedIn && !!email}
              />
            </div>
            {signedIn && !!email && (
              <span className="field-hint">Dit is je inlog-e-mailadres; wijzig het bij Account.</span>
            )}
          </div>

          <button className="btn btn-yellow" onClick={handleSave}>
            {saved ? '✓  Opgeslagen' : 'Opslaan'}
          </button>
        </div>

        <div className="card">
          <h2 className="card-title">Voertuigen</h2>
          <ul className="vehicle-list">
            {vehicles.map((v, i) => (
              <li key={v.plate} className="vehicle-item">
                {/* Name sits under the plate so the actions never squeeze it out. */}
                <div className="vehicle-item-id">
                  <PlateBadge plate={v.plate} />
                  {editing?.plate === v.plate ? (
                    <input
                      className="vehicle-item-input"
                      value={editing.draft}
                      onChange={e => setEditing({ plate: v.plate, draft: e.target.value })}
                      onBlur={saveLabel}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      placeholder="Naam, bv. Leaseauto"
                      maxLength={30}
                      aria-label={`Naam voor ${formatPlate(v.plate)}`}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="vehicle-item-label"
                      onClick={() => setEditing({ plate: v.plate, draft: v.label || '' })}
                      aria-label={`Naam wijzigen voor ${formatPlate(v.plate)}`}
                    >
                      {i === 0 && <span className="vehicle-item-main">Hoofdvoertuig</span>}
                      {v.label
                        ? <span>{v.label}</span>
                        : <span className="vehicle-item-placeholder">Naam toevoegen</span>}
                    </button>
                  )}
                </div>
                {/* While renaming, the field gets the whole row. */}
                {editing?.plate !== v.plate && i > 0 && (
                  <button className="vehicle-item-btn" onClick={() => persistVehicles(vehicles, v.plate)}>
                    Maak hoofd
                  </button>
                )}
                {editing?.plate !== v.plate && vehicles.length > 1 && (
                  <button className="vehicle-item-btn" onClick={() => removeVehicle(v.plate)}>
                    Verwijder
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="form-group">
            <label>Voertuig toevoegen</label>
            <div className="input-row input-plate">
              <span className="plate-strip">NL</span>
              <input
                value={newPlate}
                onChange={e => { setNewPlate(e.target.value.toUpperCase()); setPlateErr('') }}
                placeholder="AB-123-C"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Kenteken"
              />
            </div>
          </div>
          <div className="form-group">
            <div className="input-row">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Naam (optioneel), bv. Leaseauto"
                maxLength={30}
                aria-label="Naam voertuig"
              />
            </div>
          </div>

          {plateErr && <p className="form-error">{plateErr}</p>}

          <button className="btn btn-ghost btn-sm" onClick={addVehicle} disabled={!newPlate.trim()}>
            Toevoegen
          </button>
        </div>

        <div className="card">
          <h2 className="card-title">Toestemmingen</h2>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Locatie</span>
              <span className="toggle-desc">
                Gebruik je locatie om je parkeerplek op de kaart te tonen.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={locationOn}
              aria-label="Locatie"
              className={`switch ${locationOn ? 'switch-on' : ''}`}
              onClick={toggleLocation}
            >
              <span className="switch-knob" />
            </button>
          </div>
          {locBlocked && (
            <p className="card-desc" style={{ marginTop: 12, marginBottom: 0 }}>
              Locatie is geblokkeerd in je browserinstellingen. Schakel het daar in
              om deze functie te gebruiken.
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Weergave</h2>
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-label">Donkere modus</span>
              <span className="toggle-desc">Pas de app aan de nacht aan.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={darkOn}
              aria-label="Donkere modus"
              className={`switch ${darkOn ? 'switch-on' : ''}`}
              onClick={toggleDark}
            >
              <span className="switch-knob" />
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Voorkeuren</h2>

          <div className="form-group">
            <label>Maandbudget (€)</label>
            <div className="input-row">
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={e => handleBudget(e.target.value)}
                placeholder="bijv. 40"
              />
            </div>
            <span className="field-hint">Leeg = geen budget. Je voortgang staat bij Geschiedenis.</span>
          </div>

          <div className="form-group">
            <label>Maximum per dag (€)</label>
            <div className="input-row">
              <input
                type="text"
                inputMode="decimal"
                value={maxDaily}
                onChange={e => handleMaxDaily(e.target.value)}
                placeholder="bijv. 15"
              />
            </div>
            <span className="field-hint">
              Boven dit bedrag lopen de kosten van een dag niet verder op. Heeft de zone
              zelf een lager dagtarief, dan geldt dat. Leeg = geen maximum.
            </span>
          </div>

          <PermitZones zones={permitZones} onChange={handlePermitZones} />

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Sessie stoppen</label>
            <div className="seg-control">
              {[
                ['balanced', 'Gebalanceerd'],
                ['eager',    'Elke cent'],
                ['manual',   'Handmatig'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  className={`seg-opt${endPref === val ? ' seg-opt-active' : ''}`}
                  onClick={() => handleEndPref(val)}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <span className="field-hint">
              {{
                balanced: 'Na een minuut rijden vragen we of je de sessie wilt stoppen.',
                eager:    'Zodra je wegrijdt vragen we of je de sessie wilt stoppen.',
                manual:   'We vragen het nooit; je stopt de sessie zelf.',
              }[endPref]}
            </span>
          </div>
        </div>

        {signedIn && (
          <div className="card">
            <h2 className="card-title">Account</h2>
            <p className="card-desc">Je gegevens worden gesynchroniseerd met je account.</p>

            <div className="form-group">
              <label>Nieuw wachtwoord</label>
              <div className="input-row">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setAccountMsg('') }}
                  placeholder="Minstens 8 tekens"
                  autoComplete="new-password"
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handlePassword} disabled={accountBusy}>
                Wachtwoord wijzigen
              </button>
            </div>

            <div className="form-group">
              <label>Inlog-e-mailadres wijzigen</label>
              <div className="input-row">
                <IconMail size={17} />
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => { setNewEmail(e.target.value); setAccountMsg('') }}
                  placeholder={email || 'Nieuw e-mailadres'}
                  autoComplete="email"
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleEmail} disabled={accountBusy}>
                E-mailadres wijzigen
              </button>
              <span className="field-hint">
                Je krijgt een bevestigingsmail op het nieuwe adres. Het oude adres blijft
                werken tot je die link opent.
              </span>
            </div>

            {accountMsg && <p className="form-hint">{accountMsg}</p>}

            <button className="btn btn-ghost" onClick={handleLogout}>
              Uitloggen
            </button>
          </div>
        )}

        <div className="card">
          <h2 className="card-title">Jouw gegevens</h2>
          <p className="card-desc">
            Download alles wat de app van je bewaart — profiel, instellingen en
            parkeergeschiedenis — als JSON-bestand.
          </p>
          <button className="btn btn-ghost" onClick={handleExport}>
            Download mijn gegevens
          </button>
          {dataMsg && <p className="form-hint">{dataMsg}</p>}
          <button className="btn btn-ghost" onClick={() => navigate('/privacy')}>
            Privacy en gegevens
          </button>
        </div>

        <div className="card card-danger">
          <h2 className="card-title">Gegevens verwijderen</h2>
          <p className="card-desc">
            {signedIn
              ? 'Verwijdert je account, profiel, kenteken en alle parkeergeschiedenis — ook op de server.'
              : 'Verwijdert je profiel, kenteken en alle parkeergeschiedenis.'}
          </p>
          <button className="btn-red-outline" onClick={handleClear}>
            {signedIn ? 'Verwijder account en alle data' : 'Verwijder alle data'}
          </button>
        </div>

      </div>

      <BottomNav active="settings" />
    </div>
  )
}
