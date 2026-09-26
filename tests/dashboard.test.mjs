import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentStatus, lastStatus, summarize, filterJobs, formatDate, displayValue, jobDisplayName, jobSubtitle, readSnapshot, jobMetadata, metadataFor, jobMarket, orderedJobs, visibleJobs, downstreamJobs, datedTaskDate, foldDatedJobs, viewCounts, setMetadataOverrides } from '../dashboard.mjs';

test('partial user overrides preserve defaults and exact beats pattern', () => {
  const dated = { id: 'dated-id', name: 'AIStockHunter-Accumulation-Check-2026-09-22' };
  try {
    setMetadataOverrides({
      'AIStockHunter-Accumulation-Check-*': { displayName: '共用名稱', market: '美股' },
      'AIStockHunter-Accumulation-Check-2026-09-22': { displayName: '指定名稱' },
      'My-New-Task': { displayName: '新工作', market: '台股', order: 4, hidden: true }
    });
    assert.equal(metadataFor(dated).displayName, '指定名稱');
    assert.equal(metadataFor(dated).market, '美股');
    assert.deepEqual(metadataFor(dated).dependsOn, jobMetadata['AIStockHunter-Accumulation-Check-*'].dependsOn);
    assert.equal(metadataFor({ name: 'AIStockHunter-Accumulation-Check-2026-09-23' }).displayName, '共用名稱');
    assert.equal(jobDisplayName({ name: 'My-New-Task' }), '新工作');
    assert.deepEqual(visibleJobs([{ name: 'My-New-Task' }]), []);
  } finally { setMetadataOverrides({}); }
});

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
  assert.doesNotMatch(js, /Nightly Discussion|NumberOfMissedRuns|\/api\/jobs\//);
  assert.match(html, /Observed completed executions/);
  assert.match(js, /fetchJobs\('\/api\/jobs'/);
});


test('friendly job names do not change the original scheduler identity', () => {
  const known = { name: 'InsiderTracker-SEC', taskPath: '\\' };
  assert.equal(jobDisplayName(known), 'SEC 內部人交易更新');
  assert.equal(jobSubtitle(known), 'InsiderTracker-SEC');

  const nested = { name: 'AIStockHunter-Accumulation-Weekly-Check', taskPath: '\\Stocks\\' };
  assert.equal(jobDisplayName(nested), '籌碼累積每週檢查');
  assert.equal(jobSubtitle(nested), 'AIStockHunter-Accumulation-Weekly-Check · \\Stocks\\');

  const unknown = { name: 'Other-Task', taskPath: '\\' };
  assert.equal(jobDisplayName(unknown), 'Other-Task');
  assert.equal(jobSubtitle(unknown), '\\');
});

test('daily and dated aliases apply to current and history without changing identity', () => {
  for (const [name, alias] of [
    ['AIStockHunter-UnexplainedVolume-Daily', '異常成交量每日掃描'],
    ['AIStockHunter-Accumulation-Check-2026-09-22', '籌碼累積上線檢查 · 2026-09-22'],
    ['AIStockHunter-Accumulation-Check-2026-10-01', '籌碼累積上線檢查 · 2026-10-01'],
    ['AIStockHunter-UnexplainedVolume-HealthCheck', '舊版異常成交量健康檢查'],
    ['AIStockHunter-Accumulation-Check-custom', 'AIStockHunter-Accumulation-Check-custom'],
    ['Unknown task', 'Unknown task'],
    ['toString', 'toString']
  ]) {
    for (const field of ['name', 'taskName']) {
      const job = Object.freeze({ id: 'stable-original-id', [field]: name, taskPath: '\\' });
      assert.equal(jobDisplayName(job), alias);
      if (alias !== name) assert.equal(jobSubtitle(job), name);
      assert.equal(job.id, 'stable-original-id');
      assert.equal(job[field], name);
    }
  }
});

