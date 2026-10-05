// Demo history, built from real Rotterdam zones in the RDW snapshot.
//
// It used to be four invented zone names, which meant the zone insights could
// not say anything true — there is no cheaper street next to "Zone A - Lijnbaan"
// because no such zone exists. Seeding from the real file means the adjacency
// and tariff figures on the history screen are computed the same way they will
// be for real sessions.
import { loadZones } from '../core/zones.js';
import { rateAt } from '../core/zones.js';

const APPS = ['ParkMobile', 'EasyPark', 'JustPark'];
const DAYS_BACK = 60;

// Deterministic, so the demo looks the same on every launch.
function rng(seed) {
  let n = seed;
  return () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
}

export async function buildDemoHistory(now = new Date()) {
  const data = await loadZones();
  if (!data) return [];

  const rotterdam = data.features.filter(
    f => f.properties.municipality === 'Rotterdam' && f.properties.sched
  );
  if (!rotterdam.length) return [];

  // One expensive zone the driver uses most, plus a spread of others — that is
  // what makes "you park here most, and the zone next door is cheaper" worth
  // saying at all.
  const dear = rotterdam.filter(f => f.properties.maxEurPerHour >= 6);
  const rest = rotterdam.filter(f => f.properties.maxEurPerHour < 6);
  const pool = [
    ...(dear.length ? [dear[0], dear[0], dear[0]] : []),   // weighted: the usual spot
    ...rest.slice(0, 3),
  ];
  if (!pool.length) return [];

  const rnd = rng(7);
  const out = [];

  for (let back = 0; back < DAYS_BACK; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const perDay = rnd() < 0.45 ? 0 : rnd() < 0.78 ? 1 : 2;

    for (let k = 0; k < perDay; k++) {
      const f = pool[Math.floor(rnd() * pool.length)];
      const minutes = 15 + Math.floor(rnd() * 150);
      const ts = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
        8 + Math.floor(rnd() * 10), Math.floor(rnd() * 60));

      const windows = data.schedules[f.properties.sched];
      const rate = rateAt(windows, ts) || f.properties.maxEurPerHour || 0;

      // Most sessions follow a prompt; some the driver handles alone.
      const promptedStart = rnd() < 0.8;
      const startedFromPrompt = promptedStart && rnd() < 0.72;
      const promptedStop = rnd() < 0.85;
      const stoppedFromPrompt = promptedStop && rnd() < 0.78;

      out.push({
        app: APPS[Math.floor(rnd() * APPS.length)],
        zone: f.properties.desc,
        zoneKey: f.properties.areamanagerid + ':' + f.properties.areaid,
        areaid: f.properties.areaid,
        areamanagerid: f.properties.areamanagerid,
        loc: f.properties.desc,
        ts: ts.getTime(),
        date: formatWhen(ts, now),
        minutes,
        cost: Math.round((minutes / 60) * rate * 100) / 100,
        duration: formatDuration(minutes),
        promptedStart,
        startedFromPrompt,
        promptedStop,
        stoppedFromPrompt,
        // How long the session ran on after the driver left, for the stop-lag
        // figure. Only meaningful where the prompt is what ended it.
        lagMinutes: stoppedFromPrompt ? 2 + Math.floor(rnd() * 25) : null,
      });
    }
  }

  return out.sort((a, b) => b.ts - a.ts);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }

function formatWhen(d, now) {
  const midnight = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((midnight(now) - midnight(d)) / 86400000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${WEEKDAYS[d.getDay()]}, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${pad(m)}m` : `${m}m 00s`;
}
