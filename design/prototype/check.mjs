import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const require = createRequire(new URL('./index.html', import.meta.url));
const { chromium } = require('playwright');
const url = new URL('./index.html', import.meta.url).href;
const screenshots = fileURLToPath(new URL('./screenshots/', import.meta.url));
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); await mkdir(screenshots, { recursive: true }); });
after(async () => { await browser?.close(); });

for (const width of [1280, 375, 320]) test(`all eight pages render without viewport overflow at ${width}px`, async () => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('file:')) failures.push(`Unexpected request: ${request.url()}`); });
  await page.goto(url);
  for (const section of ['Overview','Automations','US Stocks','TW Stocks','Performance','Reports','Data & Evidence','Settings']) {
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
