import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { getActiveSession } from '../../../services/storage'
import { costOf, rateAt, paidUntil, nextPaidStart, dayCapReached, formatEuro, formatWhen } from '../../../services/tariffs'
import { TILE_URL, TILE_ATTRIBUTION, parkIcon } from '../../../utils/map'
import PlateBadge from '../../../components/common/PlateBadge'
import { purposeLabel } from '../../../utils/purpose'
import BottomNav from '../../../components/layout/BottomNav'
import { IconStop } from '../../../components/common/Icons'
import { stopSession } from '../stopSession'

export default function ActiveSession() {
  const navigate  = useNavigate()
  const [session, setSession]   = useState(null)
  const [elapsed, setElapsed]   = useState(0)
  const [stopping, setStopping] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    const active = getActiveSession()
    if (!active) { navigate('/', { replace: true }); return }
    setSession(active)

    const startMs = new Date(active.startTime).getTime()
    setElapsed(Math.floor((Date.now() - startMs) / 1000))
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)

    return () => clearInterval(intervalRef.current)
  }, [])

  function handleStop() {
    setStopping(true)
    clearInterval(intervalRef.current)

    const completed = stopSession()
    if (!completed) { navigate('/', { replace: true }); return }
    navigate('/summary', { replace: true, state: { session: completed } })
  }

  if (!session) return null

  const startStr = new Date(session.startTime).toLocaleTimeString('nl-NL', {
    hour: '2-digit', minute: '2-digit',
  })

  const h   = Math.floor(elapsed / 3600)
  const m   = Math.floor((elapsed % 3600) / 60)
  const s   = elapsed % 60
  const pad = v => String(v).padStart(2, '0')
  const timerStr = `${pad(h)}:${pad(m)}:${pad(s)}`

  // `elapsed` drives the re-render; the cost itself comes from the zone's paid
  // windows, so it stops climbing the moment paid hours end (and starts again
  // when they resume for a car left overnight).
  const cost   = costOf(session)
  const parked = session.lat != null && session.lon != null
  // Sessions started before the tariff states existed carry no `tariff` field;
  // treat those as paid so their stored rate keeps showing. Zones with windows
  // are re-evaluated live — a session that began in paid hours is free later.
  const now    = new Date()
  const rate   = session.windows ? rateAt(session.windows, now) : (session.rate ?? 0)
  const state  = session.windows
    ? (rate > 0 ? 'paid' : 'evening')
    : (session.tariff || 'paid')
  const paid   = state === 'paid'
  const until  = paid && session.windows ? paidUntil(session.windows, now) : null
  const resume = state === 'evening' && session.windows ? nextPaidStart(session.windows, now) : null
  const capped = dayCapReached(session)

  return (
    <div className="screen">
      <div className="content session-dash">

        <div className="statuscard">
          <div className="sc-toprow">
            <span className="sc-label">Parkeren actief</span>
            <span className="sc-pill"><span className="sc-dot" />LIVE</span>
          </div>

          <div className="sc-title">{session.zoneDesc || 'Parkeersessie'}</div>
          <div className="sc-sub">
            Gestart om {startStr}
            {session.purpose && ` · ${purposeLabel(session.purpose)}`}
            {' · '}{paid ? 'meter loopt' : 'geen kosten'}
          </div>

          <div className="sc-tiles">
            <div className="sc-tile">
              <div className="sc-tile-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                Tijd
              </div>
              <div className="sc-tile-val">{timerStr}</div>
            </div>
            <div className="sc-tile">
              <div className="sc-tile-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                Kosten
              </div>
              <div className="sc-tile-val accent">{formatEuro(cost)}</div>
            </div>
          </div>

          <div className="sc-detail">
            <PlateBadge plate={session.plate} />
            <div className="sc-detail-txt">
              <div className="sc-detail-primary">
                {paid
                  ? `${formatEuro(rate)}/uur`
                  : state === 'unknown' ? 'Onbekend' : 'Gratis'}
              </div>
              <div className="sc-detail-secondary">
                {{
                  paid:    capped
                    ? `Dagmaximum bereikt · ${formatEuro(session.dayCap)}`
                    : until ? `Meter loopt tot ${formatWhen(until.getTime())}` : 'Tarief uit zone · indicatief',
                  evening: resume ? `Buiten betaalde uren · tarief vanaf ${formatWhen(resume.getTime())}` : 'Buiten betaalde uren',
                  permit:  'Bewonersvergunning · geen kosten',
                  free:    'Geen betaalde zone hier',
                  unknown: 'Tarief niet bepaald · we rekenen niets',
                }[state]}
              </div>
            </div>
          </div>
        </div>

        {parked && (
          <div className="minimap">
            <MapContainer
              center={[session.lat, session.lon]}
              zoom={16}
              zoomControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
              keyboard={false}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <Marker position={[session.lat, session.lon]} icon={parkIcon} />
            </MapContainer>
            <span className="minimap-chip">Geparkeerd hier</span>
          </div>
        )}

        <div className="session-stop">
          <button
            className="btn btn-red"
            onClick={handleStop}
            disabled={stopping}
          >
            <IconStop size={16} />
            {stopping ? 'Stoppen…' : 'Stop parkeren'}
          </button>
        </div>

      </div>
      <BottomNav />
    </div>
  )
}
