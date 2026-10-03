import {readFileSync} from 'node:fs';
const raw = kind => JSON.parse(readFileSync(new URL(`../src/test/resources/fixtures/performance-${kind}-v1.json`,import.meta.url),'utf8'));
const now='2026-09-30T10:00:00+08:00';
const base = state => ({contractVersion:1,sourceContractVersion:1,source:'performance',dataState:state,observedAt:now,
  provenance:{sourceId:'insider-performance',sourceVersion:1,lastObservedAt:['READY','EMPTY'].includes(state)?now:null},warnings:['CURRENT_IMPORTED_SCORES_NOT_PIT','CORRELATED_SIGNAL_OBSERVATIONS']});
export function performanceFixture(url, state='READY') {
  const q=url.searchParams,kind=url.pathname.split('/').at(-1),horizon=q.get('horizon')||'3m',p=base(state);
  if(kind==='summary') {
    const s=raw('summary');return {...p,horizon,filters:{minInvestment:null,minSignal:null},groups:['READY','EMPTY'].includes(state)?s.groups.map(g=>state==='EMPTY'?{...g,signals:0,observed:0,unobserved:0,averageReturnPct:null,winRatePct:null}:g):[],
      performanceStatusCounts:state==='READY'?s.performanceStatusCounts:state==='EMPTY'?{complete:0,partial:0,pending:0,not_computed:0}:null};
  }
  if(kind==='signals') {
    const limit=+(q.get('limit')||20),offset=+(q.get('offset')||0),ticker=q.get('ticker');let all=raw('list').signals;
    all.push({...all.at(-1),ticker:'T21',reportDate:'2026-09-10',signalId:'report:2026-09-10:T21'});if(ticker)all=all.filter(s=>s.ticker===ticker);
    const items=state==='READY'?all.slice(offset,offset+limit):[],hasMore=state==='READY'&&offset+limit<all.length;
    return {...p,dataState:state==='READY'&&!items.length?'EMPTY':state,horizon,ticker,items,page:{limit,offset,hasMore,nextOffset:hasMore?offset+limit:null}};
  }
  const s=raw('detail');if(state!=='READY')return {...p,signal:null,performance:null,snapshots:{}};
  const id=q.get('signalId')||s.signal.signalId,[,reportDate,ticker]=id.split(':');s.signal={...s.signal,signalId:id,reportDate,ticker};
  if(ticker==='T03'){s.performance.status='PENDING';s.performance.missingSessions=[];}
  if(ticker==='T04'){s.performance.status='NOT_COMPUTED';for(const k of Object.keys(s.performance))if(!['status','missingSessions'].includes(k))s.performance[k]=null;s.performance.missingSessions=[];}
  if(reportDate==='2026-09-29'){s.performance.status='PARTIAL';s.performance.missingSessions=['2026-09-28'];}
  return {...p,signal:s.signal,performance:s.performance,snapshots:s.snapshots};
}
