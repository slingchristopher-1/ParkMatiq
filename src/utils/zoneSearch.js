import { loadZones, featureBBox } from './zones'
import { zoneForPoint } from './tariff'

// Find parking zones by what the street sign says: the zone number
// ("50", "Zone 50" in Rotterdam) or the zone's name ("Kanaleneiland").
//
// Matches RDW's own area id and description. Some cities print a parking
// machine number on the sign instead (Den Haag, Amsterdam: 5 digits); those
// are not in our zone data and are not matched here.

const LOCAL_KM = 10

function norm(s) {
  return String(s || '').toLowerCase().replace(/^zone\s+/, '').trim()
}

// A point that is really inside the feature, for dropping the pin on. The
// bbox centre usually is; for an L- or U-shaped zone we scan a grid and take
// the inside point closest to the centre. Zones drawn as a street (Den Haag's
// "Kernwinkelstraten") are too thin for any grid, so as a last resort we step
// a metre inward from the middle of each edge of the outline.
function interiorPoint(f, data) {
  const [minLon, minLat, maxLon, maxLat] = featureBBox(f)
  const cLat = (minLat + maxLat) / 2, cLon = (minLon + maxLon) / 2
  const one = { schedules: data.schedules, features: [f] }
  if (zoneForPoint(cLat, cLon, one)) return [cLat, cLon]
  let best = null, bestD = Infinity
  const N = 12
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const lat = minLat + ((maxLat - minLat) * i) / N
      const lon = minLon + ((maxLon - minLon) * j) / N
      if (!zoneForPoint(lat, lon, one)) continue
      const d = (lat - cLat) ** 2 + (lon - cLon) ** 2
      if (d < bestD) { bestD = d; best = [lat, lon] }
    }
  }
  if (best) return best
  const g = f.geometry
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]
  const EPS = 0.00001 // ~1 m
  for (let i = 1; i < ring.length; i++) {
    const [lon1, lat1] = ring[i - 1], [lon2, lat2] = ring[i]
    const len = Math.hypot(lon2 - lon1, lat2 - lat1)
    if (!len) continue
    const mLon = (lon1 + lon2) / 2, mLat = (lat1 + lat2) / 2
    const nLon = -(lat2 - lat1) / len * EPS, nLat = (lon2 - lon1) / len * EPS
    for (const k of [1, -1]) {
      if (zoneForPoint(mLat + k * nLat, mLon + k * nLon, one)) return [mLat + k * nLat, mLon + k * nLon]
    }
  }
  return null
}

// Up to `limit` zones matching `query`. Matches within LOCAL_KM of `near`
// ([lat, lon], e.g. the map centre) come first — "Zone 10" and "Centrum" exist
// in dozens of municipalities and the driver means the one around them — then
// the rest of the country; within each group exact matches before partial
// ones, nearest first. Each result has
// { desc, municipality, maxRate, point } where point is inside the zone.
export async function searchZones(query, near, limit = 5) {
  const q = norm(query)
  if (!q) return []
  const data = await loadZones()
  if (!data?.features) return []

  const found = new Map()
  for (const f of data.features) {
    const p = f.properties
    const id = norm(p.areaid), desc = norm(p.desc)
    // What the sign says beats RDW's internal id: "Zone 10" in Rotterdam
    // before a zone elsewhere that merely has id 10 under another name.
    const exact = desc === q ? 2 : id === q ? 1 : 0
    if (!exact && !(q.length >= 3 && desc.includes(q))) continue
    const [minLon, minLat, maxLon, maxLat] = featureBBox(f)
    // Kilometres, flat-earth: plenty for ranking at Dutch latitudes.
    const dist = near
      ? Math.hypot(((minLat + maxLat) / 2 - near[0]) * 111, ((minLon + maxLon) / 2 - near[1]) * 68)
      : 0
    const key = `${p.municipality}|${p.desc}`
    const prev = found.get(key)
    // One entry per zone name per municipality: the part nearest the driver.
    if (!prev || dist < prev.dist) {
      found.set(key, { f, exact, dist, desc: p.desc, municipality: p.municipality || '', maxRate: p.maxEurPerHour ?? null })
    }
  }

  const out = []
  const local = r => (r.dist <= LOCAL_KM ? 1 : 0)
  const ranked = [...found.values()]
    .sort((a, b) => (local(b) - local(a)) || (b.exact - a.exact) || (a.dist - b.dist))
  for (const r of ranked) {
    const point = interiorPoint(r.f, data)
    if (point) out.push({ desc: r.desc, municipality: r.municipality, maxRate: r.maxRate, point })
    if (out.length >= limit) break
  }
  return out
}
