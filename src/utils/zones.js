
// Single cached fetch of the bundled GeoJSON, shared by the map layer and the
// tariff lookup so the file is only requested once.
//
// Resolves to `null` when the file could not be loaded (offline first run, a
// failed deploy). That is deliberately distinct from an empty zone list: missing
// data must read as "tarief onbekend", never as "gratis parkeren". A failure
// also clears the cache so the next caller retries.
let cache = null

export function loadZones() {
  if (!cache) {
    // Imported lazily: the ?url form is a bundler feature, and keeping it off
    // the module's top level lets the geometry below be unit-tested in Node.
    cache = import('../data/nl-parking-zones.geojson?url')
      .then(m => fetch(m.default))
      .then(r => {
        if (!r.ok) throw new Error(`zones ${r.status}`)
        return r.json()
      })
      .catch(() => { cache = null; return null })
  }
  return cache
}

// Cached bounding box [minLon, minLat, maxLon, maxLat] for a feature. With ~3k
// nationwide zones, a cheap box test lets both the tariff lookup and the map
// layer skip zones nowhere near the point/viewport instead of scanning polygons.
export function featureBBox(f) {
  if (f.__bbox) return f.__bbox
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  const scan = ring => {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  const g = f.geometry
  if (g?.type === 'Polygon') g.coordinates.forEach(scan)
  else if (g?.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(scan))
  f.__bbox = [minLon, minLat, maxLon, maxLat]
  return f.__bbox
}

// ── neighbouring zones ───────────────────────────────────────────────────────
// "The zone next door" has to mean next door. A cheaper zone two neighbourhoods
// away is not an alternative to where you actually park, so proximity is
// measured between the polygons themselves rather than between their centres:
// two long zones running down the same street have centres far apart and still
// touch.

const EARTH_M_PER_DEG = 111320

function ringsOf(geom) {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates[0]]
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p[0])
  return []
}

// Metres between two lon/lat points, flat-earth. Over the few hundred metres
// this is used for, the error is far below the accuracy of a phone's fix.
function metresBetween(a, b, cosLat) {
  const dx = (a[0] - b[0]) * EARTH_M_PER_DEG * cosLat
  const dy = (a[1] - b[1]) * EARTH_M_PER_DEG
  return Math.hypot(dx, dy)
}

export function metresApart(f1, f2) {
  const r1 = ringsOf(f1.geometry)
  const r2 = ringsOf(f2.geometry)
  if (!r1.length || !r2.length) return Infinity

  const cosLat = Math.cos((r1[0][0][1] * Math.PI) / 180)
  let best = Infinity
  for (const ringA of r1) {
    for (const ringB of r2) {
      for (const a of ringA) {
        for (const b of ringB) {
          const d = metresBetween(a, b, cosLat)
          if (d < best) best = d
          if (best === 0) return 0
        }
      }
    }
  }
  return best
}

// Zones whose edge comes within `maxMeters` of this one. The bounding-box test
// first, so a nationwide file does not turn one lookup into three thousand
// polygon comparisons.
export function neighboursOf(target, data, maxMeters = 150) {
  if (!target || !data?.features) return []

  const [minLon, minLat, maxLon, maxLat] = featureBBox(target)
  const padLat = maxMeters / EARTH_M_PER_DEG
  const padLon = padLat / Math.max(0.2, Math.cos((minLat * Math.PI) / 180))

  const out = []
  for (const f of data.features) {
    if (f === target) continue
    if (f.properties.areaid === target.properties.areaid &&
        f.properties.areamanagerid === target.properties.areamanagerid) continue

    const [bMinLon, bMinLat, bMaxLon, bMaxLat] = featureBBox(f)
    if (bMaxLon < minLon - padLon || bMinLon > maxLon + padLon) continue
    if (bMaxLat < minLat - padLat || bMinLat > maxLat + padLat) continue

    const d = metresApart(target, f)
    if (d <= maxMeters) out.push({ feature: f, metres: Math.round(d) })
  }
  return out.sort((a, b) => a.metres - b.metres)
}

