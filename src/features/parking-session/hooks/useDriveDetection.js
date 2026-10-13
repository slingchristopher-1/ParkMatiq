import { useEffect, useRef } from 'react'
import { getSettings, getActiveSession } from '../../../services/storage'
import { requestPermission, notify } from '../../../services/notifications'
import { rateForSession, nearbyZones } from '../../../services/tariffs'
import { initialDetectorState, step, declineStop, stopConfirmMs, THRESHOLDS } from '../../../utils/driveDetect'

// Listeners for the in-app zone prompt (AutoStartPrompt). A notification can't
// carry a list of zones to choose from, so the choice is made in the app.
const zonePromptListeners = new Set()
export function onZonePrompt(fn) {
  zonePromptListeners.add(fn)
  return () => zonePromptListeners.delete(fn)
}

// Listeners for the in-app "Sessie stoppen?" prompt (StopPrompt). They get a
// `decline` callback: "Nee" or no answer within a minute feeds back into the
// detector, which asks once more and then goes quiet (train, bus...).
const stopPromptListeners = new Set()
export function onStopPrompt(fn) {
  stopPromptListeners.add(fn)
  return () => stopPromptListeners.delete(fn)
}

// The car has stopped. Normally we just ask to start. But when the fix lands
// in no zone while a paid one is close enough to be the real answer
// (rateForSession's 'unknown' + nearZone), GPS drift is the likelier story than
// free parking — so we also offer the nearby zones to pick from. A fix inside a
// zone (paid, permit or out of hours) or clear of every zone needs no correction.
async function promptStart(lat, lon, accuracy) {
  const t = await rateForSession(lat, lon, getSettings().permitZones, { accuracy })
  const zones = t.nearZone ? await nearbyZones(lat, lon) : []
  if (zones.length) {
    zonePromptListeners.forEach(fn => fn({ pos: [lat, lon], zones }))
    notify('Sessie starten?', 'Je locatie valt net buiten een parkeerzone — kies je zone in ParkMatiq.', '#/')
  } else {
    notify('Sessie starten?', 'Je lijkt geparkeerd — tik om je parkeersessie te starten.', '#/')
  }
}

// Runs app-wide while the app is open (mounted once at the top level). Watches
// movement and fires a start/stop prompt notification at the right moment.
// Foreground-only by nature: the web can't track location once the app is
// closed — that needs a native wrapper later.
export default function useDriveDetection() {
  const stateRef = useRef(null)

  useEffect(() => {
    if (!getSettings().location || !navigator.geolocation) return

    stateRef.current = initialDetectorState(Date.now())
    requestPermission() // ensure we can show the prompts

    const id = navigator.geolocation.watchPosition(
      pos => {
        // Read per sample so a change in Settings applies without a restart.
        const T = { ...THRESHOLDS, stopConfirmMs: stopConfirmMs(getSettings().endPreference) }
        const { state, prompt } = step(stateRef.current, {
          speed: pos.coords.speed,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          time: Date.now(),
          active: !!getActiveSession(),
        }, T)
        stateRef.current = state

        if (prompt === 'start') {
          promptStart(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null)
        } else if (prompt === 'stop') {
          notify('Sessie stoppen?', 'Je rijdt weer — tik om je parkeersessie te stoppen.', '#/session')
          const decline = () => { stateRef.current = declineStop(stateRef.current, Date.now(), T) }
          if (stopPromptListeners.size) stopPromptListeners.forEach(fn => fn({ decline }))
          else decline() // nobody to answer: same as no answer
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )

    return () => navigator.geolocation.clearWatch(id)
  }, [])
}
