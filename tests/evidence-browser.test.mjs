import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { serveStaticAsset } from './static-assets.mjs';
import { twFixture, warmingFixture } from './tw-stocks-fixture.mjs';
import { twReportsFixture } from './tw-reports-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server, base, page, errors, requests;
const report = (type,state) => twReportsFixture(new URL(`http://fixture.invalid/api/reports/tw?type=${type}&limit=1&offset=0`),state);
const ready = () => page.waitForFunction(() => document.getElementById('evidenceView').getAttribute('aria-busy') === 'false');
const open = async (width=1280) => { await page.setViewportSize({width,height:900});await page.goto(base+'/#evidence');await ready(); };
const evidenceCalls = () => requests.filter(u => u.pathname==='/api/tw/stocks'||u.pathname==='/api/reports/tw');
const sleepTurn = async () => { await page.evaluate(() => new Promise(r => setTimeout(r,50))); };

before(async()=>{
  server=createServer(serveStaticAsset);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
});
after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
beforeEach(async()=>{
  page=await browser.newPage();errors=[];requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{
    const u=new URL(r.request().url());requests.push(u);
    const p=u.pathname==='/api/tw/stocks'?warmingFixture():u.pathname==='/api/reports/tw'?twReportsFixture(u)
      :u.pathname==='/api/reports'?{contractVersion:1,source:'insider-reports',dataState:'EMPTY',observedAt:'2026-10-03T10:00:00Z',reports:[],page:{limit:20,offset:0,hasMore:false,nextOffset:null,total:null},warnings:[]}
      :u.pathname==='/api/history'?{from:u.searchParams.get('from'),to:u.searchParams.get('to'),jobs:[]}
      :u.pathname==='/api/runner/executions'?{status:'NOT_CONFIGURED',jobs:[],warnings:[]}
      :u.pathname==='/api/settings/job-metadata'?{version:1,revision:'0',overrides:{},warning:null}
      :{collectionStatus:'NOT_CONFIGURED',collectedAt:'2026-10-03T10:00:00Z',jobs:[],errors:[],warnings:[],unmatchedIncludes:[]};
    return r.fulfill({contentType:'application/json',body:JSON.stringify(p)});
  });
});
afterEach(async()=>{await page.close();assert.deepEqual(errors,[]);});

for(const width of [1280,375,320])test(`Taiwan evidence cards/IDs/native details/keyboard/navigation/no overflow ${width}`,async()=>{
  await page.route('**/api/tw/stocks',r=>{
    requests.push(new URL(r.request().url()));const p=warmingFixture();
    p.observation.readiness.warmingSymbols=1082;p.observation.readiness.skippedCounts.INSUFFICIENT_HISTORY=1082;
    p.observation.mappingDiagnostics.unmappedSymbols=['9999'];p.warnings=['JOURNAL_MISSING','C:\\Users\\SECRET\\db.sqlite','stderr SECRET','<img src=x onerror=globalThis.evidencePwned=true>'];
    p.latestAttempt.runId='private-host-SECRET';p.databasePath='C:\\SECRET\\db';p.host='SECRET';p.pid=999999;p.rawConfig={password:'SECRET'};
    return r.fulfill({contentType:'application/json',body:JSON.stringify(p)});
  });
  await open(width);
  assert.equal(await page.locator('#evidenceSources > article').count(),3);
  assert.match(await page.locator('#evidenceReadiness').innerText(),/1082[\s\S]*Saved candidates[\s\S]*0[\s\S]*INSUFFICIENT_HISTORY: 1082[\s\S]*WARMING_UP[\s\S]*0 候選不代表沒有異常/);
  assert.match(await page.locator('#evidenceResponsibility').innerText(),/Pending revalidation total[\s\S]*UNKNOWN[\s\S]*null／UNKNOWN 不是 0/);
  assert.match(await page.locator('#evidenceWeekly').innerText(),/FAILED[\s\S]*不會抹除可用 Daily/);
  assert.match(await page.locator('#evidenceDaily').innerText(),/Latest attempt[\s\S]*來源身分未公開[\s\S]*Latest finalized/);
  assert.match(await page.locator('#evidenceReport-weekly').innerText(),/READY[\s\S]*FAILED/);
  assert.equal(await page.locator('#evidenceView img,#evidenceView script,#evidenceView dialog').count(),0);
  assert.doesNotMatch(await page.locator('#evidenceView').innerText(),/SECRET|private-host|databasePath|999999|stderr/);
  assert.equal(await page.evaluate(()=>globalThis.evidencePwned),undefined);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  const detail=page.locator('#evidenceReadiness details').first(),summary=detail.locator('summary');
  await summary.focus();await page.keyboard.press('Space');assert.equal(await detail.evaluate(n=>n.open),true);
  await page.keyboard.press('Enter');assert.equal(await detail.evaluate(n=>n.open),false);
  await page.locator('#evidenceReload').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.evidence-links a').first().evaluate(n=>n===document.activeElement),true);
  await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,'#tw');await page.locator('#evidencePage').click();await ready();
  const count=evidenceCalls().length;await sleepTurn();assert.equal(evidenceCalls().length,count,'completed return performs no hidden refresh');
  const directory=new URL('../.tools/evidence/visual/',import.meta.url);await mkdir(directory,{recursive:true});
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(`synthetic-${width}.png`,directory)),fullPage:true});
  await page.locator('#evidenceReadiness').scrollIntoViewIfNeeded();await page.screenshot({path:fileURLToPath(new URL(`synthetic-readiness-${width}.png`,directory))});
});

