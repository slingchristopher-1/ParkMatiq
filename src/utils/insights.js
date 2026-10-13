// What the history screen is allowed to claim.
//
// Every figure here is something the app measured. The app prompts and the
// driver answers; it never starts or stops a session by itself, so nothing is
// expressed as money saved against a stop that never happened.
import { neighboursOf } from './zones'
import { zoneForPoint, rateAt } from './tariff'

// ── prompts ──────────────────────────────────────────────────────────────────
// Read from the prompt log, not from sessions. A start prompt the driver
// ignores leaves no session behind, and a declined stop prompt leaves one that
// is eventually stopped by hand — counting sessions would make "acted on" a
// permanent 100%.
//
// Start and stop stay separate: ignoring a start prompt costs nothing, ignoring
// a stop prompt costs money.
export function promptStats(prompts) {
  const stat = kind => {
    const all = prompts.filter(p => p.kind === kind)
    const acted = all.filter(p => p.acted).length
    return {
      prompts: all.length,
      acted,
      pct: all.length ? Math.round((acted / all.length) * 100) : null,
    }
  }
  return { start: stat('start'), stop: stat('stop') }
}

// ── how long a session ran after you drove off ───────────────────────────────
// Minutes, deliberately. The gap between the prompt firing and the session
// ending is measured; pricing it would need to know when the driver would
// otherwise have noticed, which nothing here does.
export function stopLag(sessions) {
  const lags = sessions
    .filter(s => s.stoppedBy === 'prompt' && typeof s.stopLagMinutes === 'number')
    .map(s => s.stopLagMinutes)
    .sort((a, b) => a - b)

  if (!lags.length) return { count: 0, median: null, total: null }

  const mid = Math.floor(lags.length / 2)
  const median = lags.length % 2 ? lags[mid] : Math.round((lags[mid - 1] + lags[mid]) / 2)
  return { count: lags.length, median, total: lags.reduce((a, b) => a + b, 0) }
}

// ── zones ────────────────────────────────────────────────────────────────────
// Grouped on the zone the session recorded, keeping one fix per zone so the
// polygon can be resolved later. areaid alone would not do it: the same id is
// reused by dozens of municipalities.
export function zoneUsage(sessions) {
  const by = new Map()
  for (const s of sessions) {
    const key = s.zoneId == null ? 'none' : `${s.zoneDesc || ''}|${s.zoneId}`
    const z = by.get(key) || {
      key,
      label: s.zoneDesc || 'Onbekende zone',
      visits: 0,
      spend: 0,
      minutes: 0,
      lat: s.lat ?? null,
      lon: s.lon ?? null,
    }
    z.visits += 1
    z.spend += s.cost || 0
    z.minutes += (s.duration || 0) / 60
    if (z.lat == null && s.lat != null) { z.lat = s.lat; z.lon = s.lon }
    by.set(key, z)
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits)
}

// The cheapest zone that actually borders this one, and what the hours already
// parked here would have cost there instead. Null unless there is a real,
// cheaper, adjacent zone — inventing one would send people on a walk for
// nothing.
export function cheaperNeighbour(usage, data, { when = new Date(), maxMeters = 150 } = {}) {
  if (!data || usage?.lat == null) return null

  const here = featureAt(usage.lat, usage.lon, data)
  if (!here) return null

  const hereRate = rateOf(here, data, when)
  if (hereRate === null || hereRate <= 0) return null

  let best = null
  for (const { feature, metres } of neighboursOf(here, data, maxMeters)) {
    const rate = rateOf(feature, data, when)
    if (rate === null || rate >= hereRate) continue
    if (!best || rate < best.rate) {
      best = { rate, metres, label: feature.properties.desc }
    }
  }
  if (!best) return null

  const hours = (usage.minutes || 0) / 60
  return {
    label: best.label,
    metres: best.metres,
    rate: best.rate,
    hereRate,
    // An estimate, and only honest while it is called one: the cheaper zone can
    // keep different paid hours.
    wouldHaveCost: round2(hours * best.rate),
    actuallyCost: round2(usage.spend),
    difference: round2(usage.spend - hours * best.rate),
  }
}

export function cheaperAlternatives(usageList, data, opts = {}) {
  const limit = opts.limit ?? 4
  const out = []
  for (const usage of usageList.slice(0, limit)) {
    const alt = cheaperNeighbour(usage, data, opts)
    if (alt) out.push({ usage, alt })
  }
  return out
}

export function totalDifference(alternatives) {
  return round2(alternatives.reduce((a, x) => a + x.alt.difference, 0))
}

function round2(n) { return Math.round(n * 100) / 100 }

// The raw feature under a point. zoneForPoint returns the priced shape the rest
// of the app works with; the geometry is what adjacency needs.
function featureAt(lat, lon, data) {
  const zone = zoneForPoint(lat, lon, data)
  if (!zone) return null
  return data.features.find(f =>
    f.properties.areaid === zone.areaid &&
    (f.properties.municipality || '') === (zone.municipality || '')) || null
}

function rateOf(feature, data, when) {
  const sched = feature.properties.sched
  if (!sched) return null                        // tariff unknown — never guess
  const windows = data.schedules?.[sched]
  if (!windows) return null
  const now = rateAt(windows, when)
  if (now > 0) return now
  // Outside paid hours every zone is free, which would make them all tie. Rank
  // on the zone's own top rate, which is what a driver chooses on.
  return feature.properties.maxEurPerHour ?? null
}
