// What the history screen is allowed to claim.
//
// SHARED CORE. The rule here is that every figure must be something the app
// measured. The app prompts and the driver acts; it never stops a session
// itself, so there is no counterfactual to price and nothing is expressed as
// money saved.
import { neighboursOf, featureByAreaId, rateAt } from './zones.js';

// ── prompts ──────────────────────────────────────────────────────────────────
// Start and stop prompts are different questions and deserve separate numbers:
// ignoring a start prompt costs nothing, ignoring a stop prompt costs money.
export function promptStats(sessions) {
  const count = (list, kind) => list.filter(s => s[kind]).length;

  const startPrompts = count(sessions, 'promptedStart');
  const startActed = sessions.filter(s => s.promptedStart && s.startedFromPrompt).length;
  const stopPrompts = count(sessions, 'promptedStop');
  const stopActed = sessions.filter(s => s.promptedStop && s.stoppedFromPrompt).length;

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

  return {
    start: { prompts: startPrompts, acted: startActed, pct: pct(startActed, startPrompts) },
    stop: { prompts: stopPrompts, acted: stopActed, pct: pct(stopActed, stopPrompts) },
  };
}

// ── how long a session ran after you left ────────────────────────────────────
// Minutes, deliberately. This is measured: the gap between driving off and the
// session ending. Turning it into euros would need to know when the driver
// would otherwise have noticed, which nothing here does.
export function stopLag(sessions) {
  const lags = sessions
    .filter(s => s.stoppedFromPrompt && typeof s.lagMinutes === 'number')
    .map(s => s.lagMinutes)
    .sort((a, b) => a - b);

  if (!lags.length) return { count: 0, median: null, total: null };

  const mid = Math.floor(lags.length / 2);
  const median = lags.length % 2 ? lags[mid] : Math.round((lags[mid - 1] + lags[mid]) / 2);
  return {
    count: lags.length,
    median,
    total: lags.reduce((a, b) => a + b, 0),
  };
}

// ── zones ────────────────────────────────────────────────────────────────────
export function zoneUsage(sessions) {
  const by = new Map();
  for (const s of sessions) {
    const key = s.zoneKey || s.zone;
    const z = by.get(key) || {
      key, label: s.zone, visits: 0, spend: 0, minutes: 0,
      areaid: s.areaid, areamanagerid: s.areamanagerid,
    };
    z.visits += 1;
    z.spend += s.cost;
    z.minutes += s.minutes || 0;
    by.set(key, z);
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits);
}

// The cheapest zone that actually borders this one, and what the hours already
// parked here would have cost there instead.
//
// Returns null unless there is a real, cheaper, adjacent zone — no alternative
// is a perfectly good answer, and inventing one would send people on a walk for
// nothing.
export function cheaperNeighbour(usage, data, { when = new Date(), maxMeters = 150 } = {}) {
  if (!data || !usage?.areaid) return null;

  const here = featureByAreaId(data, usage.areamanagerid, usage.areaid);
  if (!here) return null;

  const hereRate = rateOf(here, data, when);
  if (hereRate === null || hereRate <= 0) return null;

  let best = null;
  for (const { feature, metres } of neighboursOf(here, data, maxMeters)) {
    const rate = rateOf(feature, data, when);
    if (rate === null || rate >= hereRate) continue;
    if (!best || rate < best.rate) {
      best = { rate, metres, label: feature.properties.desc, feature };
    }
  }
  if (!best) return null;

  const hours = (usage.minutes || 0) / 60;
  return {
    label: best.label,
    metres: best.metres,
    rate: best.rate,
    hereRate,
    // What those same hours would have cost next door. An estimate, and only
    // honest while it is called one: the cheaper zone may keep different hours.
    wouldHaveCost: Math.round(hours * best.rate * 100) / 100,
    actuallyCost: Math.round(usage.spend * 100) / 100,
    difference: Math.round((usage.spend - hours * best.rate) * 100) / 100,
  };
}

function rateOf(feature, data, when) {
  const sched = feature.properties.sched;
  if (!sched) return null;                       // tariff unknown — never guess
  const windows = data.schedules?.[sched];
  if (!windows) return null;
  const now = rateAt(windows, when);
  if (now > 0) return now;
  // Outside paid hours every zone is free, which would make them all tie. Rank
  // on the zone's own top rate instead, which is what a driver is choosing on.
  return feature.properties.maxEurPerHour ?? null;
}
