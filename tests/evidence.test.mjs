import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceLoader, readEvidenceSource, evidenceValue, evidenceIdentity, evidenceSources } from '../ui/evidence.mjs';
import { twFixture, warmingFixture } from './tw-stocks-fixture.mjs';
import { twReportsFixture } from './tw-reports-fixture.mjs';

const report = (type, state = 'READY') => twReportsFixture(new URL(`http://fixture.invalid/api/reports/tw?type=${type}&limit=1&offset=0`), state);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise, resolve, reject }; };
const tick = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
function harness() {
  const calls=[], views=[]; let flight=0,max=0;
  const loader=createEvidenceLoader((url, options) => {
    const head=deferred(),body=deferred(); ++flight;max=Math.max(max,flight);
    const call={url,options,head,body};calls.push(call);
    return head.promise.then(ok => ({ok,json:() => body.promise.finally(() => --flight)}),error => {--flight;throw error;});
  },state=>views.push(state));
  const reply=(i,payload) => { calls[i].head.resolve(true);calls[i].body.resolve(payload); };
  const finish=async(start=0, stocks=twFixture()) => {
    reply(start,stocks);await tick();reply(start+1,report('daily'));reply(start+2,report('weekly'));await loader.whenIdle();
  };
  return {loader,calls,views,reply,finish,get flight(){return flight;},get max(){return max;}};
}

