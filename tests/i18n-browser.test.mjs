import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serveStaticAsset } from './static-assets.mjs';
import { twFixture, warmingFixture } from './tw-stocks-fixture.mjs';
import { twReportsFixture, twDetailFixture } from './tw-reports-fixture.mjs';
import { reportsFixture, reportDetailFixture } from './reports-fixture.mjs';
import { performanceFixture } from './performance-fixture.mjs';
import { signalsFixture } from './us-signals-fixture.mjs';
import { secFixture } from './us-sec-transactions-fixture.mjs';
import { tickerFixture } from './us-ticker-detail-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let server, browser, base, page, calls, errors;
const job = () => ({ id: 'fixture-job', name: 'Loading', taskName: 'Loading', taskPath: '\\', enabled: true,
  status: 'READY', state: 'READY', lastRunStatus: 'SUCCESS', lastRunAt: '2026-10-04T01:00:00Z', lastTaskResult: 0,
  nextRunAt: new Date(Date.now() + 3600000).toISOString(), warnings: [], resultText: 'source {count} <b>RAW</b>' });
const routes = url => {
  const p = url.pathname;
  if (p === '/api/tw/stocks') return twFixture(url.searchParams.get('date'));
  if (p === '/api/reports/tw') return twReportsFixture(url);
  if (p === '/api/reports/tw/detail') return twDetailFixture(url);
  if (p === '/api/reports/us-insider') return reportsFixture(url);
  if (p === '/api/reports/us-insider/detail') return reportDetailFixture(url);
  if (p.startsWith('/api/performance/')) return performanceFixture(url);
  if (p === '/api/us/signals') return signalsFixture(url);
  if (p === '/api/us/sec-transactions') return secFixture(url);
  if (p === '/api/us/ticker-detail') return tickerFixture(url);
  if (p === '/api/history') return { from: url.searchParams.get('from'), to: url.searchParams.get('to'), jobs: [{ id: 'fixture-job', taskName: 'Loading', taskPath: '\\', enabled: true,
    runs: [{ id: 1, observedRunAt: new Date(Date.now()-10000).toISOString(), outcome: 'SUCCESS', schedulerResult: 0, durationMs: null, message: 'source {count} <b>RAW</b>' }] }] };
  if (p === '/api/runner/executions') return { status: 'OK', configStatus: 'CONFIGURED', roots: { primary: 'AVAILABLE', fallback: 'NOT_CREATED_YET' },
    jobs: [{ schedulerTask: '\\Loading', profileId: 'fixture-profile', jobId: 'fixture-runner', profileStatus: 'AVAILABLE', coverageState: 'RUNNER_EVIDENCE_AVAILABLE', latestEvidenceAt: '2026-10-04T01:00:00Z',
      executions: [{ executionId: 'fixture-execution', jobId: 'fixture-runner', commandProfileId: 'fixture-profile', state: 'TERMINAL', startedAt: '2026-10-04T01:00:00Z', processStartedAt: '2026-10-04T01:00:01Z', terminalAt: '2026-10-04T01:00:02Z', durationMs: 2000, childStarted: true, childExitCode: 0, runnerExitCode: 0, runnerOutcome: 'SUCCESS', receiptCompleteness: 'COMPLETE', source: 'primary', reason: null, phases: ['STARTED','PROCESS_STARTED','TERMINAL'], warnings: [] }], warnings: [] }], warnings: [] };
  if (p === '/api/settings/job-metadata') return { version: 1, revision: '0', overrides: {}, warning: null };
  if (p === '/api/jobs') return { collectionStatus: 'PARTIAL', collectedAt: '2026-10-04T01:00:00Z', jobs: [job()], errors: ['synthetic source warning'], warnings: [], unmatchedIncludes: [] };
  throw new Error('Unexpected synthetic route: ' + p);
};
before(async () => {
  server = createServer(serveStaticAsset); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
});
after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
beforeEach(async () => {
  page = await browser.newPage(); calls = []; errors = []; page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/project-design/')) calls.push(new URL(r.url()).pathname); }); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(routes(url)) });
  });
});
afterEach(async () => { await page.close(); assert.deepEqual(errors, []); });
const settle = () => page.waitForTimeout(100);
const open = async view => { await page.goto(base + '/#' + view); await page.waitForFunction(() => !document.getElementById('refreshBtn').disabled); await settle(); };
async function switchLocale(locale) {
  const before = calls.length;
  await page.evaluate(async locale => (await import('/ui/i18n.mjs')).setLocale(locale), locale);
  await settle(); assert.equal(calls.length, before, 'locale switch must issue zero application/source requests');
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
}
test('loaded primary pages switch both ways without navigation/refetch; focus and page stay held', async () => {
  await open('overview');
  await page.waitForFunction(() => document.getElementById('overviewRecent').children.length === 1);
  assert.equal(await page.locator('#overview-monitored').textContent(), '1');
  assert.match(await page.locator('#overviewRunner').textContent(), /1/);
  const snapshotNotice = await page.locator('#overviewSnapshot').textContent();
  await switchLocale('en'); assert.notEqual(await page.locator('#overviewSnapshot').textContent(), snapshotNotice);
  assert.equal(await page.locator('#overviewUpcoming button').textContent(), 'Loading');
  await switchLocale('zh-TW'); assert.equal(await page.locator('#overviewSnapshot').textContent(), snapshotNotice);
  assert.equal(await page.locator('#overviewRecent time').count(), 1);
  await page.locator('[data-page="automations"]').click(); await page.locator('#runnerCoverageBody details').evaluate(n => n.open = true);
  const roots = await page.locator('#runnerCoverageBody p').allTextContents();
  await switchLocale('en'); assert.equal(await page.locator('#runnerCoverageBody details').evaluate(n => n.open), true); assert.equal(await page.locator('#runnerCoverageBody p').count(), roots.length);
  await switchLocale('zh-TW'); assert.deepEqual(await page.locator('#runnerCoverageBody p').allTextContents(), roots);
  for (const view of ['overview', 'automations', 'tw', 'reports', 'performance', 'evidence', 'projects', 'settings', 'us']) {
    await page.locator(`[data-page="${view}"]`).click(); await settle();
    if (view === 'evidence') await page.waitForFunction(() => document.getElementById('evidenceView').getAttribute('aria-busy') === 'false');
    const button = page.locator(`[data-page="${view}"]`); await button.focus();
    const hash = new URL(page.url()).hash;
    const title = await page.locator('#pageTitle').textContent();
    await switchLocale('en'); assert.equal(new URL(page.url()).hash, hash);
    assert.equal(await button.evaluate(n => n === document.activeElement), true);
    assert.notEqual(await page.locator('#pageTitle').textContent(), title);
    await switchLocale('zh-TW'); assert.equal(await page.locator('#pageTitle').textContent(), title);
  }
});
test('TW date, held candidate dialog, source company collision and handlers survive both switches', async () => {
  await page.route('**/api/tw/stocks**', route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    const p = twFixture(url.searchParams.get('date')); p.observation.candidates[0].stockName = 'Overview {count} <b>RAW</b>';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(p) });
  });
  await open('tw'); await page.locator('#twDate').fill('2026-09-25'); await page.locator('#twFilter button[type="submit"]').click(); await settle();
  await page.locator('.tw-candidate-open').first().click(); const close = page.locator('#twCandidateClose'); await close.focus();
  const title = await page.locator('#twCandidateTitle').textContent(); const facts = await page.locator('#twCandidateBody').textContent();
  await switchLocale('en'); assert.equal(await page.locator('#twDate').inputValue(), '2026-09-25');
  assert.equal(await page.locator('#twCandidateTitle').textContent(), title); assert.notEqual(await page.locator('#twCandidateBody').textContent(), facts);
  assert.equal(await close.evaluate(n => n === document.activeElement), true); assert.equal(await page.locator('#twCandidateDetail').evaluate(n => n.open), true);
  await switchLocale('zh-TW'); assert.equal(await page.locator('#twCandidateBody').textContent(), facts);
  await close.click(); assert.equal(await page.locator('#twCandidateDetail').evaluate(n => n.open), false);
});
test('Reports paging/date/subpage and open Markdown/revision identity remain intact', async () => {
  await open('reports'); await page.locator('#reportsNext').click(); await settle();
  const count = await page.locator('#reportsPageCount').textContent(); await switchLocale('en'); await switchLocale('zh-TW'); assert.equal(await page.locator('#reportsPageCount').textContent(), count);
  await page.locator('#reportsPrevious').click(); await settle(); await page.locator('.report-open').first().click(); await settle();
  const body = await page.locator('#reportBody').textContent(); const metadata = await page.locator('#reportMetadata dd').allTextContents();
  await switchLocale('en'); assert.equal(await page.locator('#reportBody').textContent(), body); assert.deepEqual(await page.locator('#reportMetadata dd').allTextContents(), metadata);
  await switchLocale('zh-TW'); assert.equal(await page.locator('#reportBody').textContent(), body);
  await page.locator('#reportDetailClose').click();
  await switchLocale('en'); assert.equal(await page.locator('#reportDetailSource').textContent(), ''); assert.equal(await page.locator('#reportRevisionState').textContent(), ''); await switchLocale('zh-TW');
  await page.locator('#reportsDate').fill('2026-09-30'); await page.locator('#reportsFilter button[type="submit"]').click(); await settle();
  await switchLocale('en'); assert.equal(await page.locator('#reportsDate').inputValue(), '2026-09-30'); await switchLocale('zh-TW');
});
test('Performance horizon/filter/page and open saved snapshots stay held', async () => {
  await open('performance'); await page.locator('[data-performance-horizon="1w"]').click(); await settle();
  await page.locator('#performanceNext').click(); await settle();
  const count = await page.locator('#performancePageCount').textContent(); await switchLocale('en'); await switchLocale('zh-TW'); assert.equal(await page.locator('#performancePageCount').textContent(), count);
  await page.locator('#performancePrevious').click(); await settle(); await page.locator('.performance-open').first().click(); await settle();
  const values = await page.locator('#performanceFacts dd').allTextContents(); const snapshots = await page.locator('#performanceSnapshots dd').allTextContents();
  await switchLocale('en');
  const englishValues = await page.locator('#performanceFacts dd').allTextContents();
  for (const index of [0,1,2,3,4,5,6,8,10,11,12,13,14,15,16]) assert.equal(englishValues[index], values[index]);
  assert.match(englishValues[7], /COMPLETE/);
  assert.deepEqual(await page.locator('#performanceSnapshots dd').allTextContents(), snapshots);
  await switchLocale('zh-TW'); await page.locator('#performanceDetailClose').click();
  await page.locator('#performanceTicker').fill('T03'); await page.locator('#performanceFilter button').click(); await settle();
  await switchLocale('en'); assert.equal(await page.locator('#performanceTicker').inputValue(), 'T03'); assert.equal(await page.locator('[data-performance-horizon="1w"]').getAttribute('aria-pressed'), 'true');
  await switchLocale('zh-TW');
});
test('Evidence completed cache, raw unknown diagnostics and native details stay held', async () => {
  await page.route('**/api/tw/stocks', route => {
    calls.push('/api/tw/stocks'); const p = warmingFixture(); p.warnings = ['FUTURE_SOURCE_CODE', 'SOURCE_PARTIAL'];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(p) });
  });
  await open('evidence'); await page.waitForFunction(() => document.getElementById('evidenceView').getAttribute('aria-busy') === 'false');
  const before = await page.locator('#evidenceView').textContent();
  await page.locator('#evidenceView details').first().evaluate(n => n.open = true);
  await switchLocale('en'); assert.notEqual(await page.locator('#evidenceView').textContent(), before);
  assert.match(await page.locator('#evidenceView').textContent(), /FUTURE_SOURCE_CODE/); assert.equal(await page.locator('#evidenceView details').first().evaluate(n => n.open), true);
  await switchLocale('zh-TW'); assert.equal(await page.locator('#evidenceView').textContent(), before);
  const reads = calls.filter(p => p === '/api/tw/stocks').length;
  await page.locator('[data-page="settings"]').click(); await page.locator('[data-page="evidence"]').click(); await settle();
  assert.equal(calls.filter(p => p === '/api/tw/stocks').length, reads);
});
test('US filter/subpages and both source-separated dialogs preserve data and focus', async () => {
  await open('us'); await page.locator('#signalsTicker').fill('QA0'); await page.locator('#signalsFilter button[type="submit"]').click(); await settle();
  await page.locator('#signalsRows .signal-open').first().click(); const body = await page.locator('#signalDetailBody .signal-prose').allTextContents();
  await switchLocale('en'); assert.equal(await page.locator('#signalsTicker').inputValue(), 'QA0');
  assert.deepEqual(await page.locator('#signalDetailBody .signal-prose').allTextContents(), body);
  await switchLocale('zh-TW'); await page.locator('#signalDetailClose').click();
  await page.locator('[data-us-page="sec"]').click(); await settle(); await page.locator('#secRows .sec-open').first().click();
  const title = await page.locator('#secDetailTitle').textContent(); const raw = await page.locator('#secDetailBody dd').allTextContents();
  await switchLocale('en'); assert.equal(await page.locator('#secDetailTitle').textContent(), title);
  assert.match((await page.locator('#secDetailBody').textContent()), /sec:/);
  await switchLocale('zh-TW'); assert.deepEqual(await page.locator('#secDetailBody dd').allTextContents(), raw); await page.locator('#secDetailClose').click();
  await page.locator('[data-us-page="ticker"]').click(); await page.locator('#tickerInput').fill('COO'); await page.locator('#tickerFilter button[type="submit"]').click(); await settle();
  await switchLocale('en'); assert.equal(await page.locator('#tickerInput').inputValue(), 'COO'); assert.equal(await page.locator('#tickerPanel').isVisible(), true);
  await switchLocale('zh-TW');
});
test('TW report subpage/page/open Markdown remains held across language changes', async () => {
  await open('reports');
  for (const type of ['daily', 'weekly']) {
    await page.locator(`[data-reports-page="tw-${type}"]`).click(); await settle();
    await page.locator(`#tw${type}-Next`).click(); await settle(); const count = await page.locator(`#tw${type}-Page`).textContent();
    await switchLocale('en'); assert.equal(await page.locator(`#twReports-${type}`).isVisible(), true); await switchLocale('zh-TW'); assert.equal(await page.locator(`#tw${type}-Page`).textContent(), count);
    await page.locator(`#tw${type}-Rows .tw-report-open`).first().click(); await settle();
    const body = await page.locator('#twReportBody').textContent(); const title = await page.locator('#twReportTitle').textContent();
    await switchLocale('en'); assert.equal(await page.locator('#twReportBody').textContent(), body); assert.notEqual(await page.locator('#twReportTitle').textContent(), title);
    await switchLocale('zh-TW'); assert.equal(await page.locator('#twReportTitle').textContent(), title); await page.locator('#twReportClose').click();
  }
});
for (const summaryPending of [false, true]) test(`Performance replacement while summary pending=${summaryPending} preserves request semantics`, async () => {
  const held = []; let summaryReads = 0;
  await page.route('**/api/performance/**', async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname + url.search);
    if (url.pathname.endsWith('/summary')) { ++summaryReads; if (!summaryPending || summaryReads > 1) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(performanceFixture(url)) }); }
    if (!url.searchParams.has('ticker')) { held.push({ route, url }); return; }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(performanceFixture(url)) });
  });
  await open('performance');
  if (!summaryPending) await page.waitForFunction(() => document.getElementById('performanceGroups').children.length === 5);
  await switchLocale('en'); await page.locator('#performanceTicker').fill('T03'); await page.locator('#performanceFilter button[type="submit"]').click(); await settle();
  assert.equal(summaryReads, summaryPending ? 2 : 1);
  for (const { route, url } of held) await route.fulfill({ contentType: 'application/json', body: JSON.stringify(performanceFixture(url)) }).catch(() => {});
  await switchLocale('zh-TW'); assert.equal(await page.locator('#performanceTicker').inputValue(), 'T03');
});
test('pending source completion uses current language; ERROR and unknown/null notices switch without refresh', async () => {
  let held;
  await page.route('**/api/tw/stocks', route => { calls.push('/api/tw/stocks'); held = route; });
  await open('tw'); await switchLocale('en');
  await held.fulfill({ contentType: 'application/json', body: JSON.stringify(twFixture(null, 'ERROR')) }); await settle();
  const english = await page.locator('#twStatus').textContent(); assert.match(english, /ERROR/);
  await switchLocale('zh-TW'); assert.notEqual(await page.locator('#twStatus').textContent(), english); await switchLocale('en'); assert.equal(await page.locator('#twStatus').textContent(), english);
});
for (const width of [1280, 375, 320]) for (const locale of ['zh-TW', 'en']) test(`localized visual and accessibility ${locale} ${width}`, async () => {
  await page.setViewportSize({ width, height: 900 }); await open('overview'); await switchLocale(locale);
  const path = new URL('../.tools/i18n/visual/', import.meta.url); await mkdir(path, { recursive: true });
  for (const view of ['overview', 'automations', 'tw', 'reports', 'performance', 'evidence', 'projects', 'settings', 'us']) {
    await page.locator(`[data-page="${view}"]`).click(); await settle();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view}: no whole-page overflow`);
    const button = page.locator(`[data-page="${view}"]`); await button.focus(); assert.equal(await button.evaluate(n => n === document.activeElement), true);
    await page.screenshot({ path: fileURLToPath(new URL(`${locale}-${width}-${view}.png`, path)), fullPage: true });
    const detail = { tw: ['.tw-candidate-open', '#twCandidateDetail', '#twCandidateClose'], reports: ['.report-open', '#reportDetail', '#reportDetailClose'], performance: ['.performance-open', '#performanceDetail', '#performanceDetailClose'], us: ['#signalsRows .signal-open', '#signalDetail', '#signalDetailClose'] }[view];
    if (detail) {
      await page.locator(detail[0]).first().click(); await settle();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} dialog: no page overflow`);
      assert.equal(await page.locator(detail[1]).evaluate(n => n.getBoundingClientRect().width <= innerWidth), true, `${view} dialog fits viewport`);
      await page.screenshot({ path: fileURLToPath(new URL(`${locale}-${width}-${view}-dialog.png`, path)), fullPage: false });
      await page.locator(detail[2]).click();
    }
  }
});


