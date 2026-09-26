import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
const { chromium } = require('playwright');
const artifacts = fileURLToPath(new URL('../target/stage-3b/', import.meta.url));
let browser, server, base, context, page, errors;
const job = (id, name = id) => ({ id, name, taskPath: '\\Research\\', status: 'READY', lastRunStatus: 'UNKNOWN' });
const run = (id, time, outcome = 'SUCCESS') => ({ id, observedRunAt: `2026-09-21T${time}Z`, outcome, schedulerResult: outcome === 'FAILED' ? 1 : 0, durationMs: null, message: outcome === 'FAILED' ? 'Scheduler reported result 1' : null });
const historyJob = (id, runs) => ({ id, taskName: `Stored ${id}`, taskPath: '\\Old\\', enabled: true, runs });
const fixture = () => [historyJob('mixed', [run(3, '10:03:00'), run(1, '00:02:00'), run(2, '04:04:00', 'FAILED')]),
  historyJob('single-success', [run(4, '01:00:00')]), historyJob('single-failed', [run(5, '01:00:00', 'FAILED')]),
  historyJob('all-success', [run(6, '01:00:00'), run(7, '02:00:00'), run(8, '03:00:00')]),
  historyJob('history-only', [run(9, '01:00:00')])];
const current = () => ['mixed', 'single-success', 'single-failed', 'all-success', 'no-history'].map(id => job(id));
async function ready() { await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled); }
async function historyReady() { await page.waitForFunction(() => document.getElementById('historyView').getAttribute('aria-busy') === 'false'); }
const cells = id => page.locator(`.history-row[data-job="${id}"] .day-cell`);
async function mock({ jobs = current(), histories = fixture(), historyStatus = 200, hold = null } = {}) {
  const requests = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    assert.equal(route.request().method(), 'GET');
    if (url.pathname === '/api/jobs') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ collectionStatus: 'OK', collectedAt: '2026-09-21T03:00:00Z', jobs, errors: [], unmatchedIncludes: [] }) });
    if (url.pathname === '/api/runner/executions') return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ status: 'NOT_CONFIGURED', jobs: [], warnings: [] }) });
    assert.equal(url.pathname, '/api/history');
    if (hold) await hold;
    return route.fulfill({ status: historyStatus, contentType: 'application/json', body: JSON.stringify({ from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: histories, message: 'SECRET C:/private.db SELECT * FROM job_run' }) });
  });
  await page.route('**/api/settings/job-metadata', route => route.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ version: 1, revision: '0', overrides: {}, warning: null }) }));
  await page.goto(base);
  await ready();
  return requests;
}
before(async () => {
  await mkdir(artifacts, { recursive: true });
  server = createServer(async (request, response) => {
    const file = request.url === '/dashboard.mjs' ? 'dashboard.mjs' : 'index.html';
    response.setHeader('Content-Type', file.endsWith('mjs') ? 'text/javascript' : 'text/html; charset=utf-8');
    response.end(await readFile(new URL(`../${file}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'Asia/Taipei', locale: 'en-US' });
  page = await context.newPage();
  await page.clock.install({ time: new Date('2026-09-21T11:00:00Z') });
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
});
afterEach(async () => { await context.close(); assert.deepEqual(errors, []); });

test('one bounded request, daily summaries, complete sorted details and keyboard focus return', async () => {
  const requests = await mock();
  assert.equal(requests.length, 1);
  await page.locator('#historyTab').click();
  await historyReady();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('from'), '2026-09-14T16:00:00.000Z');
  assert.equal(requests[1].searchParams.get('to'), '2026-09-21T16:00:00.000Z');
  assert.equal(await page.locator('.history-row').count(), 6);
  assert.equal(await cells('mixed').last().innerText(), '! 3');
  assert.match(await cells('mixed').last().getAttribute('class'), /failed/);
  assert.match(await cells('mixed').last().getAttribute('aria-label'), /September 21, 2026, 3 runs, 1 failed/);
  assert.equal(await cells('single-success').last().innerText(), '✓');
  assert.equal(await cells('single-failed').last().innerText(), '!');
  assert.equal(await cells('all-success').last().innerText(), '✓ 3');
  assert.equal(await cells('all-success').last().getAttribute('class'), 'day-cell success');
  assert.equal(await page.locator('[data-job="no-history"] .day-cell.none').count(), 7);
  assert.equal(await page.locator('button.day-cell.none').count(), 0);
  assert.match(await page.locator('[data-job="history-only"]').innerText(), /Stored history-only.*History only/s);
  assert.equal(await page.locator('[data-job="mixed"] .history-job-name').innerText(), 'mixed');
  await page.locator('#historyTableWrap').focus();
  await page.keyboard.press('Tab');
  assert.equal(await cells('mixed').last().evaluate(node => node === document.activeElement), true);
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    assert.equal(await page.locator('#drawer').getAttribute('data-mode'), 'history');
    assert.equal(await page.locator('#currentWarnings').isVisible(), false);
    assert.deepEqual(await page.locator('.history-execution').evaluateAll(nodes => nodes.map(node => node.dataset.runId)), ['1', '2', '3']);
    assert.match(await page.locator('#historyExecutions').innerText(), /8:02:00 AM.*Success.*12:04:00 PM.*Failed.*Result: 1.*Scheduler reported result 1.*6:03:00 PM.*Success/s);
    assert.doesNotMatch(await page.locator('#historyExecutions').innerText(), /Duration|null|undefined/);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#closeDrawer').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await cells('mixed').last().evaluate(node => node === document.activeElement), true);
  }
  assert.equal(requests.length, 2);
  await page.locator('#todayTab').click();
  await page.locator('.job-row').first().click();
  assert.equal(await page.locator('#drawer').getAttribute('data-mode'), 'current');
  assert.equal(await page.locator('#historyExecutions').isVisible(), false);
});

test('loading has no fake cells; cache and successful Current Refresh invalidate once', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const requests = await mock({ hold });
  await page.locator('#historyTab').click();
  assert.match(await page.locator('#historyStatus').innerText(), /Loading history/);
  assert.equal(await page.locator('.day-cell').count(), 0);
  await page.locator('#todayTab').click();
  await page.locator('#historyTab').click();
  release();
  await historyReady();
  assert.equal(requests.length, 2);
  await page.locator('#todayTab').click();
  await page.locator('#historyTab').click();
  assert.equal(requests.length, 2);
  await page.locator('#todayTab').click();
  await page.locator('#refreshBtn').click();
  await ready();
  assert.equal(requests.length, 3);
  await page.locator('#historyTab').click();
  await historyReady();
  assert.equal(requests.length, 4);
  await page.locator('#refreshBtn').click();
  await ready(); await historyReady();
  assert.equal(requests.filter(url => url.pathname === '/api/jobs').length, 3);
  assert.equal(requests.filter(url => url.pathname === '/api/history').length, 3);
});

test('history error and retry keep Today snapshot usable and hide unsafe server details', async () => {
  const requests = await mock({ historyStatus: 503 });
  await page.locator('#historyTab').click(); await historyReady();
  assert.match(await page.locator('#historyStatus').innerText(), /History unavailable.*HTTP 503/);
  assert.doesNotMatch(await page.locator('body').innerText(), /SECRET|private.db|SELECT/);
  assert.equal(await page.locator('#count-monitored').innerText(), '5');
  await page.locator('#todayTab').click();
  assert.equal(await page.locator('.job-row').count(), 5);
  assert.match(await page.locator('#collectionTitle').innerText(), /OK/);
  await page.locator('#historyTab').click(); await historyReady();
  await page.route('**/api/history?*', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: { from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: [] } });
  });
  await page.locator('#historyRetry').click(); await historyReady();
  assert.equal(await page.locator('.day-cell.none').count(), 35);
  assert.equal(requests.filter(url => url.pathname === '/api/jobs').length, 1);
});

test('empty inventory and local midnight rollover use an updated range', async () => {
  const requests = await mock({ jobs: [], histories: [] });
  await page.locator('#historyTab').click(); await historyReady();
  assert.match(await page.locator('#historyStatus').innerText(), /No observed executions or current jobs/);
  assert.equal(await page.locator('.day-cell').count(), 0);
  await page.clock.setSystemTime(new Date('2026-09-21T16:00:01Z'));
  await page.locator('#todayTab').click(); await page.locator('#historyTab').click(); await historyReady();
  assert.equal(requests[2].searchParams.get('from'), '2026-09-15T16:00:00.000Z');
  assert.equal(requests[2].searchParams.get('to'), '2026-09-22T16:00:00.000Z');
});

test('long Unicode names, injection-looking messages, sticky names and narrow horizontal scroll', async () => {
  const long = '長排程名稱🌸無空白'.repeat(15);
  const unsafe = '<img src=x onerror="window.injected=true">';
  const histories = fixture();
  histories[0].runs[1].message = unsafe;
  histories[0].runs[1].durationMs = 1234;
  await mock({ jobs: [job('mixed', long), ...current().slice(1)], histories });
  await page.locator('#historyTab').click(); await historyReady();
  for (const width of [1280, 820, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#historyTableWrap').evaluate(node => { node.scrollLeft = node.scrollWidth; });
    const name = await page.locator('.history-name').first().boundingBox();
    const wrap = await page.locator('#historyTableWrap').boundingBox();
    assert.ok(name.x >= wrap.x && name.x < wrap.x + 12);
    await page.screenshot({ path: `${artifacts}/history-${width}.png`, fullPage: true });
    await cells('mixed').last().click();
    assert.equal(await page.locator('#drawerTitle').innerText(), long);
    assert.match(await page.locator('#historyExecutions').innerText(), /<img.*Duration: 1234 ms/s);
    assert.equal(await page.locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('.drawer-card').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    if (width === 320) await page.screenshot({ path: `${artifacts}/history-detail-320.png` });
    await page.keyboard.press('Escape');
  }
});

test('Refresh while a history read is in flight discards its stale result and fetches once more', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const requests = await mock({ hold });
  await page.locator('#historyTab').click();
  await page.locator('#refreshBtn').click(); await ready();
  release(); await historyReady();
  await page.waitForFunction(() => document.querySelectorAll('.history-row').length === 6);
  assert.equal(requests.filter(url => url.pathname === '/api/jobs').length, 2);
  assert.equal(requests.filter(url => url.pathname === '/api/history').length, 2);
});
