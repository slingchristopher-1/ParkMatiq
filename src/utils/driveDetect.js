// Pure movement-detection state machine. Kept free of React/geolocation so the
// logic can be tested deterministically by feeding it a sequence of samples.
//
// Prompts (matches the agreed table):
//   - 'start' : we'd been driving, then stationary >= 2 min, and NO active session
//   - 'stop'  : sustained driving movement while a session IS active
// Each prompt fires once per transition, never repeatedly.
//
// Driving only counts once it has lasted `drivingConfirmMs`. A single fast
// sample is not a drive: with the phone lying still, GPS fixes wander 10-20 m,
// and when the device reports no speed of its own that wander reads as 10+ m/s.
// For the same reason a speed we derive ourselves is only trusted when the car
// moved further than the two fixes' combined error radius — and since phones
// often claim better accuracy than they have, a drive must also carry the phone
// `drivingMinMeters` from where it began. Wander, however fast it looks, never
// gets anywhere.

export const THRESHOLDS = {
  drivingSpeed: 7,        // m/s (~25 km/h) — clearly in a vehicle, not walking/cycling
  stationarySpeed: 1.2,   // m/s — below this counts as "not moving" (allows GPS noise)
  stationaryMs: 120000,   // 2 minutes still before we treat it as "parked"
  drivingConfirmMs: 20000, // driving speed held this long before it counts
  stopConfirmMs: 20000,   // confirmed driving this long before asking to stop
  speedHoldMs: 10000,     // a derived speed stays valid this long between measurements
  drivingMinMeters: 100,  // and the phone must really have travelled this far
  // "Nee" to "Sessie stoppen?" (or no answer). A driver who keeps saying no
  // while moving is on a train or bus, not in the parked car: ask once more,
  // then go quiet for a while before checking again.
  repromptMs: 120000,     // after the first no, ask again this much later
  maxDeclines: 2,         // this many no's in a row means: other transport
  quietMs: 1800000,       // then stay quiet for 30 minutes
}

// How long to wait before suggesting a stop, per the driver's "Sessie stoppen"
// preference. 'manual' never suggests one (null).
export function stopConfirmMs(endPreference) {
  if (endPreference === 'manual') return null
  return endPreference === 'eager' ? 20000 : 60000
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function initialDetectorState(now) {
  return {
    lastMovingAt: now,   // last time we saw real movement (resets the "still" clock)
    lastPos: null,       // for deriving speed when the device doesn't report it
    drivingSince: null,  // start of the current run of driving-speed samples
    drivingFrom: null,   // where that run started
    derivedSpeed: 0,     // last speed measured from positions (device gave none)
    wasDriving: false,   // have we seen driving speed since the last park? (anti-nag)
    parkedFired: false,  // already prompted "start?" for this park event
    driveFired: false,   // already prompted "stop?" for this drive event
    declines: 0,         // "no" answers in a row to the stop prompt
    nextStopAt: 0,       // no stop prompt before this time (reprompt / quiet)
  }
}

// sample: { speed: m/s|null, lat, lon, accuracy: m|null, time: ms, active: bool }
// T.stopConfirmMs may be null: never prompt to stop (driver stops by hand).
// returns { state, prompt: 'start' | 'stop' | null }
export function step(state, sample, T = THRESHOLDS) {
  const s = { ...state }

  const here = { lat: sample.lat, lon: sample.lon, accuracy: sample.accuracy ?? null, time: sample.time }
  let speed = sample.speed
  if ((speed == null || Number.isNaN(speed)) && s.lastPos) {
    // Derive speed against the last position we trusted, not the previous fix:
    // movement inside the two fixes' error radius is GPS wander and is ignored
    // (the anchor stays put), while real travel keeps adding up until it clears
    // that radius — so slow city driving still registers.
    const d = haversine(s.lastPos.lat, s.lastPos.lon, sample.lat, sample.lon)
    const dt = (sample.time - s.lastPos.time) / 1000
    const noise = (s.lastPos.accuracy ?? 0) + (sample.accuracy ?? 0)
    if (dt > 0 && d > noise) {
      speed = d / dt
      s.lastPos = here
      s.derivedSpeed = speed
    } else {
      // Not clear of the noise yet: keep the last measured speed for a short
      // while (a car between two measurements is still moving), then call it 0.
      speed = dt <= T.speedHoldMs / 1000 ? s.derivedSpeed : 0
    }
  } else {
    s.lastPos = here
  }
  speed = speed || 0

  let prompt = null

  if (speed > T.stationarySpeed) s.lastMovingAt = sample.time

  if (speed >= T.drivingSpeed) {
    if (s.drivingSince == null) {
      s.drivingSince = sample.time
      s.drivingFrom = { lat: sample.lat, lon: sample.lon }
    }
    const moved = haversine(s.drivingFrom.lat, s.drivingFrom.lon, sample.lat, sample.lon)
    // Until the phone has really travelled, the run hasn't started counting.
    const drivenMs = moved >= T.drivingMinMeters ? sample.time - s.drivingSince : 0
    if (drivenMs >= T.drivingConfirmMs) {
      s.wasDriving = true
      s.parkedFired = false
    }
    if (sample.active && !s.driveFired && T.stopConfirmMs != null &&
        sample.time >= s.nextStopAt &&
        drivenMs >= Math.max(T.drivingConfirmMs, T.stopConfirmMs)) {
      prompt = 'stop'
      s.driveFired = true
    }
  } else {
    s.drivingSince = null
    s.drivingFrom = null
  }

  if (s.wasDriving && speed <= T.stationarySpeed &&
      sample.time - s.lastMovingAt >= T.stationaryMs) {
    s.driveFired = false
    // A trip that ended starts a fresh count; a quiet period keeps running.
    s.declines = 0
    if (!sample.active && !s.parkedFired) {
      prompt = 'start'
      s.parkedFired = true
    }
  }

  return { state: s, prompt }
}

// The driver answered "Nee" to the stop prompt, or let it time out. The first
// no is asked again after `repromptMs`; `maxDeclines` in a row means they are
// travelling some other way, so stay quiet for `quietMs` before asking again.
export function declineStop(state, now, T = THRESHOLDS) {
  const s = { ...state, driveFired: false, declines: state.declines + 1 }
  if (s.declines >= T.maxDeclines) {
    s.declines = 0
    s.nextStopAt = now + T.quietMs
  } else {
    s.nextStopAt = now + T.repromptMs
  }
  return s
}