test('versioned metadata groups by market, orders jobs, and preserves unknown jobs', () => {
  const names = ['Other-Task', 'InsiderTracker-SEC', 'AIStockHunter-Accumulation-Weekly-Check',
    'InsiderTracker-Market', 'AIStockHunter-UnexplainedVolume-Daily',
    'AIStockHunter-UnexplainedVolume-HealthCheck', 'AIStockHunter-Accumulation-Check-2026-09-22',
    'InsiderTracker-SyncImport'];
  const jobs = names.map((name, id) => Object.freeze({ name, id: String(id) }));
  assert.deepEqual(orderedJobs(visibleJobs(jobs)).map(job => job.name), [
    'AIStockHunter-UnexplainedVolume-Daily', 'AIStockHunter-Accumulation-Check-2026-09-22',
    'AIStockHunter-Accumulation-Weekly-Check', 'InsiderTracker-Market',
    'InsiderTracker-SyncImport', 'InsiderTracker-SEC', 'Other-Task']);
  assert.equal(visibleJobs(jobs, true).length, names.length);
  assert.equal(jobMarket(jobs[0]), '其他');
  assert.equal(metadataFor(jobs[0]), null);
  assert.equal(jobDisplayName(jobs[0]), 'Other-Task');
  assert.equal(metadataFor({ name: 'AIStockHunter-Accumulation-Check-custom' }), null);
  assert.equal(metadataFor({ name: 'AIStockHunter-Accumulation-Check-2026-09-22' }), jobMetadata['AIStockHunter-Accumulation-Check-*']);
  assert.deepEqual(downstreamJobs(jobs[4], jobs).map(job => job.name), [
    'AIStockHunter-Accumulation-Check-2026-09-22', 'AIStockHunter-Accumulation-Weekly-Check']);
  assert.deepEqual(downstreamJobs(jobs[7], jobs).map(job => job.name), ['InsiderTracker-SEC']);
  assert.equal(jobMetadata['InsiderTracker-SEC'].dependsOn[0].kind, 'orderOnly');
  assert.equal(jobMetadata['InsiderTracker-SyncImport'].dependsOn[0].kind, 'external');
  assert.equal(jobMetadata['AIStockHunter-Accumulation-Weekly-Check'].dependsOn[0].note, '本週已有 Daily 資料');
  assert.equal(jobMetadata['AIStockHunter-UnexplainedVolume-V2-Weekly'].hidden, true);
  assert.equal(visibleJobs([{ name: 'AIStockHunter-UnexplainedVolume-V2-Weekly' }]).length, 0);
});

test('dated tasks use real calendar dates and keep every original ID', () => {
  const dated = date => Object.freeze({ id: `id-${date}`, name: `AIStockHunter-Accumulation-Check-${date}` });
  const jobs = [dated('2026-09-18'), dated('2026-09-22'), dated('2026-09-21'),
    dated('2026-02-29'), dated('2026-13-01'), dated('2026-09-2x'),
    { id: 'other', name: 'Other-Task' }];
  assert.equal(datedTaskDate(jobs[1]), '2026-09-22');
  for (const job of jobs.slice(3, 6)) {
    assert.equal(datedTaskDate(job), null);
    assert.equal(metadataFor(job), null);
  }
  assert.equal(datedTaskDate(dated('2024-02-29')), '2024-02-29');
  const entries = foldDatedJobs(jobs);
  const group = entries.find(entry => entry.kind === 'dated');
  assert.deepEqual(group.latest.map(job => job.id), ['id-2026-09-22']);
  assert.deepEqual(group.history.map(job => job.id), ['id-2026-09-21', 'id-2026-09-18']);
  assert.deepEqual(entries.filter(entry => entry.kind === 'job').map(entry => entry.job.id),
    ['id-2026-02-29', 'id-2026-13-01', 'id-2026-09-2x', 'other']);
  assert.deepEqual(foldDatedJobs([dated('2026-09-22')])[0].history, []);
  assert.deepEqual(foldDatedJobs([dated('2026-09-22'), { ...dated('2026-09-22'), id: 'different-path-id' }])[0].latest.map(job => job.id),
    ['id-2026-09-22', 'different-path-id']);
});

test('view counts separate legacy, filter exclusion, and collapsed dates', () => {
  const jobs = ['2026-09-18', '2026-09-21', '2026-09-22'].map(date =>
    ({ name: `AIStockHunter-Accumulation-Check-${date}`, status: 'READY' }));
  jobs.push({ name: 'AIStockHunter-UnexplainedVolume-HealthCheck', status: 'DISABLED' },
    { name: 'InsiderTracker-Market', status: 'DISABLED' });
  assert.deepEqual(viewCounts(jobs, false, 'all'), { visible: 2, legacyHidden: 1, filteredOut: 0, folded: 2 });
  assert.deepEqual(viewCounts(jobs, false, 'all', true), { visible: 4, legacyHidden: 1, filteredOut: 0, folded: 0 });
  assert.deepEqual(viewCounts(jobs, false, 'DISABLED'), { visible: 1, legacyHidden: 1, filteredOut: 3, folded: 0 });
  assert.deepEqual(viewCounts(jobs, true, 'DISABLED'), { visible: 2, legacyHidden: 0, filteredOut: 3, folded: 0 });
  assert.equal(visibleJobs(jobs).some(job => job.name === 'InsiderTracker-Market'), true);
  assert.equal(summarize(jobs).monitored, 5);
});
