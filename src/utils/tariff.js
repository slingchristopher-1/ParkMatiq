import { loadZones, featureBBox } from './zones'

// Ray-casting point-in-polygon. ring is an array of [lon, lat] pairs.
function pointInRing(lat, lon, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const hit = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

// A point is inside a polygon when it's inside the outer ring and outside every
// hole. RDW zones carry 200+ polygons with holes (courtyards, free side streets
// cut out of a paid zone) — ignoring them charges for free parking.
function pointInPolygon(lat, lon, rings) {
  if (!pointInRing(lat, lon, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false
  }
  return true
}

function pointInFeature(lat, lon, geom) {
  if (!geom) return false
  if (geom.type === 'Polygon') return pointInPolygon(lat, lon, geom.coordinates)
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => pointInPolygon(lat, lon, poly))
  }
  return false
}

// The shape every consumer of a zone works with, whether it was found under the
// car or picked from a list. Kept in one place so a picked zone prices exactly
// the same way a detected one does.
function zoneFromFeature(f, data) {
  const p = f.properties
  return {
    windows: p.sched ? data.schedules?.[p.sched] ?? null : null,
    maxRate: p.maxEurPerHour ?? null,
    dayCap: p.dayCap ?? null,
    desc: p.desc,
    areaid: p.areaid,
    municipality: p.municipality || '',
  }
}

// Returns the zone containing the point, or null. A point can fall in both a
// priced zone and one whose tariff we couldn't resolve (they overlap where a
// municipality files the same street twice); the priced one wins, because it
// tells the driver more.
export function zoneForPoint(lat, lon, data) {
  if (lat == null || lon == null || !data?.features) return null
  let fallback = null
  for (const f of data.features) {
    const [minLon, minLat, maxLon, maxLat] = featureBBox(f)
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue
    if (!pointInFeature(lat, lon, f.geometry)) continue
    const zone = zoneFromFeature(f, data)
    if (zone.windows) return zone
    if (!fallback) fallback = zone
  }
  return fallback
}

const M_PER_DEG_LAT = 111320

// How far a paid zone may sit from a point that resolved to no zone before we
// stop calling that point free. This is not GPS error — it is the gap between
// the RDW outlines and the kerb people actually park at, which the measurements
// in rateForSession put in the tens of metres. A real fix's own accuracy is
// taken on top of this, never below it.
//
// The two mistakes are not equally bad. Saying "we don't know" where parking is
// in fact free costs the driver a glance at a sign they are standing next to;
// saying "free" where it is not costs them a fine. So this is set generously:
// on the Kop van Zuid it reclassifies about a third of the no-zone points,
// while the median such point sits ~120 m from any paid zone and stays free.
const ZONE_EDGE_SLACK_M = 75

// A fix so vague that everything is "nearby" tells the driver nothing, and the
// bbox sweep gets expensive. Beyond this we stop widening the search.
const MAX_REACH_M = 1000

// Shortest distance in metres from a point to a feature's polygon edges.
// Coordinates are projected to local metres first; over a few hundred metres
// at Dutch latitudes the distortion is far below the numbers we compare against.
function distanceToFeature(lat, lon, geom, mPerDegLon) {
  if (!geom) return Infinity
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates
    : []
  const px = lon * mPerDegLon, py = lat * M_PER_DEG_LAT
  let best = Infinity
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0] * mPerDegLon, ay = ring[j][1] * M_PER_DEG_LAT
        const bx = ring[i][0] * mPerDegLon, by = ring[i][1] * M_PER_DEG_LAT
        const vx = bx - ax, vy = by - ay
        const len2 = vx * vx + vy * vy
        let t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
        if (d < best) best = d
      }
    }
  }
  return best
}

// Zones whose edge lies within `maxMeters` of the point, closest first, each
// carrying its distance in metres. A municipality files one area as several
// polygons, so the same zone can match repeatedly — collapsed to one entry.
export function zonesWithin(lat, lon, data, maxMeters, limit = 6) {
  if (lat == null || lon == null || !data?.features || !(maxMeters > 0)) return []
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  const padLat = maxMeters / M_PER_DEG_LAT
  const padLon = maxMeters / mPerDegLon
  const found = []
  for (const f of data.features) {
    const [minLon, minLat, maxLon, maxLat] = featureBBox(f)
    if (lon < minLon - padLon || lon > maxLon + padLon) continue
    if (lat < minLat - padLat || lat > maxLat + padLat) continue
    const d = distanceToFeature(lat, lon, f.geometry, mPerDegLon)
    if (d > maxMeters) continue
    found.push({ ...zoneFromFeature(f, data), distance: Math.round(d) })
  }
  found.sort((a, b) => a.distance - b.distance)
  const seen = new Set()
  const out = []
  for (const z of found) {
    const key = zoneKey(z)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(z)
    if (out.length >= limit) break
  }
  return out
}

// Identity of a zone across the dataset: RDW reuses area ids between
// municipalities, so neither half is unique on its own.
export function zoneKey(zone) {
  return `${zone?.municipality || ''}|${zone?.areaid}`
}

