import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { getProfile, getActiveSession, getSettings, saveSettings } from '../../../services/storage'
import { rateForSession, rateForZone, nearbyZones, zoneForPoint, formatEuro, formatWhen } from '../../../services/tariffs'
import { loadZones } from '../../../utils/zones'
import { searchZones } from '../../../utils/zoneSearch'
import { chargePointsAvailable } from '../../../services/charging'
import { geocode } from '../../../services/geolocation'
import { requestPermission } from '../../../services/notifications'
import { TILE_URL, TILE_ATTRIBUTION, userIcon } from '../../../utils/map'
import BottomNav from '../../../components/layout/BottomNav'
import PlateBadge from '../../../components/common/PlateBadge'
import ParkingZones from '../../parking-zones/components/ParkingZones'
import ZonePicker from '../../parking-zones/components/ZonePicker'
import ChargePoints from '../../charging/components/ChargePoints'
import NavigateSheet from '../../../components/common/NavigateSheet'
import PurposeToggle from '../components/PurposeToggle'
import VehiclePicker from '../components/VehiclePicker'
import { vehicleList, defaultPlate } from '../../../utils/vehicles'
import { startSession } from '../startSession'
import { IconPlay, IconLocate, IconSearch, IconBolt, IconNavigate } from '../../../components/common/Icons'

const DEFAULT_CENTER = [51.9225, 4.47917] // Rotterdam
const GEO_OPTS = { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }

// How far to look for zones to offer in the picker. Wider than the slack that
// decides free vs unknown: someone correcting us knows where they parked, and
// the outline they belong to may sit further off than we would ever infer.
const PICKER_RADIUS_M = 150

// States in which starting a session costs nothing (shown in green).
const FREE_STATES = new Set(['permit', 'free', 'evening'])

// What parking here costs *right now*, said plainly. Paid hours end in the
// evening and on Sunday in most of the country, so a zone being paid at all is
// not the same as it being paid at this moment.
function tariffHint(t) {
  switch (t.tariff) {
    case 'paid':
      return `${formatEuro(t.rate)}/uur · ${t.zoneDesc}` +
        (t.paidUntil ? ` · gratis vanaf ${formatWhen(t.paidUntil)}` : '')
    case 'permit':
      return `Vergunning · gratis in ${t.zoneDesc}`
    case 'evening':
      return 'Gratis nu · betaalde zone' +
        (t.nextPaid ? `, tarief vanaf ${formatWhen(t.nextPaid)}` : '')
    case 'free':
      return 'Gratis parkeren hier · geen betaalde zone'
    default:
      // Close enough to a paid zone that "gratis" would be a guess. Name the
      // zone and its rate: the driver is standing next to the sign that settles
      // it, and that is a better answer than anything we can infer from a fix.
      if (t.nearZone) {
        const rate = t.nearZone.maxRate
          ? ` (tot ${formatEuro(t.nearZone.maxRate)}/uur)`
          : ''
        return `${t.nearZone.desc}${rate} ligt ${t.nearZone.distance} m verderop · ` +
          'controleer het bord — we rekenen niets'
      }
      return t.zoneDesc
        ? `Betaalde zone · tarief onbekend, we rekenen niets`
        : 'Tarief onbekend · we rekenen niets'
  }
}

// Resolves to { pos, accuracy } — the error radius travels with the fix because
// the tariff lookup needs it to decide whether "no zone here" is trustworthy.
function getCurrentPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        pos: [coords.latitude, coords.longitude],
        accuracy: coords.accuracy ?? null,
      }),
      () => resolve(null),
      GEO_OPTS
    )
  })
}

function FlyToLocation({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, 16, { duration: 1.2 })
  }, [position])
  return null
}

// Exposes an imperative recenter handler so the button (rendered outside the
// map) can fly back to the user's location on demand.
function MapController({ recenterRef, centerRef }) {
  const map = useMap()
  useEffect(() => {
    recenterRef.current = pos => map.flyTo(pos, 16, { duration: 1 })
    centerRef.current = () => {
      const c = map.getCenter()
      return [c.lat, c.lng]
    }
  }, [map])
  return null
}

// Pin mode: a fixed pin sits in the middle of the map and the driver drags the
// map until it is on their car — the way EasyPark corrects a wrong zone. This
// reports the map centre whenever it settles, and lets Home jump the map to a
// spot instantly (setView, not flyTo: the pin must land before we read it).
function PinTracker({ active, onCenter, viewRef }) {
  const map = useMap()
  useEffect(() => {
    viewRef.current = pos =>
      map.setView(pos ?? map.getCenter(), Math.max(map.getZoom(), 17), { animate: false })
  }, [map])
  const report = () => {
    const c = map.getCenter()
    onCenter([c.lat, c.lng])
  }
  useMapEvents({ moveend: () => { if (active) report() } })
  useEffect(() => { if (active) report() }, [active])
  return null
}

