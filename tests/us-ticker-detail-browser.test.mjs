import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { serveStaticAsset } from './static-assets.mjs';
import { signalsFixture } from './us-signals-fixture.mjs';
import { secFixture } from './us-sec-transactions-fixture.mjs';
import { tickerFixture } from './us-ticker-detail-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let server, browser, base, page, errors, requests;
before(async()=>{ server=createServer(serveStaticAsset);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true}); });
after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{page=await browser.newPage();errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());requests.push(u);
    const data=u.pathname==='/api/us/ticker-detail'?tickerFixture(u):u.pathname==='/api/us/signals'?signalsFixture(u):u.pathname==='/api/us/sec-transactions'?secFixture(u)
      :u.pathname==='/api/history'?{from:u.searchParams.get('from'),to:u.searchParams.get('to'),jobs:[]}
        :u.pathname==='/api/settings/job-metadata'?{version:1,revision:'0',overrides:{},warning:null}
          :{collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',collectedAt:new Date().toISOString(),jobs:[],errors:[],warnings:[],unmatchedIncludes:[]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});});
afterEach(async()=>{await page.close();assert.deepEqual(errors,[]);assert.equal(requests.some(u=>u.pathname.includes('performance-summary')),false);});
const ready=()=>page.waitForFunction(()=>document.getElementById('tickerStatus').textContent.startsWith('READY'));
async function openTicker(width=1280){await page.setViewportSize({width,height:900});await page.goto(`${base}/#us`);await page.locator('[data-us-page=ticker]').click();
  await page.locator('#tickerInput').fill(' qa0 ');await page.locator('#tickerFilter button[type=submit]').click();await ready();}
for(const width of [1280,375,320])test(`source-separated ticker semantics, safe details, keyboard and independent pagination at ${width}px`,async()=>{
  await openTicker(width);assert.equal(await page.locator('#tickerSignalsRows .signal-card').count(),50);assert.equal(await page.locator('#tickerSecRows .sec-card').count(),50);
  assert.equal(await page.locator('#tickerInput').inputValue(),'QA0');assert.match(await page.locator('#tickerPanel').innerText(),/相同 ticker 不代表/);
  assert.match(await page.locator('#tickerSignalsPanel').innerText(),/Imported AI report/);assert.doesNotMatch(await page.locator('#tickerSecPanel').innerText(),/Signal Score|Investment Score/);
  assert.match(await page.locator('#tickerSecPanel').innerText(),/non-P|derivative/);assert.match(await page.locator('#tickerPanel').innerText(),/Performance · DESIGNED/);
  assert.equal(await page.locator('#tickerPanel img').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  for(const [selector,dialog] of [['#tickerSignalsRows .signal-open','#tickerSignalDetail'],['#tickerSecRows .sec-open','#tickerSecDetail']]){
    const trigger=page.locator(selector).nth(2);await page.keyboard.press('Tab');await trigger.focus();assert.notEqual(await trigger.evaluate(n=>getComputedStyle(n).outlineStyle),'none');await page.keyboard.press('Space');
    assert.equal(await page.locator(dialog).evaluate(n=>n.open),true);assert.equal(await page.locator(dialog).evaluate(n=>n.scrollWidth<=n.clientWidth),true);
    const text=await page.locator(dialog).innerText();assert.match(text,/<script>evil\(\)<\/script>/);assert.match(text,/來源|Source/);
    if(dialog.includes('Sec'))assert.match(text,/AMENDMENT_REQUIRES_RECONCILIATION|Filing accepted time/);
    else assert.match(text,/Report date|Discovered at/);
    assert.equal(await page.locator(`${dialog} script`).count(),0);await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
  }
  await page.locator('#tickerSignalsNext').click();await page.waitForFunction(()=>document.querySelectorAll('#tickerSignalsRows .signal-card').length===1);
  assert.equal(await page.locator('#tickerSecRows .sec-card').count(),50);assert.match(await page.locator('#tickerSignalsPage').innerText(),/offset 50/);
  assert.match(await page.locator('#tickerSecPage').innerText(),/offset 0/);assert.match(await page.locator('#tickerSignalsPage').innerText(),/非總筆數/);
  await page.locator('#tickerSecNext').click();await page.waitForFunction(()=>document.querySelectorAll('#tickerSecRows .sec-card').length===1);
  assert.equal(await page.locator('#tickerSignalsRows .signal-card').count(),1);assert.equal(await page.locator('#tickerSecNext').isDisabled(),true);
  assert.equal(requests.filter(u=>u.pathname==='/api/us/ticker-detail').length,3);
});
test('View ticker carries only a ticker filter from both existing sources',async()=>{
  await page.goto(`${base}/#us`);await page.waitForFunction(()=>document.getElementById('signalsStatus').textContent==='READY');
  await page.locator('#signalsRows .ticker-link').first().click();await ready();assert.match(await page.locator('#tickerTitle').innerText(),/QA0/);
  let u=requests.findLast(u=>u.pathname==='/api/us/ticker-detail');assert.deepEqual([...u.searchParams.keys()].sort(),['secLimit','secOffset','signalsLimit','signalsOffset','ticker']);
  await page.locator('[data-us-page=sec]').click();await page.waitForFunction(()=>document.getElementById('secStatus').textContent==='READY');
  await page.locator('#secRows .ticker-link').nth(2).click();await ready();assert.match(await page.locator('#tickerTitle').innerText(),/QA2/);
});
test('source failure/malformed section keeps the other section; invalid input makes no request',async()=>{
  await openTicker();for(const state of ['EMPTY','UNAVAILABLE','ERROR','MALFORMED']){
    await page.route('**/api/us/ticker-detail?*',route=>{const p=tickerFixture(new URL(route.request().url()),'READY',state==='MALFORMED'?'READY':state);if(state==='MALFORMED')p.sections.secTransactions.items[0].isDirect='bad';return route.fulfill({contentType:'application/json',body:JSON.stringify(p)});});
    await page.locator('#tickerReload').click();await page.waitForFunction(()=>!document.getElementById('tickerStatus').textContent.startsWith('Loading'));
    assert.equal(await page.locator('#tickerSignalsRows .signal-card').count(),50);assert.equal(await page.locator('#tickerSecRows .sec-card').count(),0);
    assert.match(await page.locator('#tickerStatus').innerText(),state==='EMPTY'?/^READY/:/^PARTIAL/);
  }
  const count=requests.length;await page.locator('#tickerInput').fill(' ');await page.locator('#tickerFilter button[type=submit]').click();assert.equal(requests.length,count);
  assert.match(await page.locator('#tickerValidation').innerText(),/必填/);assert.equal(await page.locator('#tickerInput').evaluate(n=>n===document.activeElement),true);
  await page.route('**/api/us/ticker-detail?*',route=>route.fulfill({status:500,body:'F:\\private\\db stderr secret'}));await page.locator('#tickerReload').click();
  await page.waitForFunction(()=>document.getElementById('tickerStatus').textContent.startsWith('ERROR'));assert.doesNotMatch(await page.locator('#tickerPanel').innerText(),/private|stderr|secret/);
});
test('newer ticker wins and leaving subpage/main page cancels stale render and closes dialogs',async()=>{
  let release;const held=new Promise(r=>release=r);let first=true;
  await page.route('**/api/us/ticker-detail?*',async route=>{if(first){first=false;await held;}try{await route.fulfill({contentType:'application/json',body:JSON.stringify(tickerFixture(new URL(route.request().url())))});}catch{}});
  await page.goto(`${base}/#us`);await page.locator('[data-us-page=ticker]').click();await page.locator('#tickerInput').fill('QA0');await page.locator('#tickerFilter button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('tickerStatus').textContent.startsWith('Loading'));await page.locator('#tickerInput').fill('QA2');await page.locator('#tickerFilter button[type=submit]').click();await ready();release();
  assert.match(await page.locator('#tickerSignalsRows .signal-open').first().innerText(),/QA2/);
  await page.locator('#tickerSecRows .sec-open').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#tickerSecDetail').evaluate(n=>n.open),true);await page.keyboard.press('Escape');
  let finish;const pending=new Promise(r=>finish=r);await page.route('**/api/us/ticker-detail?*',async route=>{await pending;try{await route.fulfill({contentType:'application/json',body:JSON.stringify(tickerFixture(new URL(route.request().url())))});}catch{}});
  await page.locator('#tickerReload').click();await page.locator('[data-us-page=signals]').click();finish();assert.equal(await page.locator('#tickerSecDetail').evaluate(n=>n.open),false);
  assert.equal(await page.locator('#tickerPanel').getAttribute('aria-busy'),'false');await page.locator('[data-page=overview]').click();assert.equal(await page.locator('#tickerPanel').isVisible(),false);
});
