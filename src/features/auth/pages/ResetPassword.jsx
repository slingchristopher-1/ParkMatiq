import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, backendEnabled } from '../../../services/backend/supabase'
import { IconLock, IconEye, IconEyeOff } from '../../../components/common/Icons'

const MIN_LENGTH = 8

// Reached from the recovery link in the reset mail: Supabase has already turned
// the token into a short-lived session by the time this renders, so setting the
// new password is a plain updateUser call.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat,   setRepeat]   = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  async function handleSave() {
    if (password.length < MIN_LENGTH) {
      setError(`Kies een wachtwoord van minstens ${MIN_LENGTH} tekens`); return
    }
    if (password !== repeat) { setError('De wachtwoorden zijn niet gelijk'); return }

    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message.includes('session')
        ? 'De herstellink is verlopen. Vraag een nieuwe aan via Wachtwoord vergeten.'
        : `Opslaan mislukt: ${err.message}`)
      return
    }
    navigate('/', { replace: true })
  }

  if (!backendEnabled) { navigate('/login', { replace: true }); return null }

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
        <h1>Nieuw wachtwoord</h1>

        <div className="form-group">
          <div className="input-row">
            <IconLock size={17} />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Nieuw wachtwoord"
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

        <div className="form-group">
          <div className="input-row">
            <IconLock size={17} />
            <input
              type={showPw ? 'text' : 'password'}
              value={repeat}
              onChange={e => { setRepeat(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="Herhaal wachtwoord"
              autoComplete="new-password"
            />
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-yellow" onClick={handleSave} disabled={busy}>
          {busy ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </button>
      </div>
    </div>
  )
}
