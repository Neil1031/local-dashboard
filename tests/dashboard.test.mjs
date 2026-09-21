import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentStatus, lastStatus, summarize, filterJobs, formatDate, displayValue, readSnapshot } from '../dashboard.mjs';

test('current status and previous execution outcome remain independent', () => {
  const jobs = [
    { status: 'READY', lastRunStatus: 'SUCCESS', lastRunAt: '2000-01-01T00:00:00Z', nextRunAt: '2001-01-01T00:00:00Z', raw: { NumberOfMissedRuns: 99 } },
    { status: 'READY', lastRunStatus: 'UNKNOWN' },
    { status: 'DISABLED', lastRunStatus: 'SUCCESS' },
    { status: 'RUNNING', lastRunStatus: 'UNKNOWN' },
    { status: 'FAILED', lastRunStatus: 'FAILED' },
    { status: 'UNKNOWN', lastRunStatus: 'UNKNOWN' }
  ];
  assert.deepEqual(summarize(jobs), { monitored: 6, success: 2, failed: 1, attention: 2 });
  assert.equal(currentStatus(jobs[0]), 'READY');
  assert.equal(lastStatus(jobs[0]), 'SUCCESS');
  assert.equal(filterJobs(jobs, 'READY').length, 2);
  assert.equal(filterJobs(jobs, 'MISSED').length, 0);
  for (const status of ['DISABLED', 'RUNNING', 'FAILED', 'UNKNOWN']) assert.equal(filterJobs(jobs, status).length, 1);
  assert.equal(filterJobs(jobs, 'all').length, 6);
  assert.equal(currentStatus({ status: 'MISSED' }), 'MISSED');
  assert.equal(currentStatus({ status: 'SUCCESS' }), 'UNKNOWN');
  assert.equal(lastStatus({ lastRunStatus: 'READY' }), 'UNKNOWN');
});

test('missing values and invalid dates never produce null, epoch, or Invalid Date', () => {
  for (const value of [undefined, null, '', 'not-a-date', 0]) assert.equal(formatDate(value), '—');
  assert.equal(displayValue(null), '—');
  assert.equal(displayValue(0), '0');
  assert.equal(formatDate('2026-09-21T01:23:45Z'), new Date('2026-09-21T01:23:45Z').toLocaleString());
});

test('accept explicit collection states, reject errors and malformed snapshots', () => {
  for (const collectionStatus of ['OK', 'PARTIAL', 'NOT_CONFIGURED']) {
    const snapshot = { collectionStatus, jobs: [], errors: [], unmatchedIncludes: [] };
    assert.equal(readSnapshot(snapshot), snapshot);
  }
  assert.throws(() => readSnapshot({ collectionStatus: 'ERROR', code: 'COLLECTOR_TIMEOUT' }), /COLLECTOR_TIMEOUT/);
  for (const payload of [null, {}, { collectionStatus: 'OK', jobs: [] },
    { collectionStatus: 'OK', jobs: [null], errors: [], unmatchedIncludes: [] },
    { collectionStatus: 'OK', jobs: [{ id: 'same' }, { id: 'same' }], errors: [], unmatchedIncludes: [] },
    { collectionStatus: 'NOT_CONFIGURED', jobs: [{ id: 'x' }], errors: [], unmatchedIncludes: [] }]) {
    assert.throws(() => readSnapshot(payload), /INVALID_API_RESPONSE/);
  }
});

test('runtime ships no scheduler fixtures, hard-coded rows, log or history entries', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../dashboard.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-job=|day-cell success|id="logOutput"|Today Success|Scheduled today|\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(js, /InsiderTracker|Nightly Discussion|NumberOfMissedRuns|\/api\/jobs\//);
  assert.match(html, /History will be available after Stage 3/);
  assert.match(js, /fetchJobs\('\/api\/jobs'/);
});