test('Settings actual selector preserves unsaved fields and dependency focus without PUT; persistence reloads', async () => {
  const writes = []; page.on('request', r => { if (r.method() !== 'GET') writes.push(r.method()); });
  await open('settings'); await page.locator('#settingsJobs button').filter({hasText:'Loading'}).click();
  await page.locator('#settingDisplayName').fill('Overview {count} <b>RAW</b>');
  await page.locator('#settingDescription').fill('來源文字與未儲存說明'); await page.locator('#settingOrder').fill('17'); await page.locator('#settingHidden').check();
  await page.locator('#addDependency').click(); const input=page.locator('#settingDependencies input'); await input.fill('source-task');
  const snapshot=()=>page.locator('#settingsForm').evaluate(n=>[...n.querySelectorAll('input,textarea,select')].map(n=>[n.id,n.value,n.checked]));
  const held=await snapshot(); const before=calls.length;
  for(const locale of ['en','zh-TW']) { await input.focus(); await switchLocale(locale); assert.deepEqual(await snapshot(),held); assert.equal(await input.evaluate(n=>n===document.activeElement),true); }
  await page.locator('#languagePreference').selectOption('en'); await settle(); assert.equal(calls.length,before); assert.equal(await page.locator('html').getAttribute('lang'),'en'); assert.deepEqual(await snapshot(),held); assert.deepEqual(writes,[]);
  await page.reload(); await settle(); assert.equal(await page.locator('html').getAttribute('lang'),'en'); assert.equal(await page.locator('#languagePreference').inputValue(),'en');
});

