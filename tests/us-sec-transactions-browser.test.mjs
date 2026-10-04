import { englishPage } from './locale-browser.mjs';
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { serveStaticAsset } from './static-assets.mjs';
import { secFixture } from './us-sec-transactions-fixture.mjs';
import { signalsFixture } from './us-signals-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server, base, page, errors;
before(async () => {
  server = createServer(serveStaticAsset); await new Promise(r => server.listen(0,'127.0.0.1',r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser.close(); await new Promise(r => server.close(r)); });
beforeEach(async () => {
  page = await englishPage(browser); errors = []; page.on('pageerror',e => errors.push(e.message));
  await page.route('**/api/**',route => {
    const url = new URL(route.request().url()), data = url.pathname === '/api/us/sec-transactions' ? secFixture(url)
      : url.pathname === '/api/us/signals' ? signalsFixture(url) : url.pathname === '/api/history' ? { from:url.searchParams.get('from'),to:url.searchParams.get('to'),jobs:[] }
        : url.pathname === '/api/settings/job-metadata' ? { version:1,revision:'0',overrides:{},warning:null }
          : { collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',collectedAt:new Date().toISOString(),jobs:[],errors:[],warnings:[],unmatchedIncludes:[] };
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
});
afterEach(async () => { await page.close(); assert.deepEqual(errors,[]); });
const ready = () => page.waitForFunction(() => document.getElementById('secStatus').textContent.includes("READY"));
async function openSec(width = 1280) { await page.setViewportSize({width,height:900}); await page.goto(`${base}/#us`); await page.locator('[data-us-page=sec]').click(); await ready(); }
for (const width of [1280,375,320]) test(`SEC partial semantics, keyboard/detail/focus, pagination and safe text at ${width}px`, async () => {
  await openSec(width); assert.equal(await page.locator('.sec-card').count(),50); assert.equal(await page.locator('#usView img').count(),0);
  assert.match(await page.locator('#secPanel').innerText(), /Candidate \/ not certified/); assert.doesNotMatch(await page.locator('#secPanel').innerText(), /Signal Score|Investment Score/);
  assert.match(await page.locator('.sec-card').nth(1).innerText(), /Transaction code\nS/); assert.match(await page.locator('.sec-card').nth(2).innerText(), /derivative/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
  const open = page.locator('.sec-open').nth(2); await open.focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#secDetail').evaluate(n => n.open),true);
  const text = await page.locator('#secDetail').innerText(); assert.match(text,/AMENDMENT_REQUIRES_RECONCILIATION/); assert.match(text,/<script>evil\(\)<\/script>/);
  assert.match(text,/not strategy entry price/); assert.match(text,/Filing accepted time/); assert.match(text,/Local discovered time/); assert.match(text,/not an immutable business-event ID/);
  assert.equal(await page.locator('#secDetail script').count(),0); assert.equal(await page.locator('#secDetail').evaluate(n => n.scrollWidth <= n.clientWidth),true);
  await page.keyboard.press('Escape'); assert.equal(await open.evaluate(n => n === document.activeElement),true);
  await page.locator('#secNext').click(); await page.waitForFunction(() => document.querySelectorAll('.sec-card').length === 1);
  assert.match(await page.locator('#secPage').innerText(),/offset 50/); assert.equal(await page.locator('#secNext').isDisabled(),true);
  await page.locator('#secPrevious').click(); await ready(); await page.locator('#secTicker').fill(' qa1 '); await page.locator('#secFilter button[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('.sec-card').length === 1); assert.match(await page.locator('.sec-open').innerText(),/QA1/);
  await page.locator('[data-us-page=signals]').click(); await page.waitForFunction(() => document.getElementById('signalsStatus').textContent.includes("READY"));
  assert.equal(await page.locator('.signal-card:visible').count(),50); assert.match(await page.locator('#signalsPanel').innerText(),/Imported AI report/);
});
test('SEC states clear stale records, observation stays truthful and errors stay private', async () => {
  await openSec();
  for (const state of ['EMPTY','UNAVAILABLE','ERROR']) {
    await page.route('**/api/us/sec-transactions?*',route => route.fulfill({contentType:'application/json',body:JSON.stringify(secFixture(new URL(route.request().url()),state))}));
    await page.locator('#secReload').click(); await page.waitForFunction(s => document.getElementById('secStatus').textContent.startsWith(s),state);
    assert.equal(await page.locator('.sec-card').count(),0); assert.equal(await page.locator('#secNext').isDisabled(),true);
    if (state !== 'EMPTY') assert.match(await page.locator('#secSource').innerText(),/Successful source observation —/);
  }
  await page.route('**/api/us/sec-transactions?*',route => route.fulfill({status:500,body:'private source URL and stderr'}));
  await page.locator('#secReload').click(); await page.waitForFunction(() => document.getElementById('secStatus').textContent.includes("retry"));
  assert.doesNotMatch(await page.locator('#secPanel').innerText(),/private source/);
});
test('newer filter wins, leaving page cancels rendering, and switching closes native dialog', async () => {
  let release; const held = new Promise(r => release=r); let first = true;
  await page.route('**/api/us/sec-transactions?*',async route => {
    if (first) { first=false; await held; } try { await route.fulfill({contentType:'application/json',body:JSON.stringify(secFixture(new URL(route.request().url())))}); } catch {}
  });
  await page.goto(`${base}/#us`); await page.locator('[data-us-page=sec]').click(); await page.waitForFunction(() => document.getElementById('secStatus').textContent.includes('Loading'));
  await page.locator('#secTicker').fill('QA2'); await page.locator('#secFilter button[type=submit]').click(); await ready(); release();
  assert.equal(await page.locator('.sec-card').count(),1); await page.locator('.sec-open').click(); await page.keyboard.press('Escape');
  await page.locator('[data-page=overview]').click(); assert.equal(await page.locator('#secDetail').evaluate(n => n.open),false);
  await page.locator('[data-page=us]').click(); await ready(); assert.equal(await page.locator('.sec-card').count(),1);
});
