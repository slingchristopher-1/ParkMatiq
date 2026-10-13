// Public EV charge points from Open Charge Map (openchargemap.org), fetched for
// the visible map area only. OCM is free but needs a free API key
// (VITE_OCM_KEY); without one the layer stays off instead of erroring.
//
// OCM carries locations and connectors, NOT live occupancy — its StatusType is
// the operator-reported condition of the point ("Operational"), not whether a
// car is plugged in right now. Live availability needs a different source
// (NDW's DOT-NL, OCPI 2.2.1) and a proxy to hold the credentials.

const API = 'https://api.openchargemap.io/v3/poi'
const REFERENCE_API = 'https://api.openchargemap.io/v3/referencedata'
const KEY = import.meta.env.VITE_OCM_KEY || ''
// A whole city fits well inside this: the full Rotterdam box holds ~440 points.
const MAX_RESULTS = 500

export const chargePointsAvailable = !!KEY

// Cache per rounded bounding box: panning around a city re-asks for nearly the
// same box, and OCM asks callers to be gentle with request volume.
const cache = new Map()

function boxKey(sw, ne) {
  const r = v => v.toFixed(2)
  return `${r(sw.lat)},${r(sw.lng)},${r(ne.lat)},${r(ne.lng)}`
}

// Names for connector types and operators live in a separate reference set.
// Asking for them expanded on every POI costs ~4x the payload (1.5 MB for a
// city instead of 370 KB), so we fetch the lookup once per session instead.
let referencePromise = null

function loadReference() {
  if (!referencePromise) {
    referencePromise = fetch(`${REFERENCE_API}?key=${encodeURIComponent(KEY)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`OCM ref ${r.status}`))))
      .then(ref => ({
        connectors: new Map((ref.ConnectionTypes || []).map(c => [c.ID, c.Title])),
        operators: new Map((ref.Operators || []).map(o => [o.ID, o.Title])),
      }))
      .catch(() => {
        referencePromise = null       // retry on the next pan
        return { connectors: new Map(), operators: new Map() }
      })
  }
  return referencePromise
}

// OCM usually lists each socket as its own connection with no Quantity, so an
// identical pair reads as a duplicate line. Collapse them into one "2×" entry.
function mergeConnections(rows, ref) {
  const byKind = new Map()
  for (const c of rows) {
    const type = ref.connectors.get(c.ConnectionTypeID) || 'Onbekende stekker'
    const kw = c.PowerKW ?? null
    const key = `${type}|${kw}`
    const seen = byKind.get(key)
    const count = c.Quantity ?? 1
    if (seen) seen.quantity += count
    else byKind.set(key, { type, kw, quantity: count })
  }
  return [...byKind.values()]
}

function normalize(poi, ref) {
  const a = poi.AddressInfo || {}
  return {
    id: poi.ID,
    lat: a.Latitude,
    lon: a.Longitude,
    title: a.Title || 'Laadpunt',
    street: [a.AddressLine1, a.Town].filter(Boolean).join(', '),
    operator: ref.operators.get(poi.OperatorID) || '',
    points: poi.NumberOfPoints ?? null,
    connections: mergeConnections(poi.Connections || [], ref),
  }
}

// Charge points inside the given Leaflet bounds. Returns [] when no key is
// configured or the request fails — the map simply shows no charge points.
export async function fetchChargePoints(sw, ne) {
  if (!KEY) return []
  const key = boxKey(sw, ne)
  if (cache.has(key)) return cache.get(key)

  // OCM wants the box as top-left then bottom-right: (lat,lng),(lat2,lng2)
  const box = `(${ne.lat},${sw.lng}),(${sw.lat},${ne.lng})`
  const url = `${API}?output=json&compact=true&verbose=false&maxresults=${MAX_RESULTS}` +
    `&boundingbox=${encodeURIComponent(box)}&key=${encodeURIComponent(KEY)}`

  const promise = Promise.all([
    fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(`OCM ${r.status}`)))),
    loadReference(),
  ])
    .then(([rows, ref]) => (Array.isArray(rows) ? rows : [])
      .map(poi => normalize(poi, ref))
      .filter(p => p.lat != null && p.lon != null))
    .catch(() => {
      cache.delete(key)   // let a later pan retry after a transient failure
      return []
    })

  cache.set(key, promise)
  return promise
}
