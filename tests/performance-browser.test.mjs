import { englishPage } from './locale-browser.mjs';
import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {serveStaticAsset} from './static-assets.mjs';
import {performanceFixture} from './performance-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
let server,browser,base,page,errors,requests;
before(async()=>{server=createServer(serveStaticAsset);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});await mkdir('.tools/performance-screenshots',{recursive:true});});
after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{page=await englishPage(browser);errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>{
 const url=new URL(route.request().url());requests.push(url);const data=url.pathname.startsWith('/api/performance/')?performanceFixture(url):url.pathname==='/api/history'?{from:url.searchParams.get('from'),to:url.searchParams.get('to'),jobs:[]}:url.pathname==='/api/settings/job-metadata'?{version:1,revision:'0',overrides:{},warning:null}:{collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',collectedAt:new Date().toISOString(),jobs:[],errors:[],warnings:[],unmatchedIncludes:[]};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});});
afterEach(async()=>{await page.close();assert.deepEqual(errors,[]);});
const ready=()=>page.waitForFunction(()=>document.getElementById('performanceSummaryStatus').textContent.includes("READY")&&document.getElementById('performanceListStatus').textContent.includes("READY"));
const detailReady=()=>page.waitForFunction(()=>document.getElementById('performanceDetailStatus').textContent.includes("READY"));
const open=async(width=1280)=>{await page.setViewportSize({width,height:900});await page.goto(`${base}/#performance`);await ready();};
for(const width of [1280,375,320])test(`Performance complete surface, safe Unicode, native keyboard/focus at ${width}`,async()=>{
 await open(width);assert.equal(await page.locator('[data-performance-horizon]').count(),5);assert.equal(await page.locator('.performance-bucket').count(),5);assert.equal(await page.locator('.performance-row').count(),20);
 assert.match(await page.locator('.performance-bucket').nth(0).innerText(),/Average return\s+—/);assert.match(await page.locator('.performance-bucket').nth(1).innerText(),/Average return\s+0%/);assert.match(await page.locator('#performanceCounts').innerText(),/COMPLETE 6.*PARTIAL 5.*PENDING 5.*NOT_COMPUTED 5/);
 assert.match(await page.locator('.performance-row').first().innerText(),/Snapshot saved \/ return unavailable.*—/);assert.match(await page.locator('.performance-row').nth(3).innerText(),/NOT_COMPUTED[\s\S]*0%/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
 await page.locator('#performanceView details summary').click();assert.match(await page.locator('#performanceView details').innerText(),/split_adjusted_ex_dividends[\s\S]*current imported[\s\S]*correlated observations/);
 await page.locator('#performanceFilter button').focus();let found=false;for(let i=0;i<25;i++){await page.keyboard.press('Tab');found=await page.evaluate(()=>document.activeElement?.classList.contains('performance-open'));if(found)break;}assert.ok(found);
 assert.equal(await page.locator('.performance-open').first().evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),true);
 await page.keyboard.press('Space');await detailReady();assert.equal(await page.locator('#performanceDetailClose').evaluate(n=>n===document.activeElement),true);
 assert.match(await page.locator('#performanceFacts').innerText(),/公司 🚀 <script>/);assert.equal(await page.locator('#performanceDetail script,#performanceDetail img,#performanceDetail a').count(),0);assert.equal(await page.evaluate(()=>globalThis.performancePwned),undefined);
 assert.equal(await page.locator('.performance-snapshot').count(),7);assert.match(await page.locator('#performanceSnapshots').innerText(),/Return from tradable[\s\S]*Return from discovery[\s\S]*yahoo[\s\S]*split_adjusted_ex_dividends/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await page.screenshot({path:`.tools/performance-screenshots/detail-${width}.png`,fullPage:true});
 await page.keyboard.press('Escape');assert.equal(await page.locator('.performance-open').first().evaluate(n=>n===document.activeElement),true);await page.screenshot({path:`.tools/performance-screenshots/summary-${width}.png`,fullPage:true});
});
test('five horizons, bounded pages, exact case filter, summary no ticker filter',async()=>{
 await open();for(const h of ['1d','1w','1m','3m','6m']){await page.locator(`[data-performance-horizon="${h}"]`).click();await ready();assert.equal(await page.locator(`[data-performance-horizon="${h}"]`).getAttribute('aria-pressed'),'true');}
 await page.locator('#performanceNext').click();await page.waitForFunction(()=>document.querySelectorAll('.performance-row').length===1);assert.match(await page.locator('#performancePageCount').innerText(),/offset 20/);assert.equal(await page.locator('#performanceNext').isDisabled(),true);
 await page.locator('#performanceTicker').fill('COO');await page.locator('#performanceFilter button').click();await page.waitForFunction(()=>document.querySelectorAll('.performance-row').length===2);
 assert.equal(requests.filter(u=>u.pathname.endsWith('/summary')).some(u=>u.searchParams.has('ticker')),false);
 await page.locator('#performanceTicker').fill('coo');await page.locator('#performanceFilter button').click();await page.waitForFunction(()=>document.getElementById('performanceListStatus').textContent.includes("EMPTY"));assert.equal(await page.locator('.performance-bucket').count(),5);
 const n=requests.length;await page.locator('#performanceTicker').fill(' COO');await page.locator('#performanceFilter button').click();assert.match(await page.locator('#performanceValidation').innerText(),/exact ticker/);assert.equal(requests.length,n);
});
test('detail PARTIAL missing date, PENDING and NOT_COMPUTED with snapshots',async()=>{
 await open();for(const [i,status] of [[1,'PARTIAL'],[2,'PENDING'],[3,'NOT_COMPUTED']]){await page.locator('.performance-open').nth(i).click();await detailReady();assert.match(await page.locator('#performanceFacts').innerText(),new RegExp(status));if(i===1)assert.match(await page.locator('#performanceFacts').innerText(),/2026-09-28/);assert.equal(await page.locator('.performance-snapshot').count(),7);await page.keyboard.press('Escape');}
});
test('summary EMPTY preserves groups and failure clears stale state with safe errors',async()=>{
 await open();for(const state of ['EMPTY','UNAVAILABLE','ERROR']){await page.route('**/api/performance/summary?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(performanceFixture(new URL(r.request().url()),state))}));await page.locator('#performanceRefresh').click();await page.waitForFunction(s=>document.getElementById('performanceSummaryStatus').textContent.includes(s),state);assert.equal(await page.locator('.performance-bucket').count(),state==='EMPTY'?5:0);}
 await page.route('**/api/performance/signals?*',r=>r.fulfill({status:503,body:'private stderr C:\\secret\\db'}));await page.locator('#performanceRefresh').click();await page.waitForFunction(()=>document.getElementById('performanceListStatus').textContent.includes('ERROR'));assert.equal(await page.locator('.performance-row').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/private stderr|secret/);
});
test('failed detail clears facts and snapshots',async()=>{
 await page.route('**/api/performance/detail?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(performanceFixture(new URL(r.request().url()),'UNAVAILABLE'))}));await open();await page.locator('.performance-open').first().click();await page.waitForFunction(()=>document.getElementById('performanceDetailStatus').textContent.includes("UNAVAILABLE"));assert.equal(await page.locator('#performanceFacts').textContent(),'');assert.equal(await page.locator('.performance-snapshot').count(),0);
});
test('refresh dedup, no automatic polling or reread on return',async()=>{
 await open();let release;const held=new Promise(r=>release=r);let n=0;await page.route('**/api/performance/summary?*',async r=>{n++;await held;await r.fulfill({contentType:'application/json',body:JSON.stringify(performanceFixture(new URL(r.request().url())))}).catch(()=>{});});
 await page.locator('#performanceRefresh').click();await page.waitForFunction(()=>document.getElementById('performanceSummaryStatus').textContent==='Loading…');await page.locator('#performanceRefresh').click();assert.equal(n,1);assert.equal(await page.locator('.performance-bucket').count(),0);release();await ready();await page.waitForTimeout(250);assert.equal(n,1);
 await page.locator('#settingsPage').click();await page.locator('#performancePage').click();await ready();assert.equal(n,1);
});
test('held summary then ticker Apply completes unfiltered summary and newest list',async()=>{
 let release;const held=new Promise(r=>release=r);let n=0;await page.route('**/api/performance/summary?*',async r=>{const first=++n===1;if(first)await held;const p=performanceFixture(new URL(r.request().url()));if(first)p.groups[0].bucket='OLD_INVALID';await r.fulfill({contentType:'application/json',body:JSON.stringify(p)}).catch(()=>{});});
 await page.goto(`${base}/#performance`);await page.waitForFunction(()=>document.querySelectorAll('.performance-row').length===20);await page.locator('#performanceTicker').fill('COO');await page.locator('#performanceFilter button').click();await ready();release();await page.waitForTimeout(100);
 assert.equal(await page.locator('.performance-row').count(),2);assert.equal(await page.locator('.performance-bucket').count(),5);assert.doesNotMatch(await page.locator('#performanceGroups').innerText(),/OLD_INVALID/);
});
test('horizon replacement and navigation reject held old list/detail responses',async()=>{
 await open();let release;const held=new Promise(r=>release=r);let n=0;await page.route('**/api/performance/signals?*',async r=>{const first=++n===1;if(first)await held;const p=performanceFixture(new URL(r.request().url()));p.items[0].company=first?'OLD RESPONSE':'FRESH RESPONSE';await r.fulfill({contentType:'application/json',body:JSON.stringify(p)}).catch(()=>{});});
 await page.locator('#performanceRefresh').click();await page.waitForFunction(()=>document.getElementById('performanceListStatus').textContent==='Loading…');assert.equal(await page.locator('.performance-row').count(),0);await page.locator('[data-performance-horizon="1d"]').click();await ready();release();assert.match(await page.locator('#performanceRows').innerText(),/FRESH RESPONSE/);assert.doesNotMatch(await page.locator('#performanceRows').innerText(),/OLD RESPONSE/);
 let detailRelease;const detailHeld=new Promise(r=>detailRelease=r);await page.route('**/api/performance/detail?*',async r=>{await detailHeld;await r.fulfill({contentType:'application/json',body:JSON.stringify(performanceFixture(new URL(r.request().url())))}).catch(()=>{});});await page.locator('.performance-open').first().click();await page.waitForFunction(()=>document.getElementById('performanceDetailStatus').textContent==='Loading…');await page.evaluate(()=>location.hash='settings');await page.waitForFunction(()=>!document.getElementById('performanceDetail').open);detailRelease();assert.equal(await page.locator('#performanceDetail').evaluate(n=>n.open),false);assert.equal(await page.locator('#performanceFacts').textContent(),'');
});
