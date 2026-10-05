// node --test src/core/insights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { promptStats, stopLag, zoneUsage, cheaperNeighbour, cheaperAlternatives, totalDifference } from './insights.js';
import { metresApart, neighboursOf } from './zones.js';

// A square roughly 100 m on a side, at `lon`/`lat`, as a GeoJSON feature.
const D = 0.001;   // ~111 m of latitude
function square(lon, lat, props) {
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [[[lon, lat], [lon + D, lat], [lon + D, lat + D], [lon, lat + D], [lon, lat]]],
    },
  };
}

// Mon–Fri 09:00–18:00 at the given rate.
const sched = rate => [1, 2, 3, 4, 5].map(d => [d, 540, 1080, rate]);

const DATA = {
  schedules: { cheap: sched(2), dear: sched(5), mid: sched(4) },
  features: [
    square(4.480, 51.920, { areaid: 'A', areamanagerid: '1', desc: 'Lijnbaan', sched: 'dear', maxEurPerHour: 5 }),
    square(4.481, 51.920, { areaid: 'B', areamanagerid: '1', desc: 'Coolsingel', sched: 'cheap', maxEurPerHour: 2 }),
    square(4.600, 51.920, { areaid: 'C', areamanagerid: '1', desc: 'Far away', sched: 'cheap', maxEurPerHour: 1 }),
    square(4.482, 51.920, { areaid: 'D', areamanagerid: '1', desc: 'Unknown tariff', sched: null, maxEurPerHour: null }),
  ],
};

const WED = new Date(2026, 9, 14, 12, 0);   // Wednesday noon, inside paid hours

test('prompt stats separate start from stop', () => {
  const s = promptStats([
    { promptedStart: true, startedFromPrompt: true },
    { promptedStart: true, startedFromPrompt: false },
    { promptedStop: true, stoppedFromPrompt: true },
    { promptedStop: true, stoppedFromPrompt: true },
    { promptedStop: true, stoppedFromPrompt: false },
  ]);
  assert.deepEqual(s.start, { prompts: 2, acted: 1, pct: 50 });
  assert.deepEqual(s.stop, { prompts: 3, acted: 2, pct: 67 });
});

test('no prompts gives no percentage rather than zero', () => {
  const s = promptStats([]);
  assert.equal(s.start.pct, null);
  assert.equal(s.stop.pct, null);
});

test('stop lag reports minutes, never money', () => {
  const l = stopLag([
    { stoppedFromPrompt: true, lagMinutes: 10 },
    { stoppedFromPrompt: true, lagMinutes: 30 },
    { stoppedFromPrompt: true, lagMinutes: 20 },
    { stoppedFromPrompt: false, lagMinutes: 999 },   // stopped by hand, not ours to claim
  ]);
  assert.equal(l.count, 3);
  assert.equal(l.median, 20);
  assert.equal(l.total, 60);
  assert.equal(Object.keys(l).includes('euros'), false);
});

test('zone usage ranks by visits', () => {
  const u = zoneUsage([
    { zone: 'A', cost: 2, minutes: 60 },
    { zone: 'A', cost: 3, minutes: 30 },
    { zone: 'B', cost: 9, minutes: 90 },
  ]);
  assert.equal(u[0].label, 'A');
  assert.equal(u[0].visits, 2);
  assert.equal(u[0].spend, 5);
});

test('adjacency is measured between edges, not centres', () => {
  const [a, b, far] = DATA.features;
  assert.ok(metresApart(a, b) < 10, 'touching squares');
  assert.ok(metresApart(a, far) > 5000);
  const names = neighboursOf(a, DATA, 150).map(n => n.feature.properties.desc);
  assert.ok(names.includes('Coolsingel'));
  assert.ok(!names.includes('Far away'), 'a zone 8 km away is not next door');
});

test('suggests the cheaper zone next door and prices the same hours there', () => {
  const usage = { areaid: 'A', areamanagerid: '1', spend: 10, minutes: 120, visits: 4 };
  const alt = cheaperNeighbour(usage, DATA, { when: WED });
  assert.equal(alt.label, 'Coolsingel');
  assert.equal(alt.hereRate, 5);
  assert.equal(alt.rate, 2);
  assert.equal(alt.wouldHaveCost, 4);     // 2 hours at EUR 2
  assert.equal(alt.difference, 6);
});

test('a zone with an unresolved tariff is never suggested', () => {
  const onlyUnknown = {
    schedules: DATA.schedules,
    features: [DATA.features[0], DATA.features[3]],
  };
  const usage = { areaid: 'A', areamanagerid: '1', spend: 10, minutes: 120 };
  assert.equal(cheaperNeighbour(usage, onlyUnknown, { when: WED }), null);
});

test('no cheaper neighbour means no suggestion', () => {
  const usage = { areaid: 'B', areamanagerid: '1', spend: 4, minutes: 120 };
  assert.equal(cheaperNeighbour(usage, DATA, { when: WED }), null);
});

test('alternatives cover several zones and total up', () => {
  const usage = [
    { areaid: 'A', areamanagerid: '1', label: 'Lijnbaan', spend: 10, minutes: 120, visits: 5 },
    { areaid: 'B', areamanagerid: '1', label: 'Coolsingel', spend: 4, minutes: 120, visits: 3 },
  ];
  const alts = cheaperAlternatives(usage, DATA, { when: WED });
  assert.equal(alts.length, 1, 'Coolsingel has no cheaper neighbour, so it is left out');
  assert.equal(alts[0].alt.label, 'Coolsingel');
  assert.equal(totalDifference(alts), 6);
});
