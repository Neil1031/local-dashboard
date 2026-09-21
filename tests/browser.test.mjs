import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// No application dependency/build step. Reuse Playwright via NODE_PATH, or install
// it only in ignored .tools/browser-tests as documented in README.
const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
const { chromium } = require('playwright');
let browser, server, baseUrl, context, page;
let failures;
const artifactDir = fileURLToPath(new URL('../target/stage-2/', import.meta.url));
const fixtureJob = (status = 'READY', extra = {}) => ({
  id: 'job-1', name: 'Daily 報告', taskPath: '\\Research\\', description: 'Read-only task',
  status, state: status === 'FAILED' ? 'READY' : status, enabled: status !== 'DISABLED',
  lastRunStatus: 'UNKNOWN', lastRunAt: null, nextRunAt: null,
  lastTaskResult: null, resultText: null, warnings: [], ...extra
});
const snapshot = (jobs = [], extra = {}) => ({ collectionStatus: 'OK', collectedAt: '2026-09-21T01:23:45Z', jobs, errors: [], unmatchedIncludes: [], ...extra });
const rows = () => page.locator('.job-row');
async function ready() { await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled); }
async function mock(payload, status = 200) {
  const requests = [];
  await page.route('**/api/**', route => {
    requests.push({ url: route.request().url(), method: route.request().method() });
    const url = new URL(route.request().url());
    if (url.pathname === '/api/history') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: []
    }) });
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto(baseUrl);
  await ready();
  return requests;
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