test('Automations drawer receipt fields and History cell retain identity, open state and Escape focus', async () => {
  await open('automations'); await page.locator('.job-row').click(); const title=await page.locator('#drawerTitle').textContent(); const facts=await page.locator('#detailGrid strong').allTextContents();
  for(const locale of ['en','zh-TW']) { await page.locator('#closeDrawer').focus(); await switchLocale(locale); assert.equal(await page.locator('#drawer.open').count(),1); assert.equal(await page.locator('#drawerTitle').textContent(),title); assert.match(await page.locator('#drawer').textContent(),/fixture-execution/); assert.equal(await page.locator('#closeDrawer').evaluate(n=>n===document.activeElement),true); }
  assert.deepEqual(await page.locator('#detailGrid strong').allTextContents(),facts); await page.keyboard.press('Escape'); assert.equal(await page.locator('.job-row').evaluate(n=>n===document.activeElement),true);
  await page.locator('#historyTab').click(); await page.waitForFunction(()=>document.getElementById('historyView').getAttribute('aria-busy')==='false');
  const cell=page.locator('.day-cell.success').first(); await cell.click(); const aria=await cell.getAttribute('aria-label');
  await switchLocale('en'); assert.notEqual(await cell.getAttribute('aria-label'),aria); assert.equal(await page.locator('#drawer.open').count(),1);
  await switchLocale('zh-TW'); assert.equal(await cell.getAttribute('aria-label'),aria); await page.keyboard.press('Escape'); assert.equal(await cell.evaluate(n=>n===document.activeElement),true);
});

