import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('packaged settings API and UI apply without collecting tasks', { skip: !process.env.DASHBOARD_LIVE_URL }, async () => {
  const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
    let collections = 0;
    await page.route('**/api/jobs', route => {
      collections++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ collectionStatus: 'OK', collectedAt: '2026-09-22T01:00:00Z',
        jobs: [{ id: 'live-1', name: 'My-New-Task', taskPath: '\\', status: 'READY', lastRunStatus: 'UNKNOWN' }], errors: [], unmatchedIncludes: [] }) });
    });
    await page.goto(process.env.DASHBOARD_LIVE_URL);
    await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
    await page.locator('#settingsToggle').click();
    await page.locator('#settingsJobs button').filter({ hasText: 'My-New-Task' }).click();
    await page.locator('#settingDisplayName').fill('封裝驗收工作');
    await page.locator('#settingsForm button[type=submit]').click();
    await page.waitForFunction(() => document.getElementById('settingsMessage').textContent.includes('已儲存'));
    assert.equal(await page.locator('.job-row .job-name').innerText(), '封裝驗收工作');
    assert.equal(collections, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
    assert.equal(await page.locator('.job-row .job-name').innerText(), '封裝驗收工作');
    assert.equal(collections, 2);
  } finally { await browser.close(); }
});
