import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Providers from './providers'
import AppRouter from './router'
import { supabase } from '../services/backend/supabase'
import useDriveDetection from '../features/parking-session/hooks/useDriveDetection'
import useParkingReminder from '../features/parking-session/hooks/useParkingReminder'
import AutoStartPrompt from '../features/parking-session/components/AutoStartPrompt'
import StopPrompt from '../features/parking-session/components/StopPrompt'
import { backendEnabled } from '../services/backend/supabase'
import { pullAll, onSyncError, onSyncOk } from '../services/backend/sync'

// Toont mislukte server-syncs zichtbaar in de app (console is onzichtbaar op
// een telefoon). Verdwijnt zodra een volgende sync slaagt, of via de ×.
function SyncBanner() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const offErr = onSyncError(setMsg)
    const offOk = onSyncOk(() => setMsg(''))
    return () => { offErr(); offOk() }
  }, [])
  if (!msg) return null
  return (
    <div className="sync-banner" role="alert">
      <span>⚠️ Sync: {msg}</span>
      <button onClick={() => setMsg('')} aria-label="Sluiten">×</button>
    </div>
  )
}

// Supabase swallows the recovery token from the URL and signs the user in with
// a short-lived session; that arrives as a PASSWORD_RECOVERY event, which is
// our only cue to show the "choose a new password" screen.
function RecoveryRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset', { replace: true })
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return null
}

export default function App() {
  useDriveDetection()
  useParkingReminder()

  // Signed in from a previous visit? Refresh localStorage from the server in
  // the background (local-first: screens render local data immediately).
  // adopt: this is a refresh for a session that is already signed in, so any
  // local data was produced by this account — there is no second identity in
  // play the way there is at the login screen. It also carries devices that
  // were signed in before the owner stamp existed across the upgrade without
  // discarding sessions that never reached the server.
  useEffect(() => {
    if (backendEnabled) pullAll({ adopt: true })
  }, [])
  return (
    <Providers>
      {backendEnabled && <SyncBanner />}
      {backendEnabled && <RecoveryRedirect />}
      <AppRouter />
      <AutoStartPrompt />
      <StopPrompt />
    </Providers>
  )
}