test('body-pending source completion uses latest locale and never creates another read', async () => {
  await page.addInitScript(()=>{const native=fetch.bind(window); let release; const gate=new Promise(r=>release=r); window.releaseI18nBody=release;
    window.fetch=async(...args)=>{const response=await native(...args); if(new URL(args[0],location.href).pathname!=='/api/tw/stocks')return response;
      return {ok:response.ok,json:async()=>{window.i18nBodyPending=true;await gate;return response.json();}};};});
  await open('tw'); await page.waitForFunction(()=>window.i18nBodyPending===true); await switchLocale('en'); await switchLocale('zh-TW'); await switchLocale('en');
  await page.evaluate(()=>window.releaseI18nBody()); await page.waitForFunction(()=>document.querySelectorAll('.tw-candidate').length===1);
  assert.match(await page.locator('#twStatus').textContent(),/Coherent/); assert.equal(calls.filter(x=>x==='/api/tw/stocks').length,1); await switchLocale('zh-TW');
});

test('large Markdown notice switches while complete source pre text stays byte-identical', async () => {
  await open('reports'); const source=Array.from({length:4001},(_,i)=>'來源 '+i+' Overview {count} <img onerror=evil()>').join('\r\n');
  await page.evaluate(async source=>{const {renderMarkdown}=await import('/ui/safe-markdown.mjs');const n=document.createElement('section');n.id='largeSourceTest';document.body.append(n);renderMarkdown(document,n,source);},source);
  const notice=await page.locator('#largeSourceTest p').textContent(); assert.equal(await page.locator('#largeSourceTest pre').textContent(),source);
  await switchLocale('en'); assert.notEqual(await page.locator('#largeSourceTest p').textContent(),notice); assert.equal(await page.locator('#largeSourceTest pre').textContent(),source);
  await switchLocale('zh-TW'); assert.equal(await page.locator('#largeSourceTest p').textContent(),notice); assert.equal(await page.locator('#largeSourceTest pre').textContent(),source); assert.equal(await page.locator('#largeSourceTest img').count(),0);
});

