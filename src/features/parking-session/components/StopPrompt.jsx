import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveSession, logPrompt } from '../../../services/storage'
import { costOf, formatEuro } from '../../../services/tariffs'
import PlateBadge from '../../../components/common/PlateBadge'
import { onStopPrompt } from '../hooks/useDriveDetection'
import { stopSession } from '../stopSession'

// How long the driver has to answer before it counts as "Nee".
const ANSWER_S = 60

// Shown app-wide when drive detection sees the car moving while a session
// runs. "Nee" — or no answer within a minute — tells the detector this may be
// a train or bus ride; it asks once more and then leaves the driver alone.
export default function StopPrompt() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState(null) // { decline }
  // When the prompt appeared, so a stop can record how long the session ran on
  // past the moment we spotted the car moving.
  const [promptedAt, setPromptedAt] = useState(null)
  const [left, setLeft] = useState(ANSWER_S)

  useEffect(() => onStopPrompt(p => {
    if (!getActiveSession()) { p.decline(); return }
    setLeft(ANSWER_S)
    setPrompt(p)
  }), [])

  // Count down; at zero, or if the session was stopped some other way, close.
  useEffect(() => {
    if (!prompt) return
    const id = setInterval(() => {
      if (!getActiveSession()) { setPrompt(null); return }
      setLeft(s => s - 1)
    }, 1000)
    return () => clearInterval(id)
  }, [prompt])

  useEffect(() => {
    if (prompt && left <= 0) decline()
  }, [left])

  function decline() {
    prompt?.decline()
    setPrompt(null)
  }

  function stop() {
    setPrompt(null)
    const completed = stopSession({ stoppedBy: 'prompt', promptedAt })
    if (completed) navigate('/summary', { replace: true, state: { session: completed } })
  }

  if (!prompt) return null
  const session = getActiveSession()
  if (!session) return null

  return (
    <div className="nav-overlay" onClick={decline}>
      <div className="nav-sheet" role="alertdialog" aria-labelledby="stop-prompt-title" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="nav-sheet-title" id="stop-prompt-title">Sessie stoppen?</h2>
        <p className="nav-sheet-sub">
          Je lijkt weg te rijden. Zit je in de trein of bus? Kies dan Nee — dan
          laten we je even met rust.
        </p>
        <div className="stop-prompt-session">
          <PlateBadge plate={session.plate} />
          <span>{session.zoneDesc || 'Parkeersessie'} · {formatEuro(costOf(session))}</span>
        </div>
        <button className="btn btn-red" onClick={stop}>Ja, stop parkeren</button>
        <button className="btn btn-ghost" onClick={decline}>Nee, ik parkeer nog ({left})</button>
      </div>
    </div>
  )
}
