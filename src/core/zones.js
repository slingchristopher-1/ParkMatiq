// Dutch paid-parking zones, from the RDW open data snapshot that
// scripts/build-zones.mjs bundles. Nothing is fetched from RDW at runtime.
//
// A zone is not one price: it carries a weekly schedule of
// [weekday, startMinute, endMinute, eurPerHour] windows, so an evening or
// Sunday stay prices at zero rather than at the weekday rate.

// One cached fetch. Resolving to null is deliberately different from an empty
// list: missing data must read as "tariff unknown", never as "free parking".
let cache = null;

export function loadZones() {
  if (!cache) {
    // Imported lazily: the ?url form is a bundler feature, and keeping it out
    // of the module's top level lets the pure geometry below be unit-tested.
    cache = import('../data/nl-parking-zones.geojson?url')
      .then(m => fetch(m.default))
      .then(r => { if (!r.ok) throw new Error(`zones ${r.status}`); return r.json(); })
      .catch(() => { cache = null; return null; });
  }
  return cache;
}

// Cheap bounding box so a lookup skips the ~3k zones nowhere near the point
// instead of walking every polygon.
export function bbox(f) {
  if (f.__bbox) return f.__bbox;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const scan = ring => {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };
  const g = f.geometry;
  if (g?.type === 'Polygon') g.coordinates.forEach(scan);
  else if (g?.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(scan));
  f.__bbox = [minLon, minLat, maxLon, maxLat];
  return f.__bbox;
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// Inside the outer ring and outside every hole. RDW zones carry holes — free
// side streets and courtyards cut out of a paid zone — and ignoring them
// charges for free parking.
function pointInPolygon(lat, lon, rings) {
  if (!pointInRing(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false;
  }
  return true;
}

function pointInFeature(lat, lon, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInPolygon(lat, lon, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => pointInPolygon(lat, lon, p));
  return false;
}

// The zone containing the point, or null. A point can fall in both a priced zone
// and one whose tariff could not be resolved, where a municipality files the
// same street twice; the priced one wins because it tells the driver more.
export function zoneForPoint(lat, lon, data) {
  if (lat == null || lon == null || !data?.features) return null;

  let fallback = null;
  for (const f of data.features) {
    const [minLon, minLat, maxLon, maxLat] = bbox(f);
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (!pointInFeature(lat, lon, f.geometry)) continue;

    const p = f.properties;
    const zone = {
      windows: p.sched ? data.schedules?.[p.sched] ?? null : null,
      maxRate: p.maxEurPerHour ?? null,
      dayCap: p.dayCap ?? null,
      desc: p.desc,
      areaid: p.areaid,
      municipality: p.municipality || '',
    };
    if (zone.windows) return zone;
    fallback ??= zone;
  }
  return fallback;
}

// EUR/hour in force at `when`, or 0 when parking is free then.
export function rateAt(windows, when = new Date()) {
  if (!windows?.length) return 0;
  const day = when.getDay();
  const minute = when.getHours() * 60 + when.getMinutes();
  for (const [d, start, end, rate] of windows) {
    if (d === day && minute >= start && minute < end) return rate;
  }
  return 0;
}

// What to show, and what to charge, for a position. `rate` is null when the
// tariff could not be resolved — the app must say so rather than guess.
export async function zoneAt(lat, lon, when = new Date()) {
  const data = await loadZones();
  if (!data) return { status: 'unknown', label: 'Tariff unknown', rate: null };

  const zone = zoneForPoint(lat, lon, data);
  if (!zone) return { status: 'free', label: 'No paid zone here', rate: 0, zone: null };
  if (!zone.windows) {
    return { status: 'unknown', label: `${zone.desc} — tariff unknown`, rate: null, zone };
  }

  const rate = rateAt(zone.windows, when);
  return {
    status: rate > 0 ? 'paid' : 'free-now',
    label: zone.desc,
    municipality: zone.municipality,
    rate,
    dayCap: zone.dayCap,
    zone,
  };
}

// ── neighbouring zones ───────────────────────────────────────────────────────
// "The zone next door" has to mean next door. A cheaper zone two neighbourhoods
// away is not an alternative to where you actually park, so proximity is
// measured between the polygons themselves rather than between their centres:
// two long zones running down the same street have centres far apart and still
// touch.

const EARTH_M_PER_DEG = 111320;

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p[0]);
  return [];
}

// Metres between two lon/lat points, flat-earth. Over the few hundred metres
// this is used for, the error is far below the accuracy of a phone's fix.
function metresBetween(a, b, cosLat) {
  const dx = (a[0] - b[0]) * EARTH_M_PER_DEG * cosLat;
  const dy = (a[1] - b[1]) * EARTH_M_PER_DEG;
  return Math.hypot(dx, dy);
}

export function metresApart(f1, f2) {
  const r1 = ringsOf(f1.geometry);
  const r2 = ringsOf(f2.geometry);
  if (!r1.length || !r2.length) return Infinity;

  const cosLat = Math.cos((r1[0][0][1] * Math.PI) / 180);
  let best = Infinity;
  for (const ringA of r1) {
    for (const ringB of r2) {
      for (const a of ringA) {
        for (const b of ringB) {
          const d = metresBetween(a, b, cosLat);
          if (d < best) best = d;
          if (best === 0) return 0;
        }
      }
    }
  }
  return best;
}

// Zones whose edge comes within `maxMeters` of this one. The bounding-box test
// first, so a nationwide file does not turn one lookup into three thousand
// polygon comparisons.
export function neighboursOf(target, data, maxMeters = 150) {
  if (!target || !data?.features) return [];

  const [minLon, minLat, maxLon, maxLat] = bbox(target);
  const padLat = maxMeters / EARTH_M_PER_DEG;
  const padLon = padLat / Math.max(0.2, Math.cos((minLat * Math.PI) / 180));

  const out = [];
  for (const f of data.features) {
    if (f === target) continue;
    if (f.properties.areaid === target.properties.areaid &&
        f.properties.areamanagerid === target.properties.areamanagerid) continue;

    const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bbox(f);
    if (bMaxLon < minLon - padLon || bMinLon > maxLon + padLon) continue;
    if (bMaxLat < minLat - padLat || bMinLat > maxLat + padLat) continue;

    const d = metresApart(target, f);
    if (d <= maxMeters) out.push({ feature: f, metres: Math.round(d) });
  }
  return out.sort((a, b) => a.metres - b.metres);
}

export function featureByAreaId(data, areamanagerid, areaid) {
  return data?.features?.find(f =>
    f.properties.areaid === areaid && f.properties.areamanagerid === areamanagerid) || null;
}