// Nearby zones for the picker, ordered closest first. Wider than the slack that
// decides 'free' vs 'unknown': a driver correcting us may be standing further
// from the outline than we would ever guess at on our own.
export async function nearbyZones(lat, lon, maxMeters = 150, limit = 6) {
  const data = await loadZones()
  if (!data) return []
  return zonesWithin(lat, lon, data, maxMeters, limit)
}

// The tariff in force at `when`, from a zone's weekly windows. Outside every
// window parking is free — that is the normal case in the evening and on
// Sunday, and charging the daytime rate then is simply wrong.
export function rateAt(windows, when = new Date()) {
  if (!windows?.length) return 0
  const day = when.getDay()
  const minute = when.getHours() * 60 + when.getMinutes()
  for (const [d, start, end, rate] of windows) {
    if (d === day && minute >= start && minute < end) return rate
  }
  return 0
}

// Start of day `n` days after `from`, at `minute` past midnight. Built from
// local calendar fields so it stays correct across the DST switches.
function localMinute(from, dayOffset, minute) {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + dayOffset, 0, minute)
}

// End of the paid window running at `when`, or null when parking is free then.
// Consecutive windows that touch (23:00-24:00 followed by 00:00-01:00 the next
// day) are treated as one, so "meter loopt tot" shows the real end.
export function paidUntil(windows, when = new Date()) {
  if (!rateAt(windows, when)) return null
  let cursor = when
  for (let guard = 0; guard < 14; guard++) {
    const day = cursor.getDay()
    const minute = cursor.getHours() * 60 + cursor.getMinutes()
    const w = windows.find(([d, s, e]) => d === day && minute >= s && minute < e)
    if (!w) return cursor
    cursor = localMinute(cursor, 0, w[2])
    if (rateAt(windows, cursor) === 0) return cursor
  }
  return cursor
}

// When paid parking next starts, or null if not within a week.
export function nextPaidStart(windows, when = new Date()) {
  if (!windows?.length) return null
  for (let offset = 0; offset <= 7; offset++) {
    const day = (when.getDay() + offset) % 7
    const after = offset === 0 ? when.getHours() * 60 + when.getMinutes() : -1
    const starts = windows
      .filter(([d, s]) => d === day && s > after)
      .map(([, s]) => s)
      .sort((a, b) => a - b)
    if (starts.length) return localMinute(when, offset, starts[0])
  }
  return null
}

// What a stay actually costs: only the minutes that fall inside a paid window
// are billed. A session that runs past the end of paid hours stops accruing.
// `dayCap` (EUR) limits what a single calendar day can cost — the municipality's
// dagtarief, or the driver's own ceiling, whichever binds first.
export function costBetween(windows, startMs, endMs, dayCap = null) {
  if (!windows?.length || !(endMs > startMs)) return 0
  let total = 0
  const start = new Date(startMs)
  for (let offset = 0; offset < 400; offset++) {
    const dayStart = localMinute(start, offset, 0)
    if (dayStart.getTime() >= endMs) break
    const day = dayStart.getDay()
    let today = 0
    for (const [d, s, e, rate] of windows) {
      if (d !== day) continue
      const from = Math.max(localMinute(start, offset, s).getTime(), startMs)
      const to = Math.min(localMinute(start, offset, e).getTime(), endMs)
      if (to > from) today += ((to - from) / 3600000) * rate
    }
    total += dayCap != null ? Math.min(today, dayCap) : today
  }
  return total
}

// The ceiling for one day of this session: the zone's dagtarief and the
// driver's own limit, whichever is lower. Either may be absent.
export function effectiveDayCap(zoneCap, userCap) {
  const caps = [zoneCap, userCap].filter(c => typeof c === 'number' && c > 0)
  return caps.length ? Math.min(...caps) : null
}

// True when a resolved zone is covered by one of the user's resident permits.
// Permits are issued per parking zone, and a single permit zone usually spans
// several RDW areas that share a name, so a name+municipality match counts too.
export function zoneHasPermit(zone, permitZones) {
  if (!zone || !permitZones?.length) return false
  return permitZones.some(p =>
    p.areaid === zone.areaid ||
    (!!p.desc && p.desc === zone.desc && (p.municipality || '') === (zone.municipality || ''))
  )
}

