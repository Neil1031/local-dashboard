import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

// Opt-in packaged first-run acceptance: real HTTP, no mocked scheduler or routes.
test('bootstrapped packaged UI shows current Chinese aliases with original scheduler names',
  { skip: !process.env.DASHBOARD_BOOTSTRAP_LIVE_URL }, async () => {
    const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/jobs'),
        page.goto(process.env.DASHBOARD_BOOTSTRAP_LIVE_URL)
      ]);
      assert.equal(response.status(), 200);
      const snapshot = await response.json();
      assert.notEqual(snapshot.collectionStatus, 'NOT_CONFIGURED');
      assert.equal(snapshot.collectionStatus, 'OK');
      assert.deepEqual(snapshot.unmatchedIncludes, []);
      assert.ok(snapshot.jobs.length >= 6);
      await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
      const labels = await page.locator('.job-row .job-name').allTextContents();
      const dated = snapshot.jobs.filter(job => job.name.startsWith('AIStockHunter-Accumulation-Check-'));
      assert.ok(dated.length >= 1);
      assert.deepEqual(labels.toSorted(), ['市場資料更新', 'SEC 內部人交易更新', '內部人資料同步',
        '異常成交量每日掃描', '籌碼累積每週檢查',
        ...dated.map(job => `籌碼累積上線檢查 · ${job.name.slice('AIStockHunter-Accumulation-Check-'.length)}`)].toSorted());
      assert.deepEqual(snapshot.jobs.map(job => job.name).toSorted(), ['InsiderTracker-Market', 'InsiderTracker-SEC',
        'InsiderTracker-SyncImport', 'AIStockHunter-UnexplainedVolume-Daily', 'AIStockHunter-Accumulation-Weekly-Check',
        ...dated.map(job => job.name)].toSorted());
      assert.deepEqual(errors, []);
      if (process.env.DASHBOARD_BOOTSTRAP_EVIDENCE) {
        const output = process.env.DASHBOARD_BOOTSTRAP_EVIDENCE;
        await mkdir(output, { recursive: true });
        await writeFile(`${output}/ui.json`, JSON.stringify({ labels, originalNames: snapshot.jobs.map(job => job.name), errors }, null, 2));
        await page.screenshot({ path: `${output}/ui.png`, fullPage: true });
      }
    } finally { await browser.close(); }
  });