test('valid scope/Weekly/responsibility survive observation=null; latest attempt and finalized stay separate',async()=>{
  const p=twFixture(null,'PARTIAL');p.observation=null;p.latestFinalized=null;
  await page.route('**/api/tw/stocks',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(p)}));await open();
  assert.match(await page.locator('#evidenceDaily').innerText(),/Scope state[\s\S]*AVAILABLE[\s\S]*2026-09-21[\s\S]*Latest finalized[\s\S]*UNKNOWN/);
  assert.match(await page.locator('#evidenceWeekly').innerText(),/FAILED/);assert.match(await page.locator('#evidenceResponsibility').innerText(),/Responsibility state/);
  await page.route('**/api/tw/stocks',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(warmingFixture())}));await page.locator('#evidenceReload').click();await ready();
  assert.match(await page.locator('#evidenceDaily').innerText(),new RegExp('Latest attempt[\\s\\S]*'+'2'.repeat(32)+'[\\s\\S]*Latest finalized[\\s\\S]*'+'1'.repeat(32)));
});

for(const [stocks,daily,weekly]of [['PARTIAL','READY','ERROR'],['UNAVAILABLE','READY','READY'],['COHERENT','PARTIAL','PARTIAL']])test(`browser independent states ${stocks}/${daily}/${weekly}`,async()=>{
  await page.route('**/api/tw/stocks',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(twFixture(null,stocks))}));
  await page.route('**/api/reports/tw?*',r=>{const u=new URL(r.request().url());return r.fulfill({contentType:'application/json',body:JSON.stringify(report(u.searchParams.get('type'),u.searchParams.get('type')==='daily'?daily:weekly))});});
  await open();for(const [id,state]of [['stocks',stocks],['daily',daily],['weekly',weekly]])assert.match(await page.locator('#evidenceSource-'+id+' .evidence-state').innerText(),new RegExp('^'+state));
  assert.doesNotMatch(await page.locator('#evidenceView').innerText(),/OVERALL HEALTH|SYSTEM GOOD|TRUST SCORE|READY FOR INVESTMENT/);
});
test('LIST empty/unavailable/HTTP failure/null candidate/item warnings/times and privacy remain independent',async()=>{
  await page.route('**/api/reports/tw?*',r=>{
    const u=new URL(r.request().url()),p=report(u.searchParams.get('type'),'PARTIAL');
    p.warnings=['SOURCE_PARTIAL'];p.items[0].warnings=['ITEM_WARNING'];if(p.reportType==='DAILY')p.items[0].candidateCount=null;
    p.databasePath='C:\\SECRET';return r.fulfill({contentType:'application/json',body:JSON.stringify(p)});
  });await open();assert.match(await page.locator('#evidenceReport-daily').innerText(),/Candidate count[\s\S]*UNKNOWN/);
  for(const type of ['daily','weekly']){const text=await page.locator('#evidenceReport-'+type).innerText();assert.match(text,/2026-10-03T10:00:00Z[\s\S]*2026-10-03T09:59:59Z/);assert.match(text,/SOURCE_PARTIAL[\s\S]*item warnings[\s\S]*ITEM_WARNING/);assert.doesNotMatch(text,/SECRET/);}
  for(const state of ['EMPTY','UNAVAILABLE','ERROR']){
    await page.route('**/api/reports/tw?*',r=>{const u=new URL(r.request().url());return r.fulfill({contentType:'application/json',body:JSON.stringify(report(u.searchParams.get('type'),state))});});
    await page.locator('#evidenceReload').click();await ready();assert.match(await page.locator('#evidenceReport-daily').innerText(),new RegExp(state));assert.doesNotMatch(await page.locator('#evidenceReport-daily').innerText(),/tw-daily:/);
  }
  await page.route('**/api/tw/stocks',r=>r.fulfill({status:503,body:'private stderr SECRET'}));await page.locator('#evidenceReload').click();await ready();
  assert.match(await page.locator('#evidenceSource-stocks').innerText(),/ERROR/);assert.match(await page.locator('#evidenceSource-weekly').innerText(),/ERROR/);assert.doesNotMatch(await page.locator('#evidenceView').innerText(),/SECRET/);
});

