import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOverview } from '../ui/overview.mjs';
import { summarize } from '../dashboard.mjs';
const now = Date.parse('2026-10-01T10:00:00Z');
const key = job => `${job.taskPath}${job.name}`;
const job = (id, extra = {}) => ({ id, name: id, taskPath: '\\', status: 'READY', lastRunStatus: 'SUCCESS', ...extra });
const state = extra => ({ phase: 'ready', snapshot: { collectionStatus: 'OK', jobs: [] }, historyRevision: 1, historyState: 'loading', now, ...extra });
const derive = extra => deriveOverview(state(extra), summarize, key);
test('overview uses the collected snapshot, exposes partial coverage and rejects past/disabled future runs', () => {
  const jobs = [job('late', { nextRunAt: '2026-10-01T12:00:00Z', hidden: true }),
    job('first', { nextRunAt: '2026-10-01T11:00:00Z', status: 'FAILED', lastRunStatus: 'FAILED' }),
    job('past', { nextRunAt: '2026-10-01T09:00:00Z' }), job('disabled', { nextRunAt: '2026-10-01T10:30:00Z', enabled: false }),
    job('unknown', { nextRunAt: 'bad', status: 'UNKNOWN', lastRunStatus: 'UNKNOWN' })];
  const result = derive({ snapshot: { collectionStatus: 'PARTIAL', jobs } });
  assert.equal(result.partial, true);
  assert.deepEqual(result.counts, { monitored: 5, success: 3, failed: 1, attention: 2 });
  assert.deepEqual(result.upcoming.map(j => j.id), ['first', 'late']);
});
test('loading, failed and unconfigured snapshots have unavailable counts instead of fabricated zeros', () => {
  for (const extra of [{ phase: 'loading' }, { phase: 'error' }, { snapshot: { collectionStatus: 'NOT_CONFIGURED', jobs: [] } }]) {
    const result = derive(extra); assert.equal(result.counts, null); assert.equal(result.available, false);
    assert.equal(result.runnerAvailable, false);
  }
  assert.deepEqual(derive({}).counts, { monitored: 0, success: 0, failed: 0, attention: 0 });
});
test('recent observed executions sort whole seconds, fractions, sub-ms and same-time IDs precisely', () => {
  const run = (id, time) => ({ id, observedRunAt: `2026-10-01T09:00:00${time}Z` });
  const payload = { jobs: [{ id: 'stored', runs: [run(1, ''), run(2, '.1'), run(3, '.100000001'), run(4, '.100000002'), run(5, '.100000002')] }] };
  const historyCache = { revision: 1, payload };
  assert.deepEqual(derive({ historyState: 'ready', historyCache }).recent.map(x => x.run.id), [5, 4, 3, 2, 1]);
  assert.equal(derive({ historyState: 'ready', historyCache: { ...historyCache, revision: 0 } }).historyAvailable, false);
  assert.equal(derive({ historyState: 'error', historyCache }).recent.length, 0);
});
test('runner coverage joins exact canonical paths and retains diagnostics without inferring execution', () => {
  const result = derive({ snapshot: { collectionStatus: 'OK', jobs: [job('a'), job('b'), job('c')] },
    runnerSnapshot: { status: 'OK', jobs: [{ schedulerTask: '\\a', coverageState: 'MAPPED_NO_RECEIPT' },
      { schedulerTask: '\\b', coverageState: 'RUNNER_EVIDENCE_AVAILABLE' }], warnings: ['diagnostic'] } });
  assert.deepEqual(result.runner, { monitored: 3, mapped: 2, evidence: 1, noReceipt: 1, profileMissing: 0, unavailable: 0, unknown: 0 });
  assert.deepEqual(result.runnerWarnings, ['diagnostic']);
  assert.equal(derive({ runnerSnapshot: { status: 'UNAVAILABLE', jobs: [] } }).runner, null);
});