before(async () => {
  await mkdir(artifactDir, { recursive: true });
  server = createServer(async (request, response) => {
    const file = request.url === '/dashboard.mjs' ? 'dashboard.mjs' : 'index.html';
    response.setHeader('Content-Type', file.endsWith('mjs') ? 'text/javascript' : 'text/html; charset=utf-8');
    response.end(await readFile(new URL(`../${file}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'Asia/Taipei', locale: 'en-US' });
  page = await context.newPage();
  failures = [];
  page.on('pageerror', error => failures.push(error.message));
});
afterEach(async () => { await context.close(); assert.deepEqual(failures, []); });

test('initial loading, one GET, refresh coalescing, new response, no detail collection', async () => {
  let count = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  await page.route('**/api/**', async route => {
    count++;
    assert.equal(route.request().method(), 'GET');
    assert.equal(new URL(route.request().url()).pathname, '/api/jobs');
    if (count === 1) await wait;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot([
      fixtureJob(count === 1 ? 'READY' : 'FAILED', { lastRunStatus: count === 1 ? 'SUCCESS' : 'FAILED' })
    ], { collectedAt: count === 1 ? '2026-09-21T01:23:45Z' : '2026-09-21T02:24:46Z' })) });
  });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.getElementById('refreshBtn').disabled);
  assert.equal(await rows().count(), 0);
  assert.equal(await page.locator('#count-success').innerText(), '—');
  await page.locator('#refreshBtn').evaluate(button => { for (let i = 0; i < 15; i++) button.dispatchEvent(new Event('click')); });
  release();
  await ready();
  assert.equal(count, 1);
  assert.match(await rows().innerText(), /Current\s+Ready\s+Last run: Success/);
  assert.doesNotMatch(await page.locator('body').innerText(), /Today Success|Scheduled today/);
  assert.equal(await page.locator('#count-success').innerText(), '1');
  const firstTime = await page.locator('#refreshTime').innerText();
  await rows().click();
  assert.equal(await page.locator('#drawer.open').count(), 1);
  assert.match(await page.locator('#detailGrid').innerText(), /Current status\s+Ready/);
  assert.match(await page.locator('#detailGrid').innerText(), /Last run status\s+Success/);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#closeDrawer').evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#drawer.open').count(), 0);
  assert.equal(await rows().evaluate(row => row === document.activeElement), true);
  assert.equal(count, 1);
  await page.locator('#refreshBtn').click();
  await ready();
  assert.equal(count, 2);
  assert.equal(await rows().getAttribute('data-status'), 'FAILED');
  assert.notEqual(await page.locator('#refreshTime').innerText(), firstTime);
  assert.match(await page.locator('#refreshTime').innerText(), /10:24:46/);
});

test('all statuses, keyboard filters, no inferred MISSED, real drawer null values, history', async () => {
  const statuses = ['FAILED', 'READY', 'RUNNING', 'DISABLED', 'UNKNOWN'];
  const requests = await mock(snapshot(statuses.map((status, index) => fixtureJob(status, {
    id: `job-${index}`, lastRunStatus: status === 'READY' ? 'UNKNOWN' : 'FAILED',
    raw: { NumberOfMissedRuns: 100 }, warnings: ['資訊不完整'], description: null
  }))));
  assert.equal(await rows().count(), 5);
  for (const status of [...statuses, 'MISSED']) {
    const filter = page.locator(`[data-filter="${status}"]`);
    await filter.focus();
    await page.keyboard.press('Enter');
    assert.equal(await rows().count(), status === 'MISSED' ? 0 : 1);
    assert.equal(await filter.getAttribute('aria-pressed'), 'true');
    if (status !== 'MISSED') assert.equal(await rows().getAttribute('data-status'), status);
  }
  await page.locator('[data-filter="READY"]').click();
  assert.match(await rows().innerText(), /Last run: Unknown/);
  await rows().click();
  assert.doesNotMatch(await page.locator('#drawer').innerText(), /undefined|null|NaN|Invalid Date/);
  assert.match(await page.locator('#detailGrid').innerText(), /Last run\s+—/);
  assert.equal(await page.locator('#jobWarnings').innerText(), '資訊不完整');
  await page.locator('#closeDrawer').click();
  await page.locator('#todayTab').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.getElementById('historyView').getAttribute('aria-busy') === 'false');
  assert.match(await page.locator('#historyView').innerText(), /Observed completed executions/);
  assert.equal(await page.locator('#todayView').isVisible(), false);
  assert.equal(await page.locator('.day-cell.none').count(), 35);
  assert.equal(requests.length, 2);
  assert.equal(requests.filter(request => new URL(request.url).pathname === '/api/jobs').length, 1);
});

test('PARTIAL keeps jobs and all diagnostics visible; text is never HTML', async () => {
  const unsafe = '<img src=x onerror="window.injected=true">';
  await mock(snapshot([fixtureJob('UNKNOWN', { name: unsafe, description: unsafe, warnings: [unsafe] })], {
    collectionStatus: 'PARTIAL', errors: [{ code: 'PERMISSION_DENIED', taskPath: '\\秘密\\', taskName: '任務', message: unsafe }],
    unmatchedIncludes: ['未找到的排程']
  }));
  assert.equal(await rows().count(), 1);
  assert.match(await page.locator('#collectionNotice').innerText(), /部分排程資訊取得失敗.*PARTIAL/);
  assert.match(await page.locator('#collectionDetails').innerText(), /PERMISSION_DENIED.*秘密.*任務/);
  assert.match(await page.locator('#collectionDetails').innerText(), /unmatchedIncludes: 未找到的排程/);
  assert.equal(await page.locator('#count-attention').innerText(), '1');
  await rows().click();
  assert.match(await page.locator('#detailGrid').innerText(), /<img/);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${artifactDir}/partial-desktop.png`, fullPage: true });
});

test('history persistence failure retains current jobs and displays its diagnostic independently of history', async () => {
  const requests = await mock(snapshot([fixtureJob('READY', { lastRunStatus: 'SUCCESS' })], {
    collectionStatus: 'PARTIAL', errors: [{ code: 'HISTORY_PERSISTENCE_FAILED', taskPath: null, taskName: null,
      message: 'Current scheduler data is available, but observed execution history could not be saved. Check the server log.' }]
  }));
  assert.equal(await rows().count(), 1);
  assert.match(await rows().innerText(), /Current\s+Ready\s+Last run: Success/);
  assert.match(await page.locator('#collectionDetails').innerText(), /HISTORY_PERSISTENCE_FAILED.*could not be saved/);
  assert.match(await page.locator('#collectionTitle').innerText(), /PARTIAL/);
  await page.locator('#historyTab').click();
  await page.waitForFunction(() => document.getElementById('historyView').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('.day-cell.none').count(), 7);
  assert.match(await page.locator('#historyView').innerText(), /Observed completed executions/);
  assert.equal(requests.length, 2);
});

for (const offline of [true, false]) {
  test(`initial ${offline ? 'unavailable backend' : 'HTTP 503'} never renders scheduler success`, async () => {
    await page.route('**/api/**', route => offline ? route.abort('connectionfailed') : route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ collectionStatus: 'ERROR', code: 'COLLECTOR_TIMEOUT' })
    }));
    await page.goto(baseUrl);
    await ready();
    assert.equal(await rows().count(), 0);
    assert.equal(await page.locator('#count-success').innerText(), '—');
    assert.equal(await page.locator('#refreshTime').innerText(), '—');
    assert.match(await page.locator('#collectionTitle').innerText(), /無法讀取/);
    if (!offline) {
      assert.match(await page.locator('#collectionDetails').innerText(), /COLLECTOR_TIMEOUT/);
      await page.screenshot({ path: `${artifactDir}/collector-error.png`, fullPage: true });
    }
  });
}