// Resolve the tariff for a parked location. `tariff` says why the rate is what
// it is, so the UI can be honest instead of inventing a price:
//   'paid'     — inside a mapped paid zone during its paid hours
//   'permit'   — inside a zone the user holds a resident permit for, free
//   'free'     — location known, no paid zone here, free
//   'evening'  — inside a paid zone but outside its hours right now, free
//   'unknown'  — no location fix, no zone data, a zone whose tariff RDW
//                doesn't let us resolve, or a spot too close to a paid zone to
//                call free (never charge on a guess, never promise free on one)
//
// `accuracy` is the fix's error radius in metres, straight from the Geolocation
// API. It widens the "too close to call" check below; omit it and only the
// fixed slack applies.
export async function rateForSession(
  lat, lon, permitZones = [], { accuracy = null, when = new Date() } = {}
) {
  const none = { rate: 0, windows: null, zoneDesc: null, zoneId: null, municipality: '' }
  if (lat == null || lon == null) return { ...none, tariff: 'unknown' }

  const data = await loadZones()
  if (!data) return { ...none, tariff: 'unknown' }

  const zone = zoneForPoint(lat, lon, data)
  if (!zone) {
    // "No polygon covers this point" is not the same as "parking is free here",
    // and reporting it as free is how a driver ends up with a fine. Two errors
    // stack: RDW outlines sit back from the kerb and leave gaps between blocks,
    // and the phone's own fix carries an error radius. Measured over the Kop van
    // Zuid, 63% of sampled points resolve to no zone at all, while a paid zone
    // sits within 50 m of 23% of them and within 75 m of 34%. So only call it
    // free when nothing paid is close enough to plausibly be the real answer;
    // otherwise say we don't know. Either way nothing is charged — but only one
    // of them tells the driver to read the sign.
    const reach = Math.min(Math.max(accuracy ?? 0, ZONE_EDGE_SLACK_M), MAX_REACH_M)
    const [near] = zonesWithin(lat, lon, data, reach, 1)
    if (near) return { ...none, tariff: 'unknown', nearZone: near }
    return { ...none, tariff: 'free' }
  }

  return rateForZone(zone, permitZones, { when })
}

// Price a zone we already have in hand — detected under the car, or named by
// the driver in the picker. Both go through here, so a corrected zone bills on
// exactly the same rules as a detected one rather than a parallel set.
export function rateForZone(zone, permitZones = [], { when = new Date() } = {}) {
  const base = {
    zoneDesc: zone.desc,
    zoneId: zone.areaid,
    municipality: zone.municipality,
  }
  // A zone we know is paid but whose tariff we couldn't resolve from RDW.
  if (!zone.windows) return { ...base, rate: 0, windows: null, tariff: 'unknown' }
  if (zoneHasPermit(zone, permitZones)) {
    return { ...base, rate: 0, windows: zone.windows, tariff: 'permit' }
  }

  const rate = rateAt(zone.windows, when)
  return {
    ...base,
    rate,
    windows: zone.windows,
    zoneDayCap: zone.dayCap,
    tariff: rate > 0 ? 'paid' : 'evening',
    paidUntil: rate > 0 ? paidUntil(zone.windows, when)?.getTime() ?? null : null,
    nextPaid: rate > 0 ? null : nextPaidStart(zone.windows, when)?.getTime() ?? null,
  }
}

export function costFor(durationSec, rate) {
  return (durationSec / 3600) * (rate ?? 0)
}

// Cost of a stay that started at `startTime`, billed against the zone's weekly
// windows when the session carries them. Sessions recorded before the windows
// existed fall back to the flat rate they stored.
export function costOf(session, endMs = Date.now()) {
  const startMs = new Date(session.startTime).getTime()
  if (session.windows) return costBetween(session.windows, startMs, endMs, session.dayCap)
  return costFor(Math.max(0, (endMs - startMs) / 1000), session.rate)
}

// Cost of a completed session, tolerant of older records without rate/cost.
export function sessionCost(s) {
  if (typeof s.cost === 'number') return s.cost
  if (s.windows && s.startTime && s.endTime) {
    return costBetween(s.windows, new Date(s.startTime).getTime(),
                       new Date(s.endTime).getTime(), s.dayCap)
  }
  return costFor(s.duration || 0, s.rate)
}

// True once the day's cap is what's holding the price down — the point where
// the meter has effectively stopped for today.
export function dayCapReached(session, at = Date.now()) {
  if (!session?.dayCap || !session.windows) return false
  const inAnHour = costOf(session, at + 3600000)
  return inAnHour <= costOf(session, at) && rateAt(session.windows, new Date(at)) > 0
}

// What a traditional meter charges for the same stay: every started hour is
// billed in full at the zone rate. This is the honest baseline ParkMatiq beats
// by charging only the minutes actually used. Only billable time counts — a
// meter doesn't run outside paid hours either.
export function meterCost(s) {
  const rate = s.rate ?? 0
  if (!rate) return 0
  const paidHours = sessionCost(s) / rate
  return Math.ceil(paidHours) * rate
}

// Savings for one session vs. a per-hour meter (never negative).
export function savingsVsMeter(s) {
  return Math.max(0, meterCost(s) - sessionCost(s))
}

export function formatEuro(n) {
  return '€' + (n || 0).toFixed(2).replace('.', ',')
}

// An amount as typed into a settings field ("12,50"), or null when unusable.
export function parseAmount(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// "23:00" for a moment later today, "ma 09:00" when it falls on another day —
// used to tell the driver when the meter stops or starts running.
export function formatWhen(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return time
  return `${d.toLocaleDateString('nl-NL', { weekday: 'short' })} ${time}`
}
