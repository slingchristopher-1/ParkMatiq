import { useState, useEffect } from 'react'
import { loadZones } from '../../../utils/zones'
import { zoneForPoint } from '../../../services/tariffs'

// A resident permit ("bewonersvergunning") is issued for a parking zone, not a
// postcode: parking in one of these zones is free for the permit holder. The
// user picks the zone off the map data — by their current location, or by name.

const MAX_RESULTS = 6

function zoneKey(z) {
  return `${z.municipality}|${z.desc}`
}

export default function PermitZones({ zones, onChange }) {
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => { loadZones().then(setData) }, [])

  // One entry per zone name per municipality — the RDW data splits a zone into
  // many street polygons that all share the same name.
  const results = (() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2 || !data) return []
    const seen = new Set(zones.map(zoneKey))
    const out = []
    for (const f of data.features) {
      const p = f.properties
      const z = { areaid: p.areaid, desc: p.desc, municipality: p.municipality || '' }
      const key = zoneKey(z)
      if (seen.has(key)) continue
      if (!`${z.desc} ${z.municipality}`.toLowerCase().includes(q)) continue
      seen.add(key)
      out.push(z)
      if (out.length === MAX_RESULTS) break
    }
    return out
  })()

  function add(zone) {
    setQuery('')
    setStatus('')
    if (zones.some(z => zoneKey(z) === zoneKey(zone))) return
    onChange([...zones, zone])
  }

  function remove(zone) {
    onChange(zones.filter(z => zoneKey(z) !== zoneKey(zone)))
  }

  async function addHere() {
    setStatus('Locatie bepalen…')
    const pos = await new Promise(res => {
      if (!navigator.geolocation) return res(null)
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => res([coords.latitude, coords.longitude]),
        () => res(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    })
    if (!pos) { setStatus('Locatie niet beschikbaar.'); return }
    const zones = data || await loadZones()
    if (!zones) { setStatus('Zonegegevens niet geladen — probeer het later opnieuw.'); return }
    const zone = zoneForPoint(pos[0], pos[1], zones)
    if (!zone) { setStatus('Hier is geen betaalde parkeerzone — parkeren is al gratis.'); return }
    setStatus('')
    add({ areaid: zone.areaid, desc: zone.desc, municipality: zone.municipality })
  }

  return (
    <div className="form-group">
      <label>Bewonersvergunning (parkeerzone)</label>

      {zones.length > 0 && (
        <ul className="permit-list">
          {zones.map(z => (
            <li key={zoneKey(z)}>
              <span>
                {z.desc}
                {z.municipality && <em> · {z.municipality}</em>}
              </span>
              <button type="button" onClick={() => remove(z)} aria-label={`Verwijder ${z.desc}`}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="input-row">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setStatus('') }}
          placeholder="Zoek je zone of gemeente"
        />
      </div>

      {results.length > 0 && (
        <ul className="permit-results">
          {results.map(z => (
            <li key={zoneKey(z)}>
              <button type="button" onClick={() => add(z)}>
                {z.desc}
                {z.municipality && <em> · {z.municipality}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-ghost btn-sm" onClick={addHere}>
        Zone bij mijn locatie toevoegen
      </button>

      <span className="field-hint">
        {status || 'In deze zones betaal je niets. Leeg = geen vergunning.'}
      </span>
    </div>
  )
}
