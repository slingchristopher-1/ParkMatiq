import { useNavigate, useLocation } from 'react-router-dom'
import { formatDuration, generateReceipt } from '../../../services/receipts'
import { sessionCost, formatEuro } from '../../../services/tariffs'
import PlateBadge from '../../../components/common/PlateBadge'
import { purposeLabel } from '../../../utils/purpose'
import { IconDownload } from '../../../components/common/Icons'

// Why a session cost what it did. Sessions from before the tariff states were
// introduced have no `tariff` field and are shown as paid at their stored rate.
function tariffLabel(session) {
  switch (session.tariff || 'paid') {
    case 'permit':  return 'Bewonersvergunning · gratis'
    case 'free':    return 'Geen betaalde zone · gratis'
    // Started outside paid hours — but a car left overnight rolls into them.
    case 'evening': return sessionCost(session) > 0
      ? 'Deels binnen betaalde uren' : 'Buiten betaalde uren'
    case 'unknown': return 'Onbekend · niet in rekening gebracht'
    default:        return `${formatEuro(session.rate)}/uur`
  }
}

// Shown right after a session is stopped so the cost/duration land on screen
// (not only in a notification, which many users have blocked). Reachable only
// via navigation state; a direct refresh falls back to Home.
export default function Summary() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const session = state?.session

  if (!session) { navigate('/', { replace: true }); return null }

  const startStr = new Date(session.startTime).toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit',
  })
  const endStr = new Date(session.endTime).toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="screen">
      <div className="content summary-dash">
        <div className="summary-check">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <h1 className="summary-title">Sessie gestopt</h1>
        <p className="summary-sub">{session.zoneDesc || 'Parkeersessie'}</p>

        <div className="summary-amount">{formatEuro(sessionCost(session))}</div>

        <div className="summary-rows">
          <div className="summary-row"><span>Duur</span><span>{formatDuration(session.duration)}</span></div>
          <div className="summary-row"><span>Van — tot</span><span>{startStr} – {endStr}</span></div>
          <div className="summary-row"><span>Tarief</span><span>{tariffLabel(session)}</span></div>
          {session.purpose && (
            <div className="summary-row"><span>Soort</span><span>{purposeLabel(session.purpose)}</span></div>
          )}
          <div className="summary-row"><span>Kenteken</span><PlateBadge plate={session.plate} /></div>
        </div>

        <button className="btn btn-ghost" onClick={() => generateReceipt(session)}>
          <IconDownload size={16} /> Download bewijs (PDF)
        </button>
        <button className="btn btn-yellow" onClick={() => navigate('/', { replace: true })}>
          Klaar
        </button>
      </div>
    </div>
  )
}