async function ignoredAbort(){await page.addInitScript(()=>{const native=window.fetch.bind(window);window.evidenceFetchTrace=[];window.fetch=(url,options)=>{window.evidenceFetchTrace.push({url,cache:options?.cache});return native(url,{...options,signal:undefined});};});}
test('Wave1 held through refresh: no report before settle, newest response wins and exact no-store queries',async()=>{
  await ignoredAbort();let release;const held=new Promise(r=>release=r);let number=0,flight=0,max=0;const log=[];
  await page.route('**/api/tw/stocks',async r=>{
    ++flight;max=Math.max(max,flight);const n=++number;log.push('stocks'+n);if(n===1)await held;
    const p=warmingFixture();p.warnings=[n===1?'OLD_RESPONSE':'NEW_RESPONSE'];await r.fulfill({contentType:'application/json',body:JSON.stringify(p)});--flight;
  });
  await page.route('**/api/reports/tw?*',async r=>{++flight;max=Math.max(max,flight);const u=new URL(r.request().url());log.push(u.searchParams.get('type'));await r.fulfill({contentType:'application/json',body:JSON.stringify(twReportsFixture(u))});--flight;});
  await page.goto(base+'/#evidence');await page.waitForFunction(()=>document.getElementById('evidenceView').getAttribute('aria-busy')==='true');await page.locator('#evidenceReload').click();await sleepTurn();assert.deepEqual(log,['stocks1']);
  release();await ready();assert.equal(number,2);assert.deepEqual(log.slice(0,2),['stocks1','stocks2']);assert.ok(max<=2);
  assert.match(await page.locator('#evidenceSource-stocks').innerText(),/NEW_RESPONSE/);assert.doesNotMatch(await page.locator('#evidenceView').innerText(),/OLD_RESPONSE/);
  await page.evaluate(()=>{window.evidenceFetchTrace=[];});
  await page.locator('#evidenceReload').click();await ready();const trace=await page.evaluate(()=>window.evidenceFetchTrace.filter(x=>x.url.startsWith('/api/tw/stocks')||x.url.startsWith('/api/reports/tw')));
  assert.deepEqual(trace,[{url:'/api/tw/stocks',cache:'no-store'},{url:'/api/reports/tw?type=daily&limit=1&offset=0',cache:'no-store'},{url:'/api/reports/tw?type=weekly&limit=1&offset=0',cache:'no-store'}]);
});
test('Wave2 held through refresh waits both old requests; never overlaps three',async()=>{
  await ignoredAbort();const releases={};let stockCalls=0,reportCalls=0,flight=0,max=0;
  await page.route('**/api/tw/stocks',async r=>{stockCalls++;++flight;max=Math.max(max,flight);await r.fulfill({contentType:'application/json',body:JSON.stringify(warmingFixture())});--flight;});
  await page.route('**/api/reports/tw?*',async r=>{
    ++reportCalls;++flight;max=Math.max(max,flight);const u=new URL(r.request().url()),type=u.searchParams.get('type');
    if(reportCalls<=2)await new Promise(resolve=>releases[type]=resolve);
    await r.fulfill({contentType:'application/json',body:JSON.stringify(twReportsFixture(u))});--flight;
  });await page.goto(base+'/#evidence');await page.waitForFunction(()=>document.getElementById('evidenceDaily').textContent.includes('Latest finalized'));
  for(let i=0;i<200&&(!releases.daily||!releases.weekly);i++)await sleepTurn();assert.ok(releases.daily&&releases.weekly);await page.locator('#evidenceReload').click();assert.equal(await page.locator('#evidenceReload').isEnabled(),true);
  releases.daily();await sleepTurn();assert.equal(stockCalls,1);releases.weekly();await ready();assert.equal(stockCalls,2);assert.equal(reportCalls,4);assert.ok(max<=2);
});
test('leaving pending view prevents late cache/render; Evidence→Stocks/Reports→back uses completed cache only',async()=>{
  await ignoredAbort();let release;const held=new Promise(r=>release=r);let stock=0;
  await page.route('**/api/tw/stocks',async r=>{if(++stock===1)await held;await r.fulfill({contentType:'application/json',body:JSON.stringify(warmingFixture())});});
  await page.goto(base+'/#evidence');await page.locator('#overviewPage').click();release();await sleepTurn();assert.equal(await page.locator('#evidenceDaily').innerText(),'等待 Stocks 證據。');
  await page.locator('#evidencePage').click();await ready();
  await page.locator('.evidence-links a[href="#tw"]').click();await page.locator('#evidencePage').click();await ready();
  await page.locator('.evidence-links a[href="#reports"]').click();await page.locator('#evidencePage').click();await ready();
  const n=stock;await sleepTurn();assert.equal(stock,n);assert.match(await page.locator('#evidenceDaily').innerText(),/Latest finalized/);
});