test('Evidence reuses strict existing latest Stocks and bounded LIST parsers',()=>{
  const s=warmingFixture();assert.equal(readEvidenceSource('stocks',s),s);
  const r=report('daily','PARTIAL');assert.equal(readEvidenceSource('daily',r),r);
  const bad=twFixture();bad.latestFinalized.runId='2'.repeat(32);assert.throws(()=>readEvidenceSource('stocks',bad),/INVALID_TW_RESPONSE/);
  const wrongPage=report('daily');wrongPage.page.limit=20;assert.throws(()=>readEvidenceSource('daily',wrongPage),/INVALID_TW_REPORTS_RESPONSE/);
  const wrongType=report('weekly');assert.throws(()=>readEvidenceSource('daily',wrongType));
  assert.throws(()=>readEvidenceSource('other',s));
});
for(const type of ['daily','weekly'])for(const state of ['READY','PARTIAL','EMPTY','UNAVAILABLE','ERROR'])test(`${type} normalized ${state} preserves its source envelope`,()=>{
  const p=report(type,state);assert.equal(readEvidenceSource(type,p).dataState,state);
  if(type==='daily'&&p.items.length){p.items[0].candidateCount=null;assert.equal(readEvidenceSource(type,p).items[0].candidateCount,null);}
});
test('null, zero, UNKNOWN and sensitive text remain distinct in presentation',()=>{
  assert.match(evidenceValue(null),/UNKNOWN.*不是 0／NO/);assert.equal(evidenceValue(0),'0');assert.equal(evidenceValue('UNKNOWN'),'UNKNOWN');
  for(const s of ['C:\\Users\\private\\data.db','file:///private/a','\\\\host\\share','/home/user/db','<img src=x>','host=private.test','stderr secret'])assert.equal(evidenceValue(s),'來源文字未公開');
  for(const s of ['private-host-name','stderr=secret','C:\\private\\run'])assert.match(evidenceIdentity(s),/UNKNOWN/);
  assert.equal(evidenceValue('tw-daily:2026-09-25:'+ '1'.repeat(32)),'tw-daily:2026-09-25:'+ '1'.repeat(32));
});
test('Stocks fetch AND JSON body settle before independent parallel report requests, maximum two',async()=>{
  const h=harness();h.loader.show();assert.deepEqual(h.calls.map(x=>x.url),[evidenceSources.stocks.url]);
  h.calls[0].head.resolve(true);await tick();assert.equal(h.calls.length,1,'headers alone are not settlement');
  h.calls[0].body.resolve(twFixture());await tick();assert.deepEqual(h.calls.slice(1).map(x=>x.url),[evidenceSources.daily.url,evidenceSources.weekly.url]);assert.equal(h.flight,2);
  h.reply(1,report('daily'));h.reply(2,report('weekly'));await h.loader.whenIdle();assert.equal(h.max,2);
  assert.ok(h.calls.every(x=>x.options.cache==='no-store'&&x.options.redirect==='error'));assert.ok(h.calls.every(x=>!x.url.includes('/detail')));
});
test('failed Stocks request still proceeds to Wave2 and preserves valid reports',async()=>{
  const h=harness();h.loader.show();h.calls[0].head.reject(new Error('private stderr'));await tick();
  assert.equal(h.calls.length,3);h.reply(1,report('daily'));h.reply(2,report('weekly'));await h.loader.whenIdle();
  assert.equal(h.loader.state.stocks.failed,true);assert.equal(h.loader.state.daily.payload.dataState,'READY');assert.equal(h.max,2);
});
test('invalid Stocks JSON body still settles Wave1 and permits reports',async()=>{
  const h=harness();h.loader.show();h.calls[0].head.resolve(true);h.calls[0].body.reject(new Error('bad JSON'));await tick();
  assert.equal(h.calls.length,3);h.reply(1,report('daily'));h.reply(2,report('weekly'));await h.loader.whenIdle();assert.equal(h.loader.state.stocks.failed,true);
});
test('refresh during old Wave1 body waits actual settlement; only newest queued load runs',async()=>{
  const h=harness();h.loader.show();h.calls[0].head.resolve(true);await tick();
  h.loader.refresh();h.loader.refresh();assert.equal(h.calls[0].options.signal.aborted,true);assert.equal(h.calls.length,1);assert.equal(h.loader.state.waiting,true);
  const old=warmingFixture();old.warnings=['OLD_RESPONSE'];h.calls[0].body.resolve(old);await tick();
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].url,evidenceSources.stocks.url);assert.equal(h.loader.state.stocks,null);
  await h.finish(1);assert.equal(h.max,2);assert.deepEqual(h.loader.state.stocks.payload.warnings,[]);assert.equal(h.calls.length,4);
});
test('refresh during old Wave2 waits BOTH reports and never overlaps three requests',async()=>{
  const h=harness();h.loader.show();h.reply(0,twFixture());await tick();assert.equal(h.flight,2);
  h.loader.refresh();h.loader.refresh();assert.equal(h.calls.length,3);assert.equal(h.loader.state.stocks,null);
  h.reply(1,report('daily','PARTIAL'));await tick();assert.equal(h.calls.length,3);assert.equal(h.flight,1);
  h.reply(2,report('weekly','ERROR'));await tick();assert.equal(h.calls.length,4);assert.equal(h.calls[3].url,evidenceSources.stocks.url);
  await h.finish(3);assert.equal(h.max,2);assert.equal(h.loader.state.weekly.payload.dataState,'READY');
});
test('leave and return pending view waits old requests; late results cannot render or cache',async()=>{
  const h=harness();h.loader.show();h.reply(0,twFixture());await tick();h.loader.hide();assert.equal(h.loader.state.pending,false);assert.equal(h.loader.state.stocks,null);
  h.loader.show();assert.equal(h.calls.length,3);h.reply(1,report('daily'));h.reply(2,report('weekly'));await tick();assert.equal(h.calls.length,4);
  await h.finish(3);assert.equal(h.max,2);assert.equal(h.loader.state.loaded,true);
  h.loader.hide();h.loader.show();await tick();assert.equal(h.calls.length,6,'completed return has no automatic read');
});
test('immediate leave before Wave1 completion sends no abandoned report reads',async()=>{
  const h=harness();h.loader.show();h.loader.hide();h.reply(0,twFixture());await h.loader.whenIdle();
  assert.equal(h.calls.length,1);assert.equal(h.loader.state.loaded,false);assert.equal(h.loader.state.stocks,null);
});
for(const [stocks,daily,weekly] of [['PARTIAL','READY','ERROR'],['UNAVAILABLE','READY','READY'],['COHERENT','PARTIAL','PARTIAL']])test(`independent source states ${stocks}/${daily}/${weekly}`,async()=>{
  const h=harness();h.loader.show();h.reply(0,twFixture(null,stocks));await tick();h.reply(1,report('daily',daily));h.reply(2,report('weekly',weekly));await h.loader.whenIdle();
  const s=h.loader.state;assert.equal(s.stocks.payload.dataState,stocks);assert.equal(s.daily.payload.dataState,daily);assert.equal(s.weekly.payload.dataState,weekly);
  assert.equal(Object.hasOwn(s,'dataState'),false,'no overall source state');
});
