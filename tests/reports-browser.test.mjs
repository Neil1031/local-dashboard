import { englishPage } from './locale-browser.mjs';
import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {serveStaticAsset} from './static-assets.mjs';
import {reportsFixture,reportDetailFixture,reportBody} from './reports-fixture.mjs';
import {twReportsFixture,twDetailFixture} from './tw-reports-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
let browser,server,base,page,errors,requests;
before(async()=>{server=createServer(serveStaticAsset);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});});
after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{page=await englishPage(browser);errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());requests.push(url);const data=url.pathname==='/api/reports/tw'?twReportsFixture(url):url.pathname==='/api/reports/tw/detail'?twDetailFixture(url):url.pathname==='/api/reports/us-insider'?reportsFixture(url):url.pathname==='/api/reports/us-insider/detail'?reportDetailFixture(url):url.pathname==='/api/history'?{from:url.searchParams.get('from'),to:url.searchParams.get('to'),jobs:[]}:url.pathname==='/api/settings/job-metadata'?{version:1,revision:'0',overrides:{},warning:null}:{collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',collectedAt:new Date().toISOString(),jobs:[],errors:[],warnings:[],unmatchedIncludes:[]};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});});
afterEach(async()=>{await page.close();assert.deepEqual(errors,[]);});
const ready=()=>page.waitForFunction(()=>document.getElementById('reportsStatus').textContent.includes("READY"));
const detailReady=()=>page.waitForFunction(()=>document.getElementById('reportDetailStatus').textContent.includes("READY"));
const open=async(width=1280)=>{await page.setViewportSize({width,height:900});await page.goto(`${base}/#reports`);await ready();};
for(const width of [1280,375,320])test(`All safe Markdown, actual Tab/Space/Escape focus and independent pages at ${width}`,async()=>{
  await open(width);assert.equal(await page.locator('.report-card').count(),20);assert.equal(await page.locator('#reportsConnectedTitle').innerText(),'US Insider');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  // Reach the real trigger through keyboard traversal; never programmatic focus().
  let found=false;for(let n=0;n<100;n++){await page.keyboard.press('Tab');found=await page.evaluate(()=>document.activeElement?.classList.contains('report-open'));if(found)break;}assert.ok(found);
  assert.equal(await page.locator('.report-open').first().evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),true);
  await page.keyboard.press('Space');await detailReady();assert.equal(await page.locator('#reportDetail').evaluate(n=>n.open),true);
  assert.equal(await page.locator('#reportDetailClose').evaluate(n=>n===document.activeElement),true);
  assert.match(await page.locator('#reportBody').innerText(),/<script>globalThis.reportPwned=true<\/script>/);assert.match(await page.locator('#reportBody').innerText(),/C:\\source-authored\\literal.txt/);
  assert.equal(await page.locator('#reportBody script,#reportBody img,#reportBody a').count(),0);assert.equal(await page.evaluate(()=>globalThis.reportPwned),undefined);
  for(const selector of ['h1','ul','ol','pre code','p code'])assert.ok(await page.locator(`#reportBody ${selector}`).count()>0);
  assert.match(await page.locator('#reportRevisionState').innerText(),/MATCHED.*ID 1/);assert.equal(await page.locator('#reportRevisions li').count(),20);assert.doesNotMatch(await page.locator('#reportRevisions').innerText(),/isCurrent/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await page.locator('#reportRevisionNext').click();await detailReady();assert.equal(await page.locator('#reportRevisions li').count(),1);assert.match(await page.locator('#reportRevisions').innerText(),/isCurrent/);
  assert.equal(await page.locator('#reportsPageCount').textContent().then(t=>t.includes('offset 0')),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.report-open').first().evaluate(n=>n===document.activeElement),true);
  await page.locator('#reportsNext').click();await ready();assert.equal(await page.locator('.report-card').count(),1);assert.match(await page.locator('#reportsPageCount').innerText(),/offset 20/);
});
test('exact filter, invalid date no call, US and TW sources truthful',async()=>{
  await open();await page.locator('#reportsDate').fill('2026-02-29');let before=requests.length;await page.locator('#reportsFilter button[type=submit]').click();assert.match(await page.locator('#reportsValidation').innerText(),/calendar date/);assert.equal(requests.length,before);
  await page.locator('#reportsDate').fill('2026-09-30');await page.locator('#reportsFilter button[type=submit]').click();await ready();assert.equal(await page.locator('.report-card').count(),1);
  await page.locator('[data-reports-page=us]').click();await ready();assert.equal(await page.locator('#reportsConnectedTitle').innerText(),'US Insider');
  before=requests.filter(u=>u.pathname.startsWith('/api/reports/us-insider')).length;for(const key of ['tw-daily','tw-weekly']){await page.locator(`[data-reports-page=${key}]`).click();await page.waitForFunction(type=>['READY','PARTIAL'].some(s=>document.getElementById(`tw${type}-Status`).textContent.startsWith(s)),key.slice(3));assert.equal(await page.locator(`#twReports-${key.slice(3)}`).isVisible(),true);assert.equal(await page.locator('#reportsConnected').isVisible(),false);}assert.equal(requests.filter(u=>u.pathname.startsWith('/api/reports/us-insider')).length,before);
});
test('list and detail EMPTY/UNAVAILABLE/ERROR clear stale body and private errors',async()=>{
  await open();for(const state of ['EMPTY','UNAVAILABLE','ERROR']){await page.route('**/api/reports/us-insider?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(reportsFixture(new URL(r.request().url()),state))}));await page.locator('#reportsReload').click();await page.waitForFunction(s=>document.getElementById('reportsStatus').textContent.startsWith(s),state);assert.equal(await page.locator('.report-card').count(),0);}await page.unroute('**/api/reports/us-insider?*');await page.locator('#reportsReload').click();await ready();await page.locator('.report-open').first().click();await detailReady();
  for(const state of ['EMPTY','UNAVAILABLE','ERROR']){await page.route('**/api/reports/us-insider/detail?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(reportDetailFixture(new URL(r.request().url()),state))}));await page.locator('#reportDetailReload').click();await page.waitForFunction(s=>document.getElementById('reportDetailStatus').textContent.startsWith(s),state);assert.equal(await page.locator('#reportBody').innerText(),'');assert.equal(await page.locator('#reportRevisions li').count(),0);}
  await page.route('**/api/reports/us-insider/detail?*',r=>r.fulfill({status:503,body:'private stderr C:\\secret\\db'}));await page.locator('#reportDetailReload').click();await page.waitForFunction(()=>document.getElementById('reportDetailStatus').textContent.includes('ERROR'));assert.doesNotMatch(await page.locator('body').innerText(),/private stderr|secret/);
});
test('detail MISSING and full large plain-text fallback',async()=>{
  await page.route('**/api/reports/us-insider/detail?*',r=>{const d=reportDetailFixture(new URL(r.request().url()),'READY',true);d.item.rawMarkdown=reportBody+'\nline 🚀'.repeat(4100);return r.fulfill({contentType:'application/json',body:JSON.stringify(d)});});await open();await page.locator('.report-open').first().click();await detailReady();assert.match(await page.locator('#reportRevisionState').innerText(),/MISSING.*ID —/);assert.equal(await page.locator('#reportBody pre').textContent(),reportBody+'\nline 🚀'.repeat(4100));assert.match(await page.locator('#reportBody').innerText(),/not truncated/);
});
test('list newer request wins and loading clears stale rows',async()=>{
  await open();let release,n=0;const held=new Promise(r=>release=r);await page.route('**/api/reports/us-insider?*',async r=>{const first=++n===1;if(first)await held;const d=reportsFixture(new URL(r.request().url()));d.items[0].parseWarnings=[first?'OLD RESPONSE':'FRESH RESPONSE'];await r.fulfill({contentType:'application/json',body:JSON.stringify(d)}).catch(()=>{});});
  await page.locator('#reportsReload').click();await page.waitForFunction(()=>document.getElementById('reportsStatus').textContent.includes('Loading'));assert.equal(await page.locator('.report-card').count(),0);await page.locator('#reportsReload').click();await ready();release();await page.waitForFunction(()=>document.getElementById('reportsRows').textContent.includes('FRESH RESPONSE'));assert.doesNotMatch(await page.locator('#reportsRows').innerText(),/OLD RESPONSE/);
});
test('detail newer request wins, loading clears body, leaving Reports cancels rendering',async()=>{
  await open();await page.locator('.report-open').first().click();await detailReady();let release,n=0;const held=new Promise(r=>release=r);await page.route('**/api/reports/us-insider/detail?*',async r=>{const first=++n===1;if(first)await held;const d=reportDetailFixture(new URL(r.request().url()));d.item.rawMarkdown=first?'OLD BODY':'FRESH BODY';await r.fulfill({contentType:'application/json',body:JSON.stringify(d)}).catch(()=>{});});
  await page.locator('#reportDetailReload').click();await page.waitForFunction(()=>document.getElementById('reportDetailStatus').textContent.includes('Loading'));assert.equal(await page.locator('#reportBody').innerText(),'');await page.locator('#reportDetailReload').click();await detailReady();release();assert.equal(await page.locator('#reportBody').innerText(),'FRESH BODY');
  await page.keyboard.press('Escape');await page.unroute('**/api/reports/us-insider/detail?*');let leave;const pending=new Promise(r=>leave=r);await page.route('**/api/reports/us-insider/detail?*',async r=>{await pending;await r.fulfill({contentType:'application/json',body:JSON.stringify(reportDetailFixture(new URL(r.request().url())))}).catch(()=>{});});await page.locator('.report-open').first().click();await page.waitForFunction(()=>document.getElementById('reportDetailStatus').textContent.includes('Loading'));await page.evaluate(()=>location.hash='overview');await page.waitForFunction(()=>!document.getElementById('reportDetail').open);leave();assert.equal(await page.locator('#reportBody').textContent(),'');
});
