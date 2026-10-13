import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { saveProfile, hasUnclaimedParkingData, clearParkingData } from '../../../services/storage'
import { supabase, backendEnabled } from '../../../services/backend/supabase'
import { pushAll } from '../../../services/backend/sync'
import { normalizePlate, isValidPlate } from '../../../utils/plate'
import { IconMail, IconLock, IconUser, IconEye, IconEyeOff } from '../../../components/common/Icons'

function signUpErrorNL(error) {
  const msg = error?.message || ''
  if (msg.includes('already registered')) return 'Er bestaat al een account met dit e-mailadres'
  if (msg.includes('at least 6 characters')) return 'Wachtwoord moet minimaal 6 tekens zijn'
  if (msg.includes('invalid format')) return 'Dat lijkt geen geldig e-mailadres'
  return `Registreren mislukt: ${msg}`
}

export default function Register() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const guest = params.get('guest') === '1'

  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [plate,    setPlate]    = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)
  // Al ingelogd maar (nog) geen profiel op de server — bv. na registratie met
  // e-mailbevestiging aan, waar de eerste sync nooit liep. Dan alleen naam +
  // kenteken vragen; e-mail/wachtwoord zijn al bekend bij Supabase Auth.
  const [sessionEmail, setSessionEmail] = useState(null)
  const completing = !!sessionEmail && !guest

  useEffect(() => {
    if (backendEnabled) {
      supabase.auth.getSession().then(({ data }) => {
        setSessionEmail(data.session?.user?.email ?? null)
      })
    }
  }, [])

  // Parkeergegevens die al op dit apparaat staan kunnen van vóór dit account
  // zijn (gastmodus op een geleende telefoon). pushAll() zou ze naar de server
  // van dit nieuwe account sturen, dus eerst vragen — en bij nee weggooien.
  function claimLocalParkingData() {
    if (!hasUnclaimedParkingData()) return
    const mine = window.confirm(
      'Op dit apparaat staat parkeergeschiedenis van vóór dit account.\n\n' +
      'Meenemen naar je account? Kies Annuleren als die niet van jou is — ' +
      'de geschiedenis wordt dan van dit apparaat gewist.'
    )
    if (!mine) clearParkingData()
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Vul je naam in'); return }
    if (!guest && !completing) {
      if (!email.trim())    { setError('Vul je e-mailadres in'); return }
      if (!password.trim()) { setError('Vul een wachtwoord in'); return }
    }
    if (!plate.trim())      { setError('Vul je kenteken in'); return }
    if (!isValidPlate(plate)) { setError('Dat lijkt geen geldig Nederlands kenteken'); return }

    // Het wachtwoord gaat alleen naar Supabase Auth (bcrypt-hash aan de
    // serverkant); wij slaan het zelf nergens op. Gastmodus blijft lokaal.
    const profile = { name: name.trim(), plate: normalizePlate(plate) }
    if (completing) profile.email = sessionEmail
    else if (!guest && email.trim()) profile.email = email.trim()

    if (completing) {
      setBusy(true)
      claimLocalParkingData()
      saveProfile(profile)
      await pushAll()
      setBusy(false)
      navigate('/', { replace: true })
      return
    }

    if (backendEnabled && !guest) {
      setBusy(true)
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (err) {
        setBusy(false)
        setError(signUpErrorNL(err))
        return
      }
      saveProfile(profile)
      if (data.session) {
        // Direct ingelogd (e-mailbevestiging uit): seed de server met dit device.
        claimLocalParkingData()
        await pushAll()
        setBusy(false)
        navigate('/', { replace: true })
      } else {
        // E-mailbevestiging staat aan: eerst bevestigen, dan inloggen.
        setBusy(false)
        navigate('/login', { state: { confirmNotice: true } })
      }
      return
    }

    saveProfile(profile)
    navigate('/', { replace: true })
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="screen screen-auth">
      <div className="auth-hero">
        <img className="logo-icon" src="./icon-192.png" alt="" />
        <div>
          <div className="auth-hero-name">ParkMatiq</div>
          <div className="auth-hero-tag">Slim parkeren</div>
        </div>
      </div>

      <div className="auth-sheet">
        <h1>{guest || completing ? 'Stel je voertuig in' : 'Account aanmaken'}</h1>

        {completing && (
          <p className="form-hint">
            Je bent ingelogd. Maak je profiel af om verder te gaan.
          </p>
        )}

        {location.state?.notice && !completing && (
          <p className="form-hint">
            Geen account gevonden op dit apparaat. Maak hieronder je profiel aan.
          </p>
        )}

        <div className="form-group">
          <div className="input-row">
            <IconUser size={17} />
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={handleKey}
              placeholder="Je naam"
              autoComplete="name"
            />
          </div>
        </div>

        {!guest && !completing && (
          <>
            <div className="form-group">
              <div className="input-row">
                <IconMail size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={handleKey}
                  placeholder="E-mailadres"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <div className="input-row">
                <IconLock size={17} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={handleKey}
                  placeholder="Wachtwoord"
                  autoComplete="new-password"
                />
                <button
                  className="icon-btn"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
                >
                  {showPw ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="form-group">
          <label>Kenteken</label>
          <div className="input-row input-plate">
            <span className="plate-strip">NL</span>
            <input
              value={plate}
              onChange={e => { setPlate(e.target.value.toUpperCase()); setError('') }}
              onKeyDown={handleKey}
              placeholder="AB-123-C"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-yellow" onClick={handleSubmit} disabled={busy}>
          {busy ? 'Even geduld…' : guest || completing ? 'Beginnen' : 'Account aanmaken'}
        </button>

        <div className="auth-foot">
          Al een account?{' '}
          <button className="auth-link" onClick={() => navigate('/login')}>
            Inloggen
          </button>
        </div>
      </div>
    </div>
  )
}