export default function Home() {
  const navigate = useNavigate()
  const [profile,  setProfile]  = useState(null)
  const [location, setLocation] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [active,   setActive]   = useState(null)
  const [locEnabled, setLocEnabled] = useState(true)
  const [starting, setStarting] = useState(false)
  const [query,     setQuery]     = useState('')
  const [searchPos, setSearchPos] = useState(null)
  const [searchLabel, setSearchLabel] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [tariffHere, setTariffHere] = useState(null)
  // Zones near enough to be the real answer, and the one the driver picked when
  // our own verdict was wrong. A pick outranks the fix until the car moves.
  const [zoneOptions, setZoneOptions] = useState([])
  const [pickedZone, setPickedZone] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showCharging, setShowCharging] = useState(false)
  const [navDest, setNavDest] = useState(null)
  const [purpose, setPurpose] = useState(() => getSettings().sessionPurpose)
  const [vehicles, setVehicles] = useState([])
  const [plate, setPlate] = useState(null)
  const recenterRef = useRef(null)
  const centerRef = useRef(null)
  // Zones whose number or name matches the search, e.g. "50" or "Zone 50".
  const [zoneResults, setZoneResults] = useState([])
  // Where the driver says the car is, while pin mode is on (null otherwise).
  const [pinMode, setPinMode] = useState(false)
  const [pinPos, setPinPos] = useState(null)
  const pinViewRef = useRef(null)

  // Show what parking costs here *before* the user starts, so a free spot is
  // never mistaken for a paid one.
  useEffect(() => {
    if (!location) {
      setTariffHere(null)
      setZoneOptions([])
      setPickedZone(null)
      return
    }
    let alive = true
    // A new fix invalidates an earlier correction — it was made about a spot
    // the car is no longer at.
    setPickedZone(null)
    Promise.all([
      rateForSession(location[0], location[1], getSettings().permitZones, { accuracy }),
      nearbyZones(location[0], location[1], PICKER_RADIUS_M),
    ]).then(([t, opts]) => {
      if (!alive) return
      setTariffHere(t)
      setZoneOptions(opts)
    })
    return () => { alive = false }
  }, [location, accuracy])

  useEffect(() => {
    const p = getProfile()
    if (!p) { navigate('/login', { replace: true }); return }
    if (!getSettings().onboardingDone) { navigate('/onboarding', { replace: true }); return }
    setProfile(p)
    setVehicles(vehicleList(p, getSettings()))
    setPlate(defaultPlate(p, getSettings()))
    setActive(getActiveSession())
    setLocEnabled(getSettings().location)
    setShowCharging(!!getSettings().showCharging)

    if (getSettings().location) {
      navigator.geolocation?.getCurrentPosition(
        ({ coords }) => {
          setLocation([coords.latitude, coords.longitude])
          setAccuracy(coords.accuracy ?? null)
        },
        () => {},
        GEO_OPTS
      )
    }
  }, [])

  // Price whatever sits under the pin, the same way a picked zone is priced.
  // Clear of every zone, the pin is priced like a GPS fix with no error radius.
  useEffect(() => {
    if (!pinMode || !pinPos) return
    let alive = true
    loadZones().then(async data => {
      const zone = zoneForPoint(pinPos[0], pinPos[1], data)
      const permits = getSettings().permitZones
      const t = zone ? rateForZone(zone, permits) : await rateForSession(pinPos[0], pinPos[1], permits)
      if (!alive) return
      setPickedZone(zone)
      setTariffHere(t)
    })
    return () => { alive = false }
  }, [pinMode, pinPos])

  // Enter pin mode at `pos` (a tapped zone), else at the GPS fix, else wherever
  // the map is now — zoomed in to street level either way, so the pin is precise.
  function startPinMode(pos = location) {
    pinViewRef.current?.(pos)
    setPinMode(true)
  }

  // Back to the GPS verdict: drop the pin and re-resolve from the fix.
  function stopPinMode() {
    setPinMode(false)
    setPinPos(null)
    setPickedZone(null)
    if (!location) { setTariffHere(null); return }
    rateForSession(location[0], location[1], getSettings().permitZones, { accuracy })
      .then(setTariffHere)
  }

  async function handleStart() {
    setStarting(true)
    await requestPermission()
    // Capture a fix at tap time so the session map works even if the prefetch
    // hadn't resolved yet. Respects the location toggle in Settings.
    const settings = getSettings()
    let pos = null, acc = null
    if (settings.location) {
      if (location) {
        pos = location
        acc = accuracy
      } else {
        const fix = await getCurrentPosition()
        if (fix) { pos = fix.pos; acc = fix.accuracy }
      }
    }
    // A zone the driver picked wins over the fix — they can read the sign and
    // we cannot. Otherwise resolve from the parked location, passing the fix's
    // error radius: clear of every paid zone the session is free (€0), but close
    // to one the answer is 'unknown' rather than a promise of free parking. We
    // never fall back to an invented rate either way. The zone's weekly windows
    // travel with the session so the cost stops accruing when paid hours end,
    // whatever the zone data says later.
    // A placed pin is where the car is: it replaces the fix as the location,
    // and whatever zone it resolves to counts as the driver's own choice.
    if (pinMode && pinPos) { pos = pinPos; acc = null }
    const t = pickedZone
      ? rateForZone(pickedZone, settings.permitZones)
      : await rateForSession(
          pos?.[0] ?? null, pos?.[1] ?? null, settings.permitZones, { accuracy: acc }
        )
    startSession({ plate, purpose, pos, t, zonePicked: !!pickedZone || pinMode })
    navigate('/session')
  }

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchErr('')
    setSearchLabel('')
    setSearchPos(null)
    setZoneResults([])
    // Zones near the map centre first: "Zone 10" exists in many municipalities.
    const zones = await searchZones(q, centerRef.current?.() ?? location)
    setZoneResults(zones)
    // A zone number from a sign ("50") is not an address — don't also fly the
    // map to whatever the geocoder makes of it.
    const exactZone = zones.length > 0 && /^(zone\s*)?[\w-]{1,8}$/i.test(q) && /\d/.test(q)
    const result = exactZone ? null : await geocode(q)
    setSearching(false)
    if (result) {
      setSearchPos(result.pos)
      setSearchLabel(result.label)
      recenterRef.current?.(result.pos)
    } else if (!zones.length) {
      setSearchErr('Geen locatie of zone gevonden')
    }
  }

  // A zone from the search: drop the pin inside it so the driver sees the
  // zone and its price on the start sheet before starting. With a session
  // already running there is nothing to start; just show the zone.
  function pickZoneResult(z) {
    setZoneResults([])
    if (active) recenterRef.current?.(z.point)
    else startPinMode(z.point)
  }

  // The driver overriding our verdict. Price it immediately so the sheet shows
  // what the correction actually costs before they commit to it.
  function handlePickZone(zone) {
    // A pick from the list is a zone choice at the GPS fix, not at the pin.
    setPinMode(false)
    setPinPos(null)
    setPickedZone(zone)
    setTariffHere(rateForZone(zone, getSettings().permitZones))
    setPickerOpen(false)
  }

  function toggleCharging() {
    const next = !showCharging
    setShowCharging(next)
    saveSettings({ showCharging: next })
  }

  async function handleRecenter() {
    if (location) recenterRef.current?.(location)
    const fresh = await getCurrentPosition()
    if (fresh) {
      setLocation(fresh.pos)
      setAccuracy(fresh.accuracy)
      recenterRef.current?.(fresh.pos)
    }
  }

  if (!profile) return null

  return (
    <div className="screen screen-home">
      <div className="map-full">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          zoomControl={false}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ParkingZones onNavigate={setNavDest} onPark={active ? null : startPinMode} />
          {showCharging && <ChargePoints onNavigate={setNavDest} />}
          <FlyToLocation position={location} />
          <MapController recenterRef={recenterRef} centerRef={centerRef} />
          <PinTracker active={pinMode} onCenter={setPinPos} viewRef={pinViewRef} />
          {location && <Marker position={location} icon={userIcon} />}
          {searchPos && <Marker position={searchPos} />}
        </MapContainer>
        {pinMode && (
          <>
            <div className="map-pin" aria-hidden="true">
              <svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43C17 43 32 27 32 16A15 15 0 0 0 2 16C2 27 17 43 17 43Z" fill="#F7D117" stroke="#002D72" strokeWidth="2.5"/><text x="17" y="22" textAnchor="middle" fontSize="15" fontWeight="700" fill="#002D72" fontFamily="DM Sans, sans-serif">P</text></svg>
            </div>
            <div className="map-pin-hint">Sleep de kaart tot de pin op je auto staat</div>
          </>
        )}
        {location && (
          <button
            className="map-recenter"
            onClick={handleRecenter}
            aria-label="Naar mijn locatie"
          >
            <IconLocate size={20} />
          </button>
        )}
        {chargePointsAvailable && (
          <button
            className={`map-charging${showCharging ? ' on' : ''}`}
            onClick={toggleCharging}
            aria-pressed={showCharging}
            aria-label="Laadpunten tonen"
          >
            <IconBolt size={20} />
          </button>
        )}
        <div className="zone-legend">
          <span><i style={{ background: '#4ADE80' }} />tot €1</span>
          <span><i style={{ background: '#FBBF24' }} />€1–2,50</span>
          <span><i style={{ background: '#FB923C' }} />€2,50–4</span>
          <span><i style={{ background: '#E5484D' }} />€4+</span>
          <span><i style={{ background: '#9AA3B8' }} />onbekend</span>
          <em>Tarieven indicatief · demo</em>
        </div>
      </div>

      <div className="topbar">
        <div className="chip-logo"><span>P</span>ParkMatiq</div>
        <div className="avatar">{profile.name?.charAt(0).toUpperCase() || 'P'}</div>
      </div>

      <form className="map-search" onSubmit={handleSearch}>
        <div className="map-search-field">
          <IconSearch size={18} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSearchErr('') }}
            placeholder="Zoek een straat, plaats of zone…"
            enterKeyHint="search"
            aria-label="Zoek locatie"
          />
          {query && (
            <button
              type="button"
              className="map-search-clear"
              onClick={() => { setQuery(''); setSearchPos(null); setSearchErr(''); setSearchLabel(''); setZoneResults([]) }}
              aria-label="Wissen"
            >✕</button>
          )}
        </div>
        {searching && <span className="map-search-status">Zoeken…</span>}
        {!searching && zoneResults.length > 0 && (
          <div className="map-search-zones">
            {zoneResults.map(z => (
              <button
                key={`${z.municipality}|${z.desc}`}
                type="button"
                className="map-search-zone"
                onClick={() => pickZoneResult(z)}
              >
                <span className="map-search-zone-p">P</span>
                <span className="map-search-zone-name">{z.desc}</span>
                <span className="map-search-zone-meta">
                  {z.municipality}{z.maxRate ? ` · tot ${formatEuro(z.maxRate)}/uur` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        {searchErr && <span className="map-search-status err">{searchErr}</span>}
        {!searching && !searchErr && searchLabel && (
          <span className="map-search-status found">
            <span className="search-found-label">{searchLabel}</span>
            <button
              type="button"
              className="search-nav-btn"
              onClick={() => setNavDest({ lat: searchPos[0], lon: searchPos[1], label: searchLabel })}
            >
              <IconNavigate size={13} /> Navigeer
            </button>
          </span>
        )}
      </form>

      <div className="sheet">
        <div className="sheet-handle" />
        {!active && vehicles.length > 1 ? (
          <VehiclePicker vehicles={vehicles} value={plate} onChange={setPlate} />
        ) : (
          <div className="vehicle-row">
            <div className="vehicle-id">
              {/* A running session shows the car it was started for. */}
              <PlateBadge plate={active?.plate ?? plate} />
              <div className="vehicle-meta">
                <span className="vehicle-label">Voertuig</span>
                <span className="vehicle-name">
                  {vehicles.find(v => v.plate === (active?.plate ?? plate))?.label || profile.name}
                </span>
              </div>
            </div>
          </div>
        )}
        {active ? (
          <button
            className="btn btn-yellow"
            onClick={() => navigate('/session')}
          >
            <span className="live-dot" /> Naar actieve sessie
          </button>
        ) : (
          <>
            {tariffHere && (
              <p className={`start-hint${FREE_STATES.has(tariffHere.tariff) ? ' free' : ''}`}>
                {(pickedZone || pinMode) && <span className="zone-picked-tag">{pinMode ? 'Pin' : 'Zelf gekozen'}</span>}
                {tariffHint(tariffHere)}
              </p>
            )}
            {pinMode ? (
              <div className="zone-pick-links">
                <button className="zone-pick-link" onClick={stopPinMode}>Terug naar GPS-locatie</button>
                {zoneOptions.length > 0 && (
                  <button className="zone-pick-link" onClick={() => setPickerOpen(true)}>Kies uit lijst</button>
                )}
              </div>
            ) : (
              <button className="zone-pick-link" onClick={() => startPinMode()}>
                {pickedZone ? 'Andere zone kiezen'
                  : tariffHere ? 'Klopt de zone niet? Wijs je auto aan op de kaart'
                  : 'Wijs je auto aan op de kaart'}
              </button>
            )}
            <PurposeToggle value={purpose} onChange={setPurpose} />
            <button
              className="btn btn-yellow"
              onClick={handleStart}
              disabled={starting}
            >
              <IconPlay size={16} />
              {starting ? 'Bezig…' : 'Start parkeren'}
            </button>
            {!locEnabled && !pinMode && (
              <p className="start-hint">Locatie staat uit — het tarief kan niet worden bepaald.</p>
            )}
          </>
        )}
        <BottomNav active="home" />
      </div>

      <NavigateSheet destination={navDest} onClose={() => setNavDest(null)} />

      <ZonePicker
        open={pickerOpen}
        zones={zoneOptions}
        selected={pickedZone}
        onPick={handlePickZone}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
