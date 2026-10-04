import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTwPerformance} from '../ui/tw-performance.mjs';
import {twPerformanceFixture,twPerformanceItem} from './tw-performance-fixture.mjs';

const q={startDate:'2026-10-01',endDate:'2026-10-31',limit:20,offset:0};
const read=(state='READY',overrides={},requested=q)=>readTwPerformance(twPerformanceFixture(state,overrides),requested);

test('strict contract envelope, closed shapes, semantics and matching query',()=>{
  assert.equal(read().dataState,'READY');
  const mutations=[
    p=>p.extra='private',
    p=>delete p.provenance,
    p=>p.contractVersion=2,
    p=>p.sourceContractVersion='tw-observed-performance-v2',
    p=>p.source='private-source',
    p=>p.items[0].privatePath='C:/secret/db',
    p=>p.semantics.historicalPIT=true,
    p=>p.query.offset=1,
    p=>p.query.limit='20',
    p=>p.items[0].itemId='tw-candidate:2026-10-02:'+'f'.repeat(32)+':2330',
    p=>p.items[0].horizons[0].extra=true,
    p=>p.page.total=0,
    p=>p.warnings.push('C:/secret/db')
  ];
  for(const mutate of mutations){const p=twPerformanceFixture();mutate(p);assert.throws(()=>readTwPerformance(p,q));}
  assert.throws(()=>readTwPerformance(twPerformanceFixture(),{...q,startDate:'2026-10-02'}));
});

test('all states validate with correct state-specific page, warning and item shapes',()=>{
  for(const state of ['READY','PARTIAL','EMPTY','UNAVAILABLE','ERROR'])assert.equal(read(state).dataState,state);
  assert.equal(read('EMPTY').page.returned,0);
  assert.equal(read('UNAVAILABLE').page,null);
  assert.equal(read('ERROR').page,null);
  for(const mutate of [
    p=>p.dataState='UNKNOWN',
    p=>p.warnings.push('OBSERVATION_PRICE_EVIDENCE_INCOMPLETE'),
    p=>p.dataState='PARTIAL',
    p=>p.page.returned=0,
    p=>p.dataState='EMPTY',
    p=>p.dataState='ERROR'
  ]){const p=twPerformanceFixture();mutate(p);assert.throws(()=>readTwPerformance(p,q));}
  const unavailable=twPerformanceFixture('UNAVAILABLE');unavailable.items=[twPerformanceItem()];assert.throws(()=>readTwPerformance(unavailable,q));
  const error=twPerformanceFixture('ERROR');error.page={};assert.throws(()=>readTwPerformance(error,q));
  for(const state of ['UNAVAILABLE','ERROR']){
    const retained=twPerformanceFixture(state);assert.equal(readTwPerformance(retained,q).scope.state,'AVAILABLE');
    retained.scope=null;assert.equal(readTwPerformance(retained,q).scope,null);
  }
});

test('five ordered horizons preserve zero, negative, null, not-yet-due and calendar-unavailable values',()=>{
  const item=twPerformanceItem();
  assert.deepEqual(item.horizons.map(h=>h.sessionCount),[1,3,5,10,20]);
  assert.equal(read().items[0].horizons[0].returnPercent,0);
  item.horizons[0].close=80;item.horizons[0].returnPercent=-20;
  item.horizons[1]={...item.horizons[1],state:'NOT_YET_DUE',close:null,returnPercent:null,provenance:null,reasonCode:'SESSION_NOT_YET_DUE'};
  item.horizons[2]={...item.horizons[2],state:'CALENDAR_UNAVAILABLE',expectedDate:null,close:null,returnPercent:null,dueAt:null,provenance:null,reasonCode:'CALENDAR_COVERAGE_INSUFFICIENT'};
  item.horizons[3]={...item.horizons[3],state:'PRICE_UNAVAILABLE',close:120,returnPercent:null,provenance:null,reasonCode:'OFFICIAL_PRICE_MISSING'};
  const parsed=read('READY',{items:[item],page:{limit:20,offset:0,returned:1,hasMore:false,nextOffset:null,total:null}});
  assert.equal(parsed.items[0].horizons[0].returnPercent,-20);
  assert.equal(parsed.items[0].horizons[1].state,'NOT_YET_DUE');
  assert.equal(parsed.items[0].horizons[2].state,'CALENDAR_UNAVAILABLE');
  assert.equal(parsed.items[0].horizons[3].close,120);
  assert.equal(parsed.items[0].horizons[3].returnPercent,null);
});

