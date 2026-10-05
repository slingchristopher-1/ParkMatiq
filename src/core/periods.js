// Calendar bucketing for the history insights.
//
// SHARED CORE — the history screen compares either week against week or month
// against month, and both comparisons are just "this bucket" against "the one
// before it" over the same list of sessions.
//
// Weeks start on Monday, which is what a Dutch driver reads off a calendar.

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7;        // Monday = 0
  const s = startOfDay(d);
  s.setDate(s.getDate() - day);
  return s;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addWeeks(d, n) {
  const s = new Date(d);
  s.setDate(s.getDate() + n * 7);
  return s;
}

export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

// The two ranges being compared, and the bars the chart draws for each.
//
//   week  → 7 bars, one per weekday
//   month → one bar per calendar week in the month, so a 390px phone still has
//           room for a label; 31 day-bars would be unreadable.
export function periodRanges(period, now = new Date()) {
  const month = period === 'month';
  const from = month ? startOfMonth(now) : startOfWeek(now);
  const to = month ? addMonths(from, 1) : addWeeks(from, 1);
  const prevFrom = month ? addMonths(from, -1) : addWeeks(from, -1);

  // The current period is always in progress, so the one before it is cut to the
  // same elapsed length. Comparing five days of October against the whole of
  // September reads as a 90% drop in spending when nothing has changed at all.
  const prevTo = new Date(prevFrom.getTime() + (now - from));

  return {
    current: { from, to },
    previous: { from: prevFrom, to: prevTo },
    label: month ? 'month' : 'week',
    currentLabel: month ? 'This month' : 'This week',
    previousLabel: month ? 'Last month' : 'Last week',
    // Says what the comparison actually measures, for the line under the number.
    comparisonNote: month ? 'same days last month' : 'same days last week',
  };
}

// Bucket labels and the index a session falls into, for one range.
export function buckets(period, range) {
  if (period === 'month') {
    // Calendar weeks touched by the month, labelled W1..Wn.
    const first = startOfWeek(range.from);
    const labels = [];
    for (let w = first; w < range.to; w = addWeeks(w, 1)) labels.push(`W${labels.length + 1}`);
    return {
      labels,
      indexOf: date => {
        const i = Math.floor((startOfWeek(date) - first) / (7 * 86400000));
        return i >= 0 && i < labels.length ? i : -1;
      },
    };
  }
  return {
    labels: WEEK_DAYS,
    indexOf: date => (date.getDay() + 6) % 7,
  };
}

const when = s => new Date(s.ts ?? s.date);

export function inRange(session, range) {
  const t = when(session);
  return t >= range.from && t < range.to;
}

// Totals per bucket plus the overall sum, for one range.
export function spendByBucket(sessions, period, range) {
  const b = buckets(period, range);
  const totals = b.labels.map(() => 0);
  let sum = 0;
  for (const s of sessions) {
    if (!inRange(s, range)) continue;
    const i = b.indexOf(when(s));
    if (i >= 0) totals[i] += s.cost;
    sum += s.cost;
  }
  return { labels: b.labels, totals, sum };
}
