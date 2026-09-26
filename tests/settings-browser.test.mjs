import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
const { chromium } = require('playwright');
const jobs = ['AIStockHunter-UnexplainedVolume-Daily', 'AIStockHunter-Accumulation-Check-2026-09-22', 'My-New-Task'].map((name, index) =>
  ({ id: `id-${index}`, name, taskPath: '\\', status: 'READY', lastRunStatus: 'UNKNOWN' }));

test('settings save applies cached snapshot, remains safe, and rejects stale tab', async () => {
  const server = createServer(async (request, response) => {
    const file = request.url === '/dashboard.mjs' ? 'dashboard.mjs' : 'index.html';
    response.setHeader('Content-Type', file.endsWith('mjs') ? 'text/javascript' : 'text/html; charset=utf-8');
    response.end(await readFile(new URL(`../${file}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    let revision = '0', overrides = {}, collectionCount = 0;
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    const route = async handler => {
      const page = await context.newPage();
      await page.route('**/api/**', async request => {
        const path = new URL(request.request().url()).pathname;
        if (path === '/api/jobs') {
          collectionCount++;
          return request.fulfill({ contentType: 'application/json', body: JSON.stringify({ collectionStatus: 'OK', collectedAt: '2026-09-22T01:00:00Z', jobs, errors: [], unmatchedIncludes: [] }) });
        }
        if (path === '/api/history') {
          const u = new URL(request.request().url());
          return request.fulfill({ contentType: 'application/json', body: JSON.stringify({ from: u.searchParams.get('from'), to: u.searchParams.get('to'), jobs: [] }) });
        }
        if (request.request().method() === 'GET') return request.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, revision, overrides, warning: null }) });
        const body = request.request().postDataJSON();
        if (body.expectedRevision !== revision) return request.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"REVISION_CONFLICT"}' });
        overrides = body.overrides; revision = String(Number(revision) + 1);
        return request.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, revision, overrides, warning: null }) });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
      await handler(page);
      return page;
    };
    const pageA = await route(async page => {
      await page.locator('#settingsToggle').click();
      await page.locator('#settingsJobs button').filter({ hasText: 'My-New-Task' }).click();
      assert.equal(await page.locator('#settingRawName').inputValue(), 'My-New-Task');
      assert.equal(await page.locator('#settingRawName').getAttribute('readonly'), '');
    });
    const pageB = await route(async page => {
      await page.locator('#settingsToggle').click();
      await page.locator('#settingsJobs button').filter({ hasText: 'My-New-Task' }).click();
    });
    await pageA.locator('#settingDisplayName').fill('<img src=x onerror=window.injected=true>');
    await pageA.locator('#settingMarket').selectOption('台股');
    await pageA.locator('#settingOrder').fill('1');
    await pageA.locator('#addDependency').click();
    await pageA.locator('#settingDependencies input').fill('AIStockHunter-UnexplainedVolume-Daily');
    await pageA.locator('#settingsForm button[type=submit]').click();
    await assertEventually(async () => assert.match(await pageA.locator('#settingsMessage').innerText(), /已儲存/));
    assert.equal(collectionCount, 2);
    assert.equal(await pageA.locator('img').count(), 0);
    assert.equal(await pageA.evaluate(() => window.injected), undefined);
    assert.equal(await pageA.locator('.job-row').first().getAttribute('data-job'), 'id-2');
    assert.match(await pageA.locator('#workflowView').innerText(), /資料前置/);
    await pageA.locator('#historyTab').click();
    await pageA.waitForFunction(() => document.getElementById('historyView').getAttribute('aria-busy') === 'false');
    assert.match(await pageA.locator('#historyView').innerText(), /<img src=x/);
    await pageA.locator('#todayTab').click();
    await pageB.locator('#settingDisplayName').fill('舊分頁');
    await pageB.locator('#settingsForm button[type=submit]').click();
    await assertEventually(async () => assert.match(await pageB.locator('#settingsMessage').innerText(), /其他分頁/));
    assert.equal(overrides['My-New-Task'].displayName, '<img src=x onerror=window.injected=true>');
    await pageA.locator('#settingHidden').check();
    await pageA.locator('#settingsForm button[type=submit]').click();
    await assertEventually(async () => assert.equal(await pageA.locator('.job-row[data-job="id-2"]').count(), 0));
    assert.equal(await pageA.locator('#count-monitored').innerText(), '3');
    assert.equal(collectionCount, 2);
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await pageA.setViewportSize({ width: 320, height: 900 });
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await pageA.locator('#resetSettings').click();
    await assertEventually(async () => assert.equal(await pageA.locator('.job-row[data-job="id-2"]').count(), 1));
    assert.equal(Object.hasOwn(overrides, 'My-New-Task'), false);
    pageA.once('dialog', dialog => dialog.accept());
    await pageA.locator('#resetAllSettings').click();
    await assertEventually(async () => assert.match(await pageA.locator('#settingsMessage').innerText(), /已儲存/));
    assert.deepEqual(overrides, {});
    await pageA.close(); await pageB.close(); await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

async function assertEventually(check) {
  let last;
  for (let i = 0; i < 30; i++) {
    try { return await check(); } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  throw last;
}