test('saved test evidence replay retains original identities and timestamps; never accesses production',async()=>{
  let captures={stocks:warmingFixture(),daily:report('daily'),weekly:report('weekly')};
  const manifestPath=process.env.EVIDENCE_REPLAY_MANIFEST;
  if(manifestPath){const manifest=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(manifest.kind,'SAVED_TEST_EVIDENCE');captures=Object.fromEntries(await Promise.all(Object.entries(manifest.captures).map(async([k,v])=>[k,JSON.parse(await readFile(v.copy,'utf8'))])));}
  await page.route('**/api/tw/stocks',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(captures.stocks)}));
  await page.route('**/api/reports/tw?*',r=>{const type=new URL(r.request().url()).searchParams.get('type');return r.fulfill({contentType:'application/json',body:JSON.stringify(captures[type])});});await open();
  await page.locator('#evidenceView').evaluate((n,label)=>{const p=document.createElement('p');p.textContent=label;n.prepend(p);},manifestPath?'Saved test evidence · 既有 frozen captures 重播；不是新的正式觀察。':'Synthetic saved test evidence · 隔離 fixtures；不是正式觀察。');
  assert.ok(new URL(page.url()).port!=='43871');assert.ok(new URL(page.url()).port!=='8080');
  for(const source of ['stocks','daily','weekly'])assert.ok((await page.locator('#evidenceSource-'+source).innerText()).includes(captures[source].observedAt));
  for(const source of ['daily','weekly'])if(captures[source].items[0])assert.ok((await page.locator('#evidenceReport-'+source).innerText()).includes(captures[source].items[0].reportId));
  if(manifestPath){const dir=new URL('../.tools/evidence/visual/',import.meta.url);await mkdir(dir,{recursive:true});await page.screenshot({path:fileURLToPath(new URL('saved-captures-replay-1280.png',dir)),fullPage:true});}
});
