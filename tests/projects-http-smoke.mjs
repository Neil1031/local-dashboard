// Invoked by the isolated random-port Spring test. No production APIs are called.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2];
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const source = await readFile(new URL('../docs/PROJECT-DESIGN.md', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [], sourceRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    assert.equal(new URL(r.url()).origin, base);
    if (r.url().endsWith('/project-design/PROJECT-DESIGN.md')) sourceRequests.push(r.method());
  });
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(
    route.request().url().endsWith('/api/settings/job-metadata') ? { version: 1, revision: '0', overrides: {}, warning: null }
      : { collectionStatus: 'NOT_CONFIGURED', status: 'NOT_CONFIGURED', jobs: [], errors: [], warnings: [] }) }));
  await page.goto(base);
  await page.locator('#projectsTab').click();
  await page.waitForFunction(() => document.getElementById('projectsData').hidden === false);
  assert.equal(await page.locator('.project-feature').count(), 33);
  assert.match(await page.locator('#projectSourceInfo').textContent(), new RegExp(createHash('sha256').update(source).digest('hex')));
  assert.deepEqual(sourceRequests, ['GET']);
  assert.deepEqual(errors, []);
  console.log('PASS: production UI + modules + canonical source over real isolated Spring HTTP; APIs fixture-routed.');
} finally { await browser.close(); }