test('Evidence null and rejected identity remain private through both locales', async () => {
  await page.route('**/api/tw/stocks',route=>{calls.push('/api/tw/stocks');const p=warmingFixture();p.latestAttempt.runId='private-host-SECRET';p.warnings=['SOURCE_PARTIAL','FUTURE_SOURCE_CODE'];return route.fulfill({contentType:'application/json',body:JSON.stringify(p)});});
  await open('evidence'); await page.waitForFunction(()=>document.getElementById('evidenceView').getAttribute('aria-busy')==='false');
  for(const locale of ['en','zh-TW']) { await switchLocale(locale); const text=await page.locator('#evidenceView').textContent(); assert.doesNotMatch(text,/SECRET|private-host/);assert.match(text,/UNKNOWN/);assert.match(text,/FUTURE_SOURCE_CODE/);assert.match(await page.locator('#evidenceResponsibility').textContent(),/UNKNOWN/); }
});

test('Performance transport error status keeps alert role in both languages', async () => {
  await page.route('**/api/performance/**',route=>{calls.push(new URL(route.request().url()).pathname);return route.fulfill({status:503,body:'private SQL SECRET'});});
  await open('performance'); await page.waitForFunction(()=>document.getElementById('performanceListStatus').textContent.includes('ERROR'));
  for(const locale of ['en','zh-TW']) { await switchLocale(locale);for(const id of ['performanceSummaryStatus','performanceListStatus']) {assert.equal(await page.locator('#'+id).getAttribute('role'),'alert');assert.match(await page.locator('#'+id).textContent(),/ERROR/);}assert.doesNotMatch(await page.locator('#performanceView').textContent(),/private SQL|SECRET/); }
});

for (const failure of ['invalid','get','set']) test('browser preference fallback '+failure, async()=>{
  await page.addInitScript(failure=>{if(failure==='invalid')localStorage.setItem('local-dashboard.locale.v1','corrupt');else Object.defineProperty(Storage.prototype,failure==='get'?'getItem':'setItem',{value(){throw Error('denied');}});},failure);
  await open('settings'); assert.equal(await page.locator('html').getAttribute('lang'),'zh-TW');
  if(failure!=='invalid') {const before=calls.length;await page.locator('#languagePreference').selectOption('en');await settle();assert.equal(await page.locator('html').getAttribute('lang'),'zh-TW');assert.equal(calls.length,before);}
});
