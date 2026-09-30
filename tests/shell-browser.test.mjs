import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { serveStaticAsset } from './static-assets.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server, base, page, errors;
const snapshot = (extra = {}) => ({ collectionStatus: 'PARTIAL', collectedAt: new Date().toISOString(), errors: ['collector warning'], unmatchedIncludes: [],
  jobs: [{ id: 'a', name: 'Upcoming <img src=x>', taskPath: '\\', status: 'READY', lastRunStatus: 'SUCCESS', nextRunAt: new Date(Date.now() + 3600000).toISOString() },
    { id: 'b', name: 'Failed job', taskPath: '\\', status: 'FAILED', lastRunStatus: 'FAILED', nextRunAt: new Date(Date.now() - 3600000).toISOString() }], ...extra });
const history = url => ({ from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: [{ id: 'a', taskName: 'Upcoming <img src=x>', taskPath: '\\', enabled: true,
  runs: [{ id: 1, observedRunAt: new Date(Date.now() - 10000).toISOString(), outcome: 'SUCCESS', schedulerResult: 0, durationMs: null, message: null }] }] });
before(async () => {
  server = createServer(serveStaticAsset); await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser.close(); await new Promise(r => server.close(r)); });
beforeEach(async () => {
  page = await browser.newPage(); errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const payload = url.pathname === '/api/jobs' ? snapshot() : url.pathname === '/api/history' ? history(url)
      : url.pathname === '/api/runner/executions' ? { status: 'NOT_CONFIGURED', jobs: [], warnings: [] }
        : { version: 1, revision: '0', overrides: {}, warning: null };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
});
afterEach(async () => { await page.close(); assert.deepEqual(errors, []); });
const ready = () => page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
for (const width of [1280, 375, 320]) test(`nine-page shell, truthful overview and keyboard/drawer at ${width}px`, async () => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(base); await ready();
  await page.waitForFunction(() => document.getElementById('overviewRecent').children.length === 1);
  assert.equal(await page.locator('[data-page]').count(), 9);
  assert.equal(await page.locator('#overview-monitored').innerText(), '2');
  assert.match(await page.locator('#overviewSnapshot').innerText(), /PARTIAL/);
  assert.equal(await page.locator('#overviewUpcoming li').count(), 1);
  assert.equal(await page.locator('#overviewView img').count(), 0);
  assert.match(await page.locator('#overviewRunner').innerText(), /尚未設定.*unavailable/);
  await page.locator('#overviewUpcoming button').click(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overviewUpcoming button').evaluate(n => n === document.activeElement), true);
  for (const key of ['us', 'tw', 'performance', 'reports', 'evidence']) {
    await page.locator(`[data-page="${key}"]`).focus(); await page.keyboard.press('Enter');
    assert.match(await page.locator(`[data-page-view="${key}"]`).innerText(), /DESIGNED[\s\S]*尚未接入資料/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  }
  await page.locator('#automationsPage').focus(); await page.keyboard.press('Space');
  await page.locator('[data-filter="FAILED"]').click();
  assert.equal(await page.locator('.job-row:visible').count(), 1);
  await page.locator('#historyTab').click();
  assert.equal(await page.locator('#historyTableWrap').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.locator('#overviewPage').click();
  assert.equal(await page.locator('#overview-monitored').innerText(), '2');
  await page.locator('#settingsPage').click();
  assert.equal(await page.locator('#settingsPanel').isVisible(), true);
  assert.equal(await page.locator('#settingsToggle').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
});
test('jobs failure clears counts and gives unavailable Runner; history error can retry', async () => {
  await page.route('**/api/jobs', route => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/history?*', route => route.fulfill({ status: 503, body: 'private SQL' }));
  await page.goto(base); await ready();
  await page.waitForFunction(() => !document.getElementById('overviewHistoryRetry').hidden);
  assert.equal(await page.locator('#overview-monitored').innerText(), '—');
  assert.match(await page.locator('#overviewRunner').innerText(), /unavailable/);
  assert.doesNotMatch(await page.locator('#overviewRunner').innerText(), /正在讀取/);
  assert.match(await page.locator('#overviewHistoryStatus').innerText(), /unavailable.*MISSED/);
  assert.doesNotMatch(await page.locator('body').innerText(), /private SQL/);
  await page.unroute('**/api/history?*'); await page.locator('#overviewHistoryRetry').click();
  await page.waitForFunction(() => document.getElementById('overviewRecent').children.length === 1);
});
test('late History completion preserves the Upcoming drawer return-focus button', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/history?*', async route => {
    await held; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(history(new URL(route.request().url()))) });
  });
  await page.goto(base); await ready();
  await page.locator('#overviewUpcoming button').click();
  release(); await page.waitForFunction(() => document.getElementById('overviewRecent').children.length === 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overviewUpcoming button').evaluate(n => n === document.activeElement), true);
});
test('refresh discards a late old History response and clears summaries while jobs reload', async () => {
  let release, count = 0;
  const held = new Promise(r => { release = r; });
  await page.route('**/api/history?*', async route => {
    const first = ++count === 1; if (first) await held;
    const payload = history(new URL(route.request().url())); payload.jobs[0].taskName = first ? 'OLD RESPONSE' : 'FRESH RESPONSE';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto(base); await ready(); await page.waitForFunction(() => document.getElementById('overviewHistoryStatus').textContent.includes('正在讀取'));
  let releaseJobs; const jobsHeld = new Promise(r => { releaseJobs = r; });
  await page.route('**/api/jobs', async route => { await jobsHeld; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot()) }); });
  await page.locator('#refreshBtn').click();
  assert.equal(await page.locator('#overview-monitored').innerText(), '—');
  assert.equal(await page.locator('#overviewRecent li').count(), 0);
  release(); releaseJobs(); await ready();
  await page.waitForFunction(() => document.getElementById('overviewRecent').textContent.includes('FRESH RESPONSE'));
  assert.doesNotMatch(await page.locator('#overviewRecent').innerText(), /OLD RESPONSE/);
  assert.equal(count, 2);
});
