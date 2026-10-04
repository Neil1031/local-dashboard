import { englishPage } from './locale-browser.mjs';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { serveStaticAsset } from './static-assets.mjs';
import { signalsFixture } from './us-signals-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server, base, page, errors;
before(async () => {
  server = createServer(serveStaticAsset); await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser.close(); await new Promise(r => server.close(r)); });
beforeEach(async () => {
  page = await englishPage(browser); errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const payload = url.pathname === '/api/us/signals' ? signalsFixture(url)
      : url.pathname === '/api/jobs' ? { collectionStatus: 'NOT_CONFIGURED', collectedAt: new Date().toISOString(), jobs: [], errors: [], unmatchedIncludes: [] }
        : url.pathname === '/api/history' ? { from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: [] }
          : url.pathname === '/api/runner/executions' ? { status: 'NOT_CONFIGURED', jobs: [], warnings: [] } : { version: 1, revision: '0', overrides: {}, warning: null };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
});
afterEach(async () => { await page.close(); assert.deepEqual(errors, []); });
const ready = () => page.waitForFunction(() => document.getElementById('signalsStatus').textContent.includes("READY"));
for (const width of [1280, 375, 320]) test(`Signals safe cards, pagination, keyboard/detail/Escape and overflow at ${width}px`, async () => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`${base}/#us`); await ready();
  assert.equal(await page.locator('.signal-card').count(), 50); assert.equal(await page.locator('#usView img').count(), 0);
  assert.match(await page.locator('.signal-card').first().innerText(), /Imported AI report[\s\S]*data-quality flags/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const open = page.locator('.signal-open').first(); await open.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#signalDetail').evaluate(n => n.open), true);
  assert.match(await page.locator('#signalDetail').innerText(), /<script>evil\(\)<\/script>/);
  assert.match(await page.locator('#signalDetail').innerText(), /not the complete population/);
  assert.equal(await page.locator('#signalDetail script').count(), 0);
  assert.equal(await page.locator('#signalDetail').evaluate(n => n.scrollWidth <= n.clientWidth), true);
  await page.keyboard.press('Escape'); assert.equal(await open.evaluate(n => n === document.activeElement), true);
  await page.locator('#signalsNext').click(); await page.waitForFunction(() => document.querySelectorAll('.signal-card').length === 1);
  assert.match(await page.locator('#signalsPage').innerText(), /offset 50/); assert.equal(await page.locator('#signalsNext').isDisabled(), true);
  await page.locator('#signalsPrevious').click(); await page.waitForFunction(() => document.querySelectorAll('.signal-card').length === 50);
  await page.locator('#signalsTicker').fill(' qa1 '); await page.locator('#signalsFilter button[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('.signal-card').length === 1);
  assert.match(await page.locator('.signal-open').innerText(), /QA1/);
});
test('empty/unavailable/error clear prior data and never imply successful observation', async () => {
  await page.goto(`${base}/#us`); await ready();
  for (const state of ['EMPTY', 'UNAVAILABLE', 'ERROR']) {
    await page.route('**/api/us/signals?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(signalsFixture(new URL(route.request().url()), state)) }));
    await page.locator('#signalsReload').click(); await page.waitForFunction(s => document.getElementById('signalsStatus').textContent.startsWith(s), state);
    assert.equal(await page.locator('.signal-card').count(), 0); assert.equal(await page.locator('#signalsNext').isDisabled(), true);
    if (state !== 'EMPTY') assert.match(await page.locator('#signalsSource').innerText(), /Successful source observation —/);
  }
  await page.route('**/api/us/signals?*', route => route.fulfill({ status: 500, body: 'private raw error' }));
  await page.locator('#signalsReload').click(); await page.waitForFunction(() => document.getElementById('signalsStatus').textContent.includes("retry"));
  assert.doesNotMatch(await page.locator('#usView').innerText(), /private raw error/);
});
test('loading, newer filter wins, and leaving page prevents stale rendering', async () => {
  let release; const held = new Promise(r => release = r); let first = true;
  await page.route('**/api/us/signals?*', async route => {
    if (first) { first = false; await held; }
    try { await route.fulfill({ contentType: 'application/json', body: JSON.stringify(signalsFixture(new URL(route.request().url()))) }); } catch {}
  });
  await page.goto(`${base}/#us`); await page.waitForFunction(() => document.getElementById('signalsStatus').textContent.includes('Loading'));
  await page.locator('#signalsTicker').fill('QA2'); await page.locator('#signalsFilter button[type=submit]').click(); await ready();
  assert.equal(await page.locator('.signal-card').count(), 1); release();
  await page.locator('[data-page=overview]').click(); await page.locator('[data-page=us]').click(); await ready();
  assert.equal(await page.locator('.signal-card').count(), 1); assert.match(await page.locator('.signal-open').innerText(), /QA2/);
});
