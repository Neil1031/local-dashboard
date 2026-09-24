import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { summarize, jobDisplayName, jobSubtitle, orderedJobs, visibleJobs, foldDatedJobs, viewCounts } from '../dashboard.mjs';

// Explicit opt-in. This uses the packaged service and real configured collector;
// no routes, mocked responses, task mutations, or additional detail requests.
test('packaged UI renders the actual list response and refreshes once', { skip: !process.env.DASHBOARD_LIVE_URL }, async () => {
  const require = createRequire(new URL('../.tools/browser-tests/package.json', import.meta.url));
  const { chromium } = require('playwright');
  // Allow a just-started local JAR to bind before opening the browser. Probe only
  // the static page so readiness checking cannot launch extra collections.
  const deadline = Date.now() + 15_000;
  while (true) {
    try {
      const response = await fetch(process.env.DASHBOARD_LIVE_URL, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) break;
    } catch { /* Retry within the bounded startup window. */ }
    assert.ok(Date.now() < deadline, 'Packaged service did not become ready within 15 seconds');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: 'Asia/Taipei' });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push({ url: request.url(), method: request.method() }); });
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/jobs'),
      page.goto(process.env.DASHBOARD_LIVE_URL)
    ]);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['cache-control'], 'no-store');
    const snapshot = await response.json();
    assert.equal(snapshot.collectionStatus, 'OK');
    assert.ok(snapshot.jobs.length > 0, 'Configure real tasks for this opt-in acceptance test');
    await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
    const rows = page.locator('.job-row:visible');
    const displayedJobs = foldDatedJobs(orderedJobs(visibleJobs(snapshot.jobs)))
      .flatMap(entry => entry.kind === 'dated' ? entry.latest : [entry.job]);
    assert.equal(await rows.count(), displayedJobs.length);
    const counts = summarize(snapshot.jobs);
    for (const [key, value] of Object.entries(counts)) assert.equal(await page.locator(`#count-${key}`).innerText(), String(value));
    const presentationCounts = viewCounts(snapshot.jobs, false, 'all');
    for (const [key, value] of Object.entries(presentationCounts)) assert.equal(await page.locator(`#view-${key}`).innerText(), String(value));
    const title = value => value.charAt(0) + value.slice(1).toLowerCase();
    for (let index = 0; index < displayedJobs.length; index++) {
      const job = displayedJobs[index];
      const row = rows.nth(index);
      assert.equal(await row.getAttribute('data-status'), job.status);
      assert.equal(await row.locator('.job-name').innerText(), jobDisplayName(job));
      assert.ok((await row.innerText()).includes(jobSubtitle(job)));
      assert.ok((await row.innerText()).includes(`Last run: ${title(job.lastRunStatus)}`));
      await row.click();
      const values = await page.locator('#detailGrid .detail').evaluateAll(details => Object.fromEntries(details.map(detail => [detail.querySelector('small').textContent, detail.querySelector('strong').textContent])));
      assert.equal(values['Current status'], title(job.status));
      assert.equal(values['Scheduler state'], job.state);
      assert.equal(values['Last run status'], title(job.lastRunStatus));
      assert.equal(values['Last task result'], job.lastTaskResult == null ? '—' : String(job.lastTaskResult));
      assert.equal(values['Result text'], job.resultText || '—');
      const localDate = await page.evaluate(value => value ? new Date(value).toLocaleString() : '—', job.lastRunAt);
      assert.equal(values['Last run'], localDate);
      await page.keyboard.press('Escape');
    }
    assert.equal(requests.length, 1);
    const artifactDir = fileURLToPath(new URL('../target/stage-2/', import.meta.url));
    await mkdir(artifactDir, { recursive: true });
    await page.screenshot({ path: `${artifactDir}/live-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${artifactDir}/live-mobile.png`, fullPage: true });
    const refreshResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/jobs');
    await page.locator('#refreshBtn').click();
    const refreshed = await (await refreshResponse).json();
    await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled);
    assert.notEqual(refreshed.collectedAt, snapshot.collectedAt);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.method === 'GET' && new URL(request.url).pathname === '/api/jobs'));
    assert.deepEqual(errors, []);
    await writeFile(`${artifactDir}/live-ui.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), requests, snapshot, refreshed, errors }, null, 2));
  } finally { await browser.close(); }
});
