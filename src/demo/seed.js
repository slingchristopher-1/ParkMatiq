// A month of plausible history for the demo build.
//
// The zones, their ids and their rates are real, taken from the RDW data the
// app already ships, and each one genuinely has a cheaper zone bordering it —
// otherwise "waar je had kunnen parkeren" would compute nothing and the card
// would not appear at all. The coordinates were checked against
// zoneForPoint(), so every seeded session resolves to the zone it claims.
//
// Deterministic: the same seed produces the same month every time, so the
// screen being demonstrated is the screen that was rehearsed.

const ZONES = [
  { desc: 'Binnenstad Diepenring 2', zoneId: '3003', rate: 5.00, lat: 53.21555, lon: 6.56705, weight: 10 },
  { desc: 'Oosterpoort',             zoneId: '3006', rate: 4.50, lat: 53.21139, lon: 6.58001, weight: 7 },
  { desc: 'Grunobuurt/Laanhuizen',   zoneId: '3007', rate: 4.50, lat: 53.20755, lon: 6.55438, weight: 5 },
  { desc: 'Rivierenbuurt',           zoneId: '3012', rate: 4.50, lat: 53.20685, lon: 6.56982, weight: 4 },
]

const PLATE = 'G-123-BB'

// Mulberry32 — small, seeded, and good enough for picking plausible numbers.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickZone(r) {
  const total = ZONES.reduce((a, z) => a + z.weight, 0)
  let n = r() * total
  for (const z of ZONES) { if ((n -= z.weight) <= 0) return z }
  return ZONES[0]
}

const round2 = n => Math.round(n * 100) / 100

export function buildMonth(now = new Date()) {
  const r = rng(20261025)
  const sessions = []
  const prompts = []

  // 31 days back to today. Weekdays get a stay more often than weekends, and
  // a day never has more than two — one driver, one car.
  for (let daysAgo = 31; daysAgo >= 0; daysAgo--) {
    const day = new Date(now)
    day.setDate(day.getDate() - daysAgo)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const chance = weekend ? 0.35 : 0.72
    const count = r() < chance ? (r() < 0.18 ? 2 : 1) : 0

    for (let i = 0; i < count; i++) {
      const zone = pickZone(r)
      const start = new Date(day)
      // Morning errand or an afternoon/evening stay.
      const hour = i === 0 ? 8 + Math.floor(r() * 4) : 14 + Math.floor(r() * 5)
      start.setHours(hour, Math.floor(r() * 60), 0, 0)
      if (start > now) continue

      const minutes = 20 + Math.floor(r() * 160)      // 20 min – 3 hours
      const end = new Date(start.getTime() + minutes * 60000)
      const cost = round2(Math.min((minutes / 60) * zone.rate, 17.50))

      // Most sessions begin from a prompt; some are started by hand before the
      // app has noticed anything.
      const fromPrompt = r() < 0.72
      // Most are stopped from the prompt too, and those carry the lag that
      // "nadat je wegreed" reports.
      const stoppedByPrompt = r() < 0.68
      const lag = stoppedByPrompt ? 1 + Math.floor(r() * 9) : null

      sessions.push({
        id: start.getTime(),
        plate: PLATE,
        purpose: r() < 0.25 ? 'business' : 'personal',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        duration: minutes * 60,
        cost,
        rate: zone.rate,
        lat: zone.lat,
        lon: zone.lon,
        zoneDesc: zone.desc,
        zoneId: zone.zoneId,
        tariff: 'paid',
        zonePicked: false,
        dayCap: 17.50,
        startedBy: fromPrompt ? 'prompt' : 'button',
        stoppedBy: stoppedByPrompt ? 'prompt' : 'button',
        stopLagMinutes: lag,
      })

      // The prompt log mirrors how the app records them: a start prompt is
      // written when it is sent and marked acted if a session follows, and a
      // stop prompt is written when the driver answers it.
      if (fromPrompt) {
        prompts.push({ kind: 'start', acted: true, at: new Date(start.getTime() - 90000).toISOString() })
      }
      if (stoppedByPrompt) {
        prompts.push({ kind: 'stop', acted: true, at: new Date(end.getTime() - lag * 60000).toISOString() })
      } else {
        prompts.push({ kind: 'stop', acted: false, at: new Date(end.getTime() - 60000).toISOString() })
      }
    }

    // Parked somewhere free, or simply did not answer: a start prompt that
    // never became a session. Without these "startmeldingen" would read 100%.
    if (r() < 0.22) {
      const at = new Date(day)
      at.setHours(12 + Math.floor(r() * 6), Math.floor(r() * 60), 0, 0)
      if (at <= now) prompts.push({ kind: 'start', acted: false, at: at.toISOString() })
    }
  }

  // Newest first, the order logPrompt keeps them in.
  prompts.sort((a, b) => new Date(b.at) - new Date(a.at))
  sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
  return { sessions, prompts }
}

export const DEMO_PLATE = PLATE
export const DEMO_ZONES = ZONES
