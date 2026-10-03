import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPerformance,percent,exactTicker,horizons,buckets} from '../ui/performance.mjs';
import {performanceFixture} from './performance-fixture.mjs';
const url=(kind,q={})=>new URL(`http://fixture/api/performance/${kind}?${new URLSearchParams(q)}`);
test('five fixed groups, source fractional boundaries, UNSCORED and zero vs null',()=>{
  for(const horizon of horizons){const q={horizon},p=readPerformance(performanceFixture(url('summary',q)),'summary',q);assert.deepEqual(p.groups.map(g=>g.bucket),buckets);assert.equal(p.groups[1].winRatePct,0);assert.equal(percent(p.groups[1].averageReturnPct),'0%');assert.equal(percent(p.groups[0].averageReturnPct),'—');assert.equal(p.filters.minInvestment,null);}
});
test('empty five buckets and safe failure envelopes',()=>{
  for(const state of ['EMPTY','UNAVAILABLE','ERROR']){const p=readPerformance(performanceFixture(url('summary'),'EMPTY'===state?'EMPTY':state),'summary',{horizon:'3m'});assert.equal(p.dataState,state);assert.equal(p.groups.length,state==='EMPTY'?5:0);}
});
test('summary contradictions are rejected before rendering',()=>{
  for(const mutate of [p=>p.groups.pop(),p=>p.groups[0].averageReturnPct=0,p=>p.groups[1].observed=7,p=>p.performanceStatusCounts.complete=50,p=>p.filters.minInvestment=0]){const p=performanceFixture(url('summary'));mutate(p);assert.throws(()=>readPerformance(p,'summary',{horizon:'3m'}));}
});
test('exact ticker preserves case, pages bounded, identity source scoped',()=>{
  assert.equal(exactTicker('coo'),'coo');for(const bad of [' COO','COO ','report:COO','C:\\secret','/secret','a\n'])assert.throws(()=>exactTicker(bad));
  const q={horizon:'3m',limit:20,offset:0},p=readPerformance(performanceFixture(url('signals',q)),'signals',q);assert.equal(p.items[0].ticker,p.items[1].ticker);assert.notEqual(p.items[0].signalId,p.items[1].signalId);
  assert.equal(p.items[0].horizonObserved,true);assert.equal(p.items[0].snapshot.returnFromTradablePct,null);assert.equal(p.items[3].performanceStatus,'NOT_COMPUTED');assert.equal(p.items[3].snapshot.returnFromTradablePct,0);assert.equal(p.items[4].horizonObserved,false);
  q.offset=20;assert.equal(readPerformance(performanceFixture(url('signals',q)),'signals',q).items.length,1);q.offset=40;assert.equal(readPerformance(performanceFixture(url('signals',q)),'signals',q).dataState,'EMPTY');
});
test('list duplicate and snapshot presence contradictions rejected',()=>{
  const q={horizon:'3m',limit:20,offset:0};for(const mutate of [p=>p.items[1]=p.items[0],p=>p.items[0].horizonObserved=false,p=>p.page.nextOffset=999,p=>p.items[0].signalId='sec:bad:0']){const p=performanceFixture(url('signals',q));mutate(p);assert.throws(()=>readPerformance(p,'signals',q));}
});
test('detail statuses, missing dates, all stored snapshots and null metrics',()=>{
  for(const signalId of ['report:2026-09-30:COO','report:2026-09-29:COO','report:2026-09-28:T03','report:2026-09-27:T04']){const q={signalId},p=readPerformance(performanceFixture(url('detail',q)),'detail',q);assert.equal(Object.keys(p.snapshots).length,7);assert.equal(p.snapshots['3m'].returnFromTradablePct,null);assert.equal(p.snapshots.discovery.returnFromDiscoveryPct,null);assert.equal(p.snapshots.discovery.priceBasis,'split_adjusted_ex_dividends');}
});
test('detail invalid dates/status/numbers and unknown snapshot fail closed',()=>{
  const q={signalId:'report:2026-09-30:COO'};for(const mutate of [p=>p.performance.missingSessions.push('2026-09-28'),p=>p.performance.daysToPeak=.5,p=>p.snapshots['future']=p.snapshots['3m'],p=>p.signal.discoveredAt='2026-09-30T10:00:00',p=>p.snapshots['3m'].price=0]){const p=performanceFixture(url('detail',q));mutate(p);assert.throws(()=>readPerformance(p,'detail',q));}
});
