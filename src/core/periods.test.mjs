// node --test src/core/periods.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { periodRanges, spendByBucket, startOfWeek, startOfMonth } from './periods.js';

// Wednesday 14 October 2026.
const NOW = new Date(2026, 9, 14, 12, 0);

const session = (y, m, d, cost) => ({ ts: new Date(y, m, d, 10, 0).getTime(), cost });

test('weeks start on Monday', () => {
  assert.equal(startOfWeek(NOW).getDay(), 1);
  assert.equal(startOfWeek(NOW).getDate(), 12);
});

test('week range covers Monday to Monday', () => {
  const { current, previous } = periodRanges('week', NOW);
  assert.equal(current.from.getDate(), 12);
  assert.equal(current.to.getDate(), 19);
  assert.equal(previous.from.getDate(), 5);
});

test('month range covers the calendar month', () => {
  const { current, previous } = periodRanges('month', NOW);
  assert.deepEqual([current.from.getMonth(), current.from.getDate()], [9, 1]);
  assert.deepEqual([previous.from.getMonth(), previous.from.getDate()], [8, 1]);
  assert.equal(startOfMonth(NOW).getMonth(), 9);
});

test('week view buckets by weekday and excludes other weeks', () => {
  const sessions = [
    session(2026, 9, 12, 2),   // Monday this week
    session(2026, 9, 14, 3),   // Wednesday this week
    session(2026, 9, 7, 9),    // last week — must not count
  ];
  const { current } = periodRanges('week', NOW);
  const { labels, totals, sum } = spendByBucket(sessions, 'week', current);
  assert.equal(labels.length, 7);
  assert.equal(totals[0], 2);
  assert.equal(totals[2], 3);
  assert.equal(sum, 5);
});

test('month view buckets by calendar week', () => {
  const sessions = [
    session(2026, 9, 1, 4),    // week 1 of October
    session(2026, 9, 14, 6),   // week 3
    session(2026, 8, 20, 99),  // September — must not count
  ];
  const { current } = periodRanges('month', NOW);
  const { totals, sum } = spendByBucket(sessions, 'month', current);
  assert.equal(sum, 10);
  assert.equal(totals[0], 4);
  assert.equal(totals[2], 6);
});

test('the previous range is what the comparison reads', () => {
  const sessions = [session(2026, 8, 10, 7), session(2026, 9, 2, 1)];
  const { current, previous } = periodRanges('month', NOW);
  assert.equal(spendByBucket(sessions, 'month', previous).sum, 7, '10 Sept falls inside the first 13 days');
  assert.equal(spendByBucket(sessions, 'month', current).sum, 1);
});

test('the previous period is cut to the same elapsed days', () => {
  // 5 October: five days into the month, so last month is cut to five days too.
  const early = new Date(2026, 9, 5, 12, 0);
  const { previous, comparisonNote } = periodRanges('month', early);
  assert.equal(previous.from.getMonth(), 8);
  assert.equal(previous.to.getDate(), 5);
  assert.equal(comparisonNote, 'same days last month');

  const late = session(2026, 8, 20, 50);   // 20 September — past the cut
  const early20 = session(2026, 8, 2, 4);  // 2 September — inside it
  assert.equal(spendByBucket([late, early20], 'month', previous).sum, 4,
    'a full previous month would have counted both');
});

test('the week comparison is cut the same way', () => {
  // Wednesday, so two and a half days in.
  const { previous, comparisonNote } = periodRanges('week', NOW);
  assert.equal(previous.from.getDate(), 5);
  assert.equal(previous.to.getDate(), 7);
  assert.equal(comparisonNote, 'same days last week');
});
