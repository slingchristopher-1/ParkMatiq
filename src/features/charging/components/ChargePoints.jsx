import { useCallback, useEffect, useRef, useState } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { fetchChargePoints } from '../../../services/charging'
import { chargeIcon } from '../../../utils/map'

// Charge points are only worth fetching once the viewport is a neighbourhood
// rather than a province — matches the parking-zone layer's threshold.
const MIN_ZOOM = 13
// OCM's fair-usage policy asks callers to throttle; a pan fires moveend
// continuously, so wait until the map settles before asking for a new area.
const SETTLE_MS = 500

function connectorLine(c) {
  const parts = [c.type]
  if (c.kw) parts.push(`${c.kw} kW`)
  if (c.quantity > 1) parts.push(`${c.quantity}×`)
  return parts.join(' · ')
}

// Public EV charge points for the visible area. `onNavigate` is called with the
// destination so the navigation sheet can render outside the map container.
export default function ChargePoints({ onNavigate }) {
  const map = useMap()
  const [points, setPoints] = useState([])
  const timerRef = useRef(null)

  const refresh = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (map.getZoom() < MIN_ZOOM) { setPoints([]); return }
      const b = map.getBounds()
      fetchChargePoints(b.getSouthWest(), b.getNorthEast()).then(setPoints)
    }, SETTLE_MS)
  }, [map])

  useEffect(() => {
    refresh()
    return () => clearTimeout(timerRef.current)
  }, [refresh])
  useMapEvents({ load: refresh, resize: refresh, moveend: refresh, zoomend: refresh })

  return points.map(p => (
    <Marker key={p.id} position={[p.lat, p.lon]} icon={chargeIcon}>
      <Popup>
        <strong>{p.title}</strong>
        {p.street && <><br />{p.street}</>}
        {p.operator && <><br /><span className="cp-meta">{p.operator}</span></>}
        {p.connections.length > 0 && (
          <ul className="cp-connectors">
            {p.connections.map((c, i) => <li key={i}>{connectorLine(c)}</li>)}
          </ul>
        )}
        {p.points > 1 && <span className="cp-meta">{p.points} laadpunten</span>}
        <button
          className="cp-nav-btn"
          onClick={() => onNavigate({ lat: p.lat, lon: p.lon, label: p.title })}
        >
          Navigeer
        </button>
        <span className="cp-meta">Beschikbaarheid niet live · Open Charge Map</span>
      </Popup>
    </Marker>
  ))
}
