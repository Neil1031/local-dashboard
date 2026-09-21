import test from 'node:test';
import assert from 'node:assert/strict';
import { historyWindow, historyRows, aggregateDay, readHistory, localDayKey } from '../dashboard.mjs';

const run = (id, outcome, observedRunAt = '2026-09-20T00:00:00Z') => ({ id, outcome, observedRunAt, schedulerResult: outcome === 'FAILED' ? 1 : 0, durationMs: null, message: null });
test('empty, single, all success and every mixed ordering retain failure and counts', () => {
  for (const outcomes of [[], ['SUCCESS'], ['FAILED'], ['SUCCESS', 'SUCCESS', 'SUCCESS'], ['SUCCESS', 'FAILED', 'SUCCESS'], ['FAILED', 'SUCCESS'], ['SUCCESS', 'FAILED']]) {
    const cell = aggregateDay(outcomes.map((outcome, index) => run(index, outcome)));
    assert.equal(cell.count, outcomes.length);
    assert.equal(cell.failed, outcomes.filter(value => value === 'FAILED').length);
    assert.equal(cell.outcome, !outcomes.length ? 'NONE' : outcomes.includes('FAILED') ? 'FAILED' : 'SUCCESS');
  }
  const ordered = aggregateDay([run(3, 'SUCCESS', '2026-09-20T10:00:00Z'), run(2, 'FAILED', '2026-09-20T00:00:00.0000002Z'), run(1, 'SUCCESS', '2026-09-20T00:00:00.0000001Z')]);
  assert.deepEqual(ordered.runs.map(row => row.id), [1, 2, 3]);
});
test('Taipei calendar boundaries, eighth day exclusion, union, names and distinct identities', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Taipei';
  try {
    const range = historyWindow(new Date('2026-09-21T14:00:00Z'));
    assert.equal(range.from, '2026-09-14T16:00:00.000Z');
    assert.equal(range.to, '2026-09-21T16:00:00.000Z');
    assert.equal(range.days.length, 7);
    const rows = historyRows([{ id: 'same', name: 'Current name' }, { id: 'empty', name: 'No history' }], [
      { id: 'same', taskName: 'Old name', runs: [run(1, 'SUCCESS', '2026-09-20T15:59:59.9999999Z'), run(2, 'FAILED', '2026-09-20T16:00:00Z'), run(3, 'SUCCESS', '2026-09-14T15:59:59Z')] },
      { id: 'old', taskName: 'History name', runs: [run(4, 'SUCCESS')] }
    ], range);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, 'Current name');
    assert.equal(rows[0].historyOnly, false);
    assert.equal(rows[0].days[5].count, 1);
    assert.equal(rows[0].days[6].outcome, 'FAILED');
    assert.equal(rows[0].days.reduce((total, day) => total + day.count, 0), 2);
    assert.equal(rows.find(row => row.id === 'old').historyOnly, true);
    assert.ok(rows.find(row => row.id === 'empty').days.every(cell => cell.outcome === 'NONE'));
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('local calendar window spans DST spring/fall changes without using 168 hours', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    for (const [now, hours] of [['2026-03-10T12:00:00Z', 167], ['2026-11-03T12:00:00Z', 169]]) {
      const range = historyWindow(new Date(now));
      assert.equal((Date.parse(range.to) - Date.parse(range.from)) / 3600000, hours);
      assert.equal(new Set(range.days.map(localDayKey)).size, 7);
      assert.ok(range.days.every(day => day.getHours() === 0));
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('invalid history payloads cannot silently become empty or successful history', () => {
  const range = { from: '2026-09-14T16:00:00Z', to: '2026-09-21T16:00:00Z' };
  const payload = { ...range, jobs: [{ id: 'one', taskName: 'One', taskPath: '\\', enabled: null, runs: [run(1, 'SUCCESS')] }] };
  assert.equal(readHistory(payload, range), payload);
  for (const mutate of [p => { p.jobs[0].runs[0].outcome = 'READY'; }, p => { p.jobs.push(p.jobs[0]); },
    p => { p.jobs[0].runs.push(p.jobs[0].runs[0]); }, p => { p.jobs[0].runs[0].observedRunAt = range.to; },
    p => { delete p.jobs; }, p => { p.to = range.from; }, p => { p.jobs[0].runs[0].durationMs = -1; }]) {
    const invalid = structuredClone(payload); mutate(invalid);
    assert.throws(() => readHistory(invalid, range), /INVALID_HISTORY_RESPONSE/);
  }
});