for (const collectionStatus of ['OK', 'NOT_CONFIGURED', 'PARTIAL']) {
  test(`${collectionStatus} empty collection stays distinct`, async () => {
    await mock(snapshot([], { collectionStatus }));
    assert.equal(await rows().count(), 0);
    assert.equal(await page.locator('#count-monitored').innerText(), '0');
    assert.match(await page.locator('#collectionTitle').innerText(), new RegExp(collectionStatus));
    assert.match(await page.locator('#emptyState').innerText(), collectionStatus === 'NOT_CONFIGURED' ? /dashboard.scheduler.include.*config\/application.yml/ : /沒有可顯示/);
  });
}

test('missing optional job fields show placeholders and preserve UNKNOWN', async () => {
  await mock(snapshot([{ id: 'minimal-job' }]));
  assert.equal(await rows().getAttribute('data-status'), 'UNKNOWN');
  assert.equal(await rows().locator('.job-name').innerText(), '—');
  await rows().click();
  const values = await page.locator('#detailGrid .detail').evaluateAll(details => Object.fromEntries(details.map(detail => [detail.querySelector('small').textContent, detail.querySelector('strong').textContent])));
  assert.equal(values['Current status'], 'Unknown');
  assert.equal(values['Last run status'], 'Unknown');
  for (const key of ['Scheduler state', 'Enabled', 'Last run', 'Next run', 'Last task result', 'Result text', 'Description']) assert.equal(values[key], '—');
});

for (const scenario of ['offline', '503', 'ERROR', 'invalid-json', 'invalid-contract']) {
  test(`${scenario} after success removes old rows/counts and recovers`, async () => {
    let count = 0;
    await page.route('**/api/**', async route => {
      count++;
      if (count !== 2) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot([fixtureJob('READY', { lastRunStatus: 'SUCCESS' })])) });
      if (scenario === 'offline') return route.abort('connectionfailed');
      return route.fulfill({ status: scenario === '503' ? 503 : 200, contentType: 'application/json', body:
        scenario === 'invalid-json' ? '<html>Proxy error</html>' : JSON.stringify(scenario === 'invalid-contract' ? {} : { collectionStatus: 'ERROR', code: 'COLLECTOR_TIMEOUT', message: 'Timed out' }) });
    });
    await page.goto(baseUrl);
    await ready();
    const lastRefresh = await page.locator('#refreshTime').innerText();
    await page.locator('#refreshBtn').click();
    await ready();
    assert.equal(await rows().count(), 0);
    assert.equal(await page.locator('#count-success').innerText(), '—');
    assert.equal(await page.locator('#collectionNotice').getAttribute('role'), 'alert');
    assert.match(await page.locator('#collectionTitle').innerText(), /無法讀取/);
    assert.equal(await page.locator('#refreshTime').innerText(), lastRefresh);
    if (['503', 'ERROR'].includes(scenario)) assert.match(await page.locator('#collectionDetails').innerText(), /COLLECTOR_TIMEOUT/);
    await page.locator('#refreshBtn').click();
    await ready();
    assert.equal(await rows().count(), 1);
    assert.equal(await page.locator('#collectionNotice').getAttribute('role'), 'status');
  });
}

test('25 jobs, long Unicode names, explicit MISSED, local dates, desktop and 320px drawer', async () => {
  const longName = 'Unicode排程名稱🌸無空格'.repeat(18);
  await mock(snapshot(Array.from({ length: 25 }, (_, index) => fixtureJob(index === 0 ? 'MISSED' : 'READY', {
    id: `job-${index}`, name: index === 0 ? longName : `Task ${index}`,
    taskPath: '\\長路徑'.repeat(30) + '\\', lastRunAt: '2026-09-21T01:23:45Z', nextRunAt: '2026-09-22T01:23:45Z', lastTaskResult: 0
  }))));
  assert.equal(await rows().count(), 25);
  assert.match(await rows().first().innerText(), /9:23:45/);
  await noOverflow();
  await page.screenshot({ path: `${artifactDir}/large-desktop.png`, fullPage: true });
  for (const width of [820, 375, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await noOverflow();
    await rows().first().click();
    assert.equal(await page.locator('#drawerTitle').innerText(), longName);
    assert.equal(await page.locator('.drawer-card').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await noOverflow();
    if (width === 320) await page.screenshot({ path: `${artifactDir}/narrow-drawer.png` });
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-filter="MISSED"]').click();
  assert.equal(await rows().count(), 1);
  await page.screenshot({ path: `${artifactDir}/narrow-list.png`, fullPage: true });
});
