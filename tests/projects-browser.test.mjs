import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serveStaticAsset } from './static-assets.mjs';
import { parseProjectDesign, featureCounts } from '../ui/project-design.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const source = await readFile(new URL('../docs/PROJECT-DESIGN.md', import.meta.url), 'utf8');
const model = parseProjectDesign(source);
let browser, server, base, page, errors;
before(async () => {
  server = createServer(serveStaticAsset);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir(new URL('../target/projects-r1a1/', import.meta.url), { recursive: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
beforeEach(async () => {
  page = await browser.newPage(); errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const payload = path === '/api/settings/job-metadata' ? { version: 1, revision: '0', overrides: {}, warning: null }
      : path === '/api/runner/executions' ? { status: 'NOT_CONFIGURED', jobs: [], warnings: [] }
      : { collectionStatus: 'NOT_CONFIGURED', collectedAt: '2026-09-30T00:00:00Z', jobs: [], errors: [], unmatchedIncludes: [] };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
  });
});
afterEach(async () => { await page.close(); assert.deepEqual(errors, []); });
async function open() { await page.goto(base); await page.locator('#projectsTab').click(); }
async function settled() { await page.waitForFunction(() => document.getElementById('projectsView').getAttribute('aria-busy') === 'false'); }
for (const width of [1280, 375, 320]) test(`canonical Projects and keyboard details at ${width}px without overflow`, async () => {
  await page.setViewportSize({ width, height: 900 });
  const requests = [];
  page.on('request', r => { if (new URL(r.url()).pathname === '/project-design/PROJECT-DESIGN.md') requests.push(r.method()); });
  await page.goto(base);
  assert.equal(requests.length, 0);
  await page.locator('#projectsTab').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#projectsTab').getAttribute('aria-current'), 'page');
  await settled();
  assert.deepEqual(requests, ['GET']);
  assert.deepEqual(await page.locator('.project-feature').evaluateAll(nodes => nodes.map(n => n.dataset.featureId)), model.features.map(f => f.id));
  for (const [status, count] of Object.entries(featureCounts(model.features)))
    assert.equal(await page.locator(`.project-count[data-status="${status}"] strong`).innerText(), String(count));
  assert.match(await page.locator('#projectsView').innerText(), /正式專案設計／本次建置快照/);
  assert.equal(await page.locator('#projectsView script').count(), 0);
  await page.locator('.project-source-summary').click();
  assert.match(await page.locator('#projectSourceInfo').innerText(), /歷史盤點 baseline（非本次實作 SHA）/);
  const feature = page.locator('[data-feature-id="product-projects"]');
  await feature.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await feature.getAttribute('open'), '');
  assert.match(await feature.innerText(), /原始目的[\s\S]*目前實作[\s\S]*目前限制[\s\S]*剩餘工作/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL(`../target/projects-r1a1/projects-${width}.png`, import.meta.url)), fullPage: true });
  await page.locator('#projectsView').screenshot({ path: fileURLToPath(new URL(`../target/projects-r1a1/projects-panel-${width}.png`, import.meta.url)) });
  await page.locator('#projectsView').evaluate(node => node.scrollIntoView());
  await page.screenshot({ path: fileURLToPath(new URL(`../target/projects-r1a1/projects-header-${width}.png`, import.meta.url)) });
  await page.locator('#automationsPage').focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#todayTab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#todayView').isVisible(), true);
  assert.equal(await page.locator('#projectsView').isVisible(), false);
  await page.locator('#settingsPage').click(); assert.equal(await page.locator('#settingsPanel').isVisible(), true);
});
test('loading clears old data; missing/format/unsupported/unavailable/oversize errors recover with retry', async () => {
  await open(); await settled();
  for (const [status, text, code] of [[404, 'secret C:/private.db', 'MISSING'], [200, 'broken', 'INVALID_FORMAT'],
    [200, source.replace('design_version: 1', 'design_version: 2'), 'UNSUPPORTED_VERSION'],
    [503, 'secret SQL', 'UNAVAILABLE'], [200, 'x'.repeat(262145), 'TOO_LARGE']]) {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/project-design/PROJECT-DESIGN.md', async route => { await held; await route.fulfill({ status, contentType: 'text/markdown', body: text }); });
    await page.locator('#projectsRetry').click();
    assert.equal(await page.locator('.project-feature').count(), 0);
    assert.equal(await page.locator('.project-count').count(), 0);
    assert.match(await page.locator('#projectsStatus').innerText(), /正在讀取/);
    release(); await settled();
    assert.match(await page.locator('#projectsStatus').innerText(), new RegExp(code));
    assert.doesNotMatch(await page.locator('#projectsStatus').innerText(), /private.db|SQL/);
    assert.equal(await page.locator('#projectsData').isVisible(), false);
    await page.unroute('**/project-design/PROJECT-DESIGN.md');
    await page.locator('#projectsRetry').click(); await settled();
    assert.equal(await page.locator('.project-feature').count(), 33);
  }
});
test('unsafe Markdown remains text and a superseded response cannot overwrite latest state', async () => {
  const unsafe = source.replace('雙擊開本機監控畫面', '<img src=x onerror="window.unsafe=1">');
  await page.route('**/project-design/PROJECT-DESIGN.md', route => route.fulfill({ contentType: 'text/markdown', body: unsafe }));
  await open(); await settled();
  await page.locator('.project-feature').first().locator('summary').click();
  assert.match(await page.locator('.project-feature').first().innerText(), /<img src=x onerror=/);
  assert.equal(await page.locator('#projectFeatures img').count(), 0);
  assert.equal(await page.evaluate(() => window.unsafe), undefined);
  await page.unroute('**/project-design/PROJECT-DESIGN.md');
  // Exercise the UI request revision guard with an injected loader fetch that ignores abort.
  const result = await page.evaluate(async original => {
    const { mountProjects } = await import('/ui/projects.mjs');
    let release, count = 0;
    const first = new Promise(resolve => { release = resolve; });
    const projects = mountProjects(document, async () => {
      if (++count === 1) { await first; return new Response(original); }
      return new Response('missing', { status: 404 });
    });
    const old = projects.reload(); await projects.reload(); release(); await old;
    return { text: document.getElementById('projectsStatus').textContent,
      rows: document.querySelectorAll('.project-feature').length };
  }, source);
  assert.match(result.text, /MISSING/); assert.equal(result.rows, 0);
});
