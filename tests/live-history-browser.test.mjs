import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { jobDisplayName, visibleJobs } from '../dashboard.mjs';

test('packaged history UI matches every persisted API execution without another collection', { skip: !process.env.DASHBOARD_LIVE_URL }, async () => {
  const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const artifactDir = fileURLToPath(new URL('../target/stage-3b/', import.meta.url));
  await mkdir(artifactDir, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, timezoneId: 'Asia/Taipei', locale: 'en-US' });
    const requests = [], errors = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/jobs');
    await page.goto(process.env.DASHBOARD_LIVE_URL);
    const snapshot = await (await response).json();
    assert.equal(snapshot.collectionStatus, 'OK');
    await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
    const historyResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/history');
    await page.locator('#historyTab').click();
    const actualResponse = await historyResponse;
    assert.equal(actualResponse.status(), 200);
    assert.equal(actualResponse.headers()['cache-control'], 'no-store');
    const history = await actualResponse.json();
    await page.waitForFunction(() => document.getElementById('historyView').getAttribute('aria-busy') === 'false');
    const expectedIds = new Set(visibleJobs([...snapshot.jobs, ...history.jobs]).map(job => job.id));
    assert.equal(await page.locator('.history-row').count(), expectedIds.size);
    const fold = page.locator('#historyBody .fold-toggle');
    if (await fold.count()) await fold.click();
    let checkedExecutions = 0, checkedCells = 0;
    const details = [];
    for (const id of expectedIds) {
      const row = page.locator(`.history-row[data-job="${id}"]`);
      const current = snapshot.jobs.find(job => job.id === id);
      const saved = history.jobs.find(job => job.id === id);
      assert.equal(await row.locator('.history-job-name').innerText(), jobDisplayName(current ?? saved));
      // Independent browser-local grouping (no imports from production mapping code).
      const groups = await page.evaluate(({ runs, from }) => {
        const first = new Date(from);
        return Array.from({ length: 7 }, (_, index) => {
          const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
          return runs.filter(run => new Date(run.observedRunAt).toDateString() === day.toDateString())
            .sort((a, b) => Date.parse(a.observedRunAt) - Date.parse(b.observedRunAt));
        });
      }, { runs: saved?.runs || [], from: history.from });
      for (let index = 0; index < 7; index++) {
        const runs = groups[index], cell = row.locator('.day-cell').nth(index);
        const failed = runs.some(run => run.outcome === 'FAILED');
        assert.equal(await cell.innerText(), runs.length ? `${failed ? '!' : '✓'}${runs.length > 1 ? ` ${runs.length}` : ''}` : '—');
        if (!runs.length) continue;
        checkedCells++;
        await cell.click();
        const items = page.locator('.history-execution');
        assert.equal(await items.count(), runs.length);
        for (let runIndex = 0; runIndex < runs.length; runIndex++) {
          const run = runs[runIndex], item = items.nth(runIndex);
          assert.equal(await item.getAttribute('data-run-id'), String(run.id));
          assert.equal(await item.locator('time').getAttribute('datetime'), run.observedRunAt);
          assert.equal(await item.locator('time').innerText(), await page.evaluate(value => new Date(value).toLocaleTimeString(), run.observedRunAt));
          assert.ok((await item.innerText()).includes(run.outcome === 'FAILED' ? '! Failed' : '✓ Success'));
          assert.ok((await item.innerText()).includes(`Result: ${run.schedulerResult ?? '—'}`));
          if (run.message) assert.ok((await item.innerText()).includes(run.message));
          checkedExecutions++;
        }
        details.push({ jobId: id, dayIndex: index, runIds: runs.map(run => run.id) });
        await page.screenshot({ path: `${artifactDir}/live-detail.png` });
        await page.keyboard.press('Escape');
        assert.equal(await cell.evaluate(node => node === document.activeElement), true);
      }
    }
    assert.ok(checkedExecutions > 0, 'Requires actual previously persisted history within the current window');
    for (const width of [1280, 820, 375, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${artifactDir}/live-history-${width}.png`, fullPage: true });
    }
    await page.locator('#todayTab').click();
    assert.equal(await page.locator('.job-row').count(), visibleJobs(snapshot.jobs).length);
    await page.locator('#historyTab').click();
    assert.equal(requests.length, 2);
    assert.equal(requests.filter(url => new URL(url).pathname === '/api/jobs').length, 1);
    assert.deepEqual(errors, []);
    await writeFile(`${artifactDir}/live-history.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), snapshot, history, requests, checkedCells, checkedExecutions, details, errors }, null, 2));
  } finally { await browser.close(); }
});