test('invalid reference can retain a visible horizon close with null return',()=>{
  const item=twPerformanceItem({referenceClose:null,referenceState:'PRICE_UNAVAILABLE',referenceReasonCode:'OFFICIAL_PRICE_MISSING',referenceProvenance:null});
  item.horizons=item.horizons.map((h,index)=>({...h,close:index===0?101:null,returnPercent:null,state:'PRICE_UNAVAILABLE',reasonCode:'REFERENCE_CLOSE_UNAVAILABLE',provenance:null}));
  const parsed=read('READY',{items:[item],page:{limit:20,offset:0,returned:1,hasMore:false,nextOffset:null,total:null}});
  assert.equal(parsed.items[0].referenceClose,null);
  assert.equal(parsed.items[0].horizons[0].close,101);
  assert.equal(parsed.items[0].horizons[0].returnPercent,null);
});

test('same-date and same-symbol runs remain distinct in source order',()=>{
  const first=twPerformanceItem({runId:'b'.repeat(32)}),second=twPerformanceItem({runId:'c'.repeat(32)});
  const parsed=read('READY',{items:[first,second],page:{limit:20,offset:0,returned:2,hasMore:false,nextOffset:null,total:null}});
  assert.equal(parsed.items[0].targetDate,parsed.items[1].targetDate);
  assert.equal(parsed.items[0].symbol,parsed.items[1].symbol);
  assert.notEqual(parsed.items[0].runId,parsed.items[1].runId);
  assert.deepEqual(parsed.items.map(item=>item.runId),[first.runId,second.runId]);
  const duplicate=twPerformanceFixture('READY',{items:[first,first],page:{limit:20,offset:0,returned:2,hasMore:false,nextOffset:null,total:null}});
  assert.throws(()=>readTwPerformance(duplicate,q));
});

test('pagination honors requested limit at offsets zero, 9999 and 10000',()=>{
  for(const offset of [0,9999,10000]){
    const requested={...q,limit:1,offset};
    const item=twPerformanceItem({runId:(offset+1).toString(16).padStart(32,'0')});
    const atCeiling=offset===10000;
    const state=atCeiling?'PARTIAL':'READY';
    const warnings=atCeiling?['PAGINATION_OFFSET_LIMIT']:[];
    const p=twPerformanceFixture(state,{query:{operation:'LIST',requestedStartDate:q.startDate,requestedEndDate:q.endDate,limit:1,offset},items:[item],page:{limit:1,offset,returned:1,hasMore:true,nextOffset:atCeiling?null:offset+1,total:null},warnings});
    const parsed=readTwPerformance(p,requested);
    assert.equal(parsed.page.limit,1);
    assert.equal(parsed.page.offset,offset);
    assert.equal(parsed.page.total,null);
    assert.equal(parsed.page.hasMore,true);
    assert.equal(parsed.page.nextOffset,atCeiling?null:offset+1);
    if(atCeiling)assert.ok(parsed.warnings.includes('PAGINATION_OFFSET_LIMIT'));
  }
});

test('malformed consumed types and provenance fields reject',()=>{
  for(const mutate of [
    p=>p.items[0].referenceClose='100',
    p=>p.items[0].calendarMarketsUsed='TWSE',
    p=>p.items[0].horizons[0].returnPercent=NaN,
    p=>p.items[0].horizons[0].provenance.sourceStatus='FAILED',
    p=>p.items[0].referenceProvenance.privateField='secret',
    p=>p.page.hasMore=1,
    p=>p.warnings=['SOURCE_UNAVAILABLE','SOURCE_UNAVAILABLE']
  ]){const p=twPerformanceFixture();mutate(p);assert.throws(()=>readTwPerformance(p,q));}
});

test('source returns and expected dates pass through without arithmetic or calendar recomputation',()=>{
  const item=twPerformanceItem();
  item.horizons[0].close=250;
  item.horizons[0].returnPercent=-7.25;
  item.horizons[0].expectedDate='2026-10-06';
  item.horizons[0].dueAt='2026-10-06T11:00:00Z';
  const parsed=read('READY',{items:[item],page:{limit:20,offset:0,returned:1,hasMore:false,nextOffset:null,total:null}});
  assert.equal(parsed.items[0].horizons[0].close,250);
  assert.equal(parsed.items[0].horizons[0].returnPercent,-7.25);
  assert.equal(parsed.items[0].horizons[0].expectedDate,'2026-10-06');
  assert.equal(parsed.items[0].horizons[0].dueAt,'2026-10-06T11:00:00Z');
});

test('impossible source clock fields reject without local clock calculations',()=>{
  for(const time of ['2026-10-02T24:00:00Z','2026-10-02T10:60:00Z','2026-10-02T10:00:60Z','2026-10-02T10:00:00+19:00']) {
    const p=twPerformanceFixture();p.items[0].observationFinishedAt=time;
    assert.throws(()=>readTwPerformance(p,q));
  }
});
