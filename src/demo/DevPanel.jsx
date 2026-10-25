// The developer button and its panel. Demo build only — nothing imports this
// from the app, and the app's entry point only loads it when VITE_DEMO is set.

import { useEffect, useState } from 'react'
import { OVERRIDES, THRESHOLDS } from '../utils/driveDetect'
import { setSpeed, getState, onTick } from './fakeGeo'
import { reseed, clearAll } from './boot'

// What the audience is really here to see is the prompt, not the two minutes
// of silence before it. These compress that wait without changing any rule:
// the detector still needs sustained driving, then a real dwell.
const FAST = {
  stationaryMs: 8000,       // "parked" after 8s still, instead of 2 min
  drivingConfirmMs: 4000,   // driving counts after 4s
  drivingMinMeters: 40,     // and 40 m of travel
  stopConfirmMs: 6000,      // ask to stop 6s into a drive
  startRepromptMs: 12000,   // second start prompt 12s later
  repromptMs: 12000,        // second stop prompt likewise
}

const KMH = mps => Math.round(mps * 3.6)

export default function DevPanel() {
  const [open, setOpen] = useState(false)
  const [kmh, setKmh] = useState(0)
  const [fast, setFast] = useState(true)
  const [live, setLive] = useState(getState())

  useEffect(() => onTick(setLive), [])

  // Default to the fast timings: a demo that needs a four-minute pause is not
  // a demo. The switch puts the real ones back, to show they are the real ones.
  useEffect(() => {
    for (const k of Object.keys(OVERRIDES)) delete OVERRIDES[k]
    if (fast) Object.assign(OVERRIDES, FAST)
  }, [fast])

  function drive(k) {
    setKmh(k)
    setSpeed(k / 3.6)
  }

  if (!open) {
    return (
      <button className="demo-fab" onClick={() => setOpen(true)} aria-label="Developer">
        DEV
      </button>
    )
  }

  const t = { ...THRESHOLDS, ...OVERRIDES }

  return (
    <div className="demo-panel" role="dialog" aria-label="Developer">
      <div className="demo-row demo-head">
        <strong>Developer</strong>
        <button className="demo-x" onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
      </div>

      <label className="demo-label" htmlFor="demo-speed">
        Snelheid <span className="demo-mono">{kmh} km/u</span>
      </label>
      <input
        id="demo-speed"
        className="demo-slider"
        type="range" min="0" max="130" step="1"
        value={kmh}
        onChange={e => drive(Number(e.target.value))}
      />

      <div className="demo-row">
        <button className="demo-btn" onClick={() => drive(0)}>Parkeer (0)</button>
        <button className="demo-btn" onClick={() => drive(50)}>Rijd (50)</button>
        <button className="demo-btn" onClick={() => drive(100)}>Snelweg (100)</button>
      </div>

      <p className="demo-hint">
        Rijd tot de melding komt, zet dan op 0 en wacht — zo vraagt de app om te
        starten. Met een lopende sessie: ga weer rijden om de stopmelding te
        krijgen. De app start of stopt nooit zelf.
      </p>

      <label className="demo-check">
        <input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} />
        Demo-tempo ({t.stationaryMs / 1000}s stil, {t.stopConfirmMs / 1000}s rijden)
      </label>

      <div className="demo-readout demo-mono">
        {KMH(live.speed)} km/u · {live.lat.toFixed(5)}, {live.lon.toFixed(5)}
      </div>

      <div className="demo-row">
        <button className="demo-btn" onClick={reseed}>Maand opnieuw vullen</button>
        <button className="demo-btn demo-danger" onClick={clearAll}>Alles wissen</button>
      </div>
    </div>
  )
}
