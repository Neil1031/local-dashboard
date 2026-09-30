import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { parseProjectDesign, featureCounts } from '../../ui/project-design.mjs';

const require = createRequire(new URL('./index.html', import.meta.url));
const { chromium } = require('playwright');
const url = new URL('./index.html', import.meta.url).href;
const screenshots = process.env.PROTOTYPE_SCREENSHOT_DIR || fileURLToPath(new URL('./screenshots/', import.meta.url));
const design = parseProjectDesign(await readFile(new URL('../../docs/PROJECT-DESIGN.md', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); await mkdir(screenshots, { recursive: true }); });
after(async () => { await browser?.close(); });

for (const width of [1280, 375, 320]) test(`all nine pages render without viewport overflow at ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('file:')) failures.push(`Unexpected request: ${request.url()}`); });
  await page.goto(url);
  for (const section of ['Overview','Projects','Automations','US Stocks','TW Stocks','Performance','Reports','Data & Evidence','Settings']) {
    const nav = page.locator(width <= 700 ? '#mobile-nav' : '#side-nav').getByRole('button', { name: section, exact: true });
    await nav.click();
    assert.equal(await page.locator('main h1').textContent(), section === 'Overview' ? 'Good morning, Neil' : section);
    assert.ok(await page.getByText('SAMPLE / PROTOTYPE DATA').count() > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${section} overflows ${width}px`);
    const tabs = await page.getByRole('tab').allTextContents();
    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      assert.equal(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${section}/${tab} overflows ${width}px`);
    }
  }
  await page.locator(width <= 700 ? '#mobile-nav' : '#side-nav').getByRole('button', { name: 'Overview' }).click();
  await page.screenshot({ path: `${screenshots}overview-${width}.png`, fullPage: true });
  if (width === 1280) {
    await page.locator('#side-nav').getByRole('button', { name: 'US Stocks' }).click();
    await page.getByRole('tab', { name: 'Signals' }).click();
    await page.screenshot({ path: `${screenshots}us-stocks-1280.png`, fullPage: true });
  }
  if (width === 375) {
    await page.locator('#mobile-nav').getByRole('button', { name: 'Data & Evidence' }).click();
    await page.getByRole('tab', { name: 'Data Sources' }).click();
    await page.screenshot({ path: `${screenshots}data-evidence-375.png`, fullPage: true });
  }
  assert.deepEqual(failures, []);
  await page.close();
});

for (const width of [1280, 375, 320]) test(`Projects landing and six detail views at ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('file:')) failures.push(`Unexpected request: ${request.url()}`); });
  await page.goto(url);
  await page.locator(width <= 700 ? '#mobile-nav' : '#side-nav').getByRole('button', { name: 'Projects', exact: true }).click();
  assert.equal(await page.locator('.project-card').count(), 1);
  assert.equal(await page.locator('.project-count').count() >= 4, true);
  assert.equal(await page.getByText('SAMPLE / PROTOTYPE DATA').count() > 0, true);
  assert.equal(await page.locator('.project-card').getByText(/% Complete/).count(), 0);
  const total = await page.locator('.project-count strong').allTextContents();
  assert.equal(total.reduce((sum, value) => sum + Number(value), 0), 33);
  const byStatus = await page.locator('.project-count').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [
    node.querySelector('span').textContent, Number(node.querySelector('strong').textContent)
  ])));
  assert.deepEqual(byStatus, Object.fromEntries(Object.entries(featureCounts(design.features))
    .filter(([, count]) => count > 0).map(([status, count]) => [status.replaceAll('_', ' '), count])));
  await page.screenshot({ path: `${screenshots}projects-landing-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Open project →' }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('main h1').textContent(), 'Local Dashboard');
  const views = ['Overview','Features','Architecture','Problems','Changes','Remaining'];
  assert.deepEqual(await page.getByRole('tab').allTextContents(), views);
  for (const view of views) {
    await page.getByRole('tab', { name: view, exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: view, exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Projects/${view} overflows ${width}px`);
    if (view === 'Features') {
      assert.equal(await page.locator('.project-feature').count(), 33);
      assert.ok((await page.locator('.project-feature summary').filter({ hasText: 'Projects' }).textContent())
        .includes(design.features.find(feature => feature.id === 'product-projects').status));
    }
    if (view === 'Architecture') assert.equal(await page.locator('.architecture-node').count(), 8);
    if (view === 'Problems') assert.equal(await page.locator('.project-problem').count(), 5);
    if (view === 'Changes') assert.equal(await page.locator('.project-timeline li').count(), 7);
    if (view === 'Remaining') {
      assert.equal(await page.locator('.project-remaining section').count(), 4);
      assert.equal(await page.getByText('Review Local Dashboard Project Design pilot').count(), 0);
      assert.equal(await page.getByText(design.remaining[0].work, { exact: true }).count(), 1);
    }
    if (width === 1280 && ['Features','Problems','Changes','Remaining'].includes(view)) {
      await page.screenshot({ path: `${screenshots}projects-${view.toLowerCase()}-1280.png`, fullPage: true });
    }
  }
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Features' }).getAttribute('aria-selected'), 'true');
  await page.locator('.project-feature summary').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.project-feature').first().getAttribute('open'), '');
  await page.getByRole('tab', { name: 'Architecture' }).click();
  await page.screenshot({ path: `${screenshots}projects-architecture-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: '← All projects' }).click();
  assert.equal(await page.locator('.project-card').count(), 1);
  assert.deepEqual(failures, []);
  await page.close();
});

test('subtabs, filters, drawer and keyboard navigation work', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url);
  await page.locator('#side-nav').getByRole('button', { name: 'US Stocks' }).click();
  await page.getByRole('button', { name: 'SEC', exact: true }).click();
  assert.equal(await page.locator('#signal-results .signal-card').count(), 1);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  assert.equal(await page.locator('#signal-results table tbody tr').count(), 1);
  await page.locator('#signal-search').fill('ZZZ');
  assert.match(await page.locator('#signal-results').textContent(), /No sample rows/);
  await page.locator('#signal-search').fill('');
  await page.getByRole('button', { name: 'ATLS', exact: true }).click();
  assert.equal(await page.locator('#drawer').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#drawer').isVisible(), false);
  await page.getByRole('tab', { name: 'Signals' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'SEC Transactions' }).getAttribute('aria-selected'), 'true');
  await page.close();
});
