// A geolocation source the demo drives from a slider.
//
// The detector is not stubbed or bypassed: it receives ordinary position
// samples once a second and reaches its own conclusions. The only fiction is
// where the samples come from — which is the point, because a parking app is
// hard to show indoors.

import { DEMO_ZONES } from './seed'

const START = DEMO_ZONES[1] // Oosterpoort: a paid zone with a cheaper neighbour

const state = {
  speed: 0,                 // m/s, set by the panel
  lat: START.lat,
  lon: START.lon,
}

const watchers = new Map()
let nextId = 1
let timer = null
const listeners = new Set()

export function setSpeed(metresPerSecond) {
  state.speed = Math.max(0, metresPerSecond)
}

export function teleport(lat, lon) {
  state.lat = lat
  state.lon = lon
}

export function getState() {
  return { ...state }
}

export function onTick(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function sample() {
  return {
    coords: {
      latitude: state.lat,
      longitude: state.lon,
      accuracy: 8,
      altitude: null,
      altitudeAccuracy: null,
      heading: state.speed > 0 ? 0 : null,
      // Reported speed, so the detector never has to derive one. A real phone
      // does the same whenever it can.
      speed: state.speed,
    },
    timestamp: Date.now(),
  }
}

function tick() {
  // Due north, one second at a time. Latitude is the simple axis: 111,320 m
  // per degree everywhere, so a straight drive needs no projection.
  state.lat += state.speed / 111320
  const s = sample()
  watchers.forEach(cb => { try { cb(s) } catch { /* a watcher must not stop the clock */ } })
  listeners.forEach(fn => fn(getState()))
}

export function installFakeGeolocation() {
  const geo = navigator.geolocation || (navigator.geolocation = {})

  geo.watchPosition = success => {
    const id = nextId++
    watchers.set(id, success)
    if (!timer) timer = setInterval(tick, 1000)
    success(sample())
    return id
  }
  geo.clearWatch = id => {
    watchers.delete(id)
    if (!watchers.size && timer) { clearInterval(timer); timer = null }
  }
  geo.getCurrentPosition = success => success(sample())
}
