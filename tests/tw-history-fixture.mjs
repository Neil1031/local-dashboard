import {readFileSync} from 'node:fs';
const raw=JSON.parse(readFileSync(new URL('../src/test/resources/fixtures/tw-history-list.json',import.meta.url),'utf8'));
export function historyFixture(q={startDate:'2026-09-21',endDate:'2026-09-25',limit:20,offset:0},state='READY'){
  const p=structuredClone(raw);p.contractVersion=1;p.sourceContractVersion=raw.contractVersion;p.source='taiwan-history';p.observedAt='2026-09-25T15:01:00Z';p.provenance='SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS';p.dataState=state;
  if(q.startDate<p.scope.startDate)p.scope.startDate=q.startDate;
  p.query={operation:'LIST',requestedStartDate:q.startDate,requestedEndDate:q.endDate,limit:q.limit,offset:q.offset};p.page.limit=q.limit;p.page.offset=q.offset;
  for(const o of p.items){o.targetDate=q.endDate;o.observationId='tw-observation:'+q.endDate+':'+o.runId;o.detailRef.reportId='tw-daily:'+q.endDate+':'+o.runId;}
  if(state==='PARTIAL'){p.warnings=['SAVED_FACT_UNKNOWN'];p.items[0].projectionWarnings=[...p.warnings];p.items[0].candidateCount=null;p.items[0].savedTotalCandidatesBeforeLimit=null;p.items[0].savedCandidateTruncated=null;p.items[0].readiness.warmingSymbols=null;p.items[0].readiness.skippedCounts=null;p.items[0].classificationStatus='UNKNOWN';p.items[0].markets[0].complete=null;}
  if(['EMPTY','UNAVAILABLE','ERROR'].includes(state)){p.items=[];if(state==='EMPTY')p.page.returned=0;else{p.page=null;p.scope=null;p.generatedAt=null;p.warnings=['SOURCE_UNAVAILABLE'];}}
  return p;
}
export function historyPaged(q){const p=historyFixture(q);while(p.items.length<q.limit){const o=structuredClone(p.items[0]);o.runId=(q.offset+p.items.length+5).toString(16).padStart(32,'0');o.observationId='tw-observation:'+o.targetDate+':'+o.runId;o.detailRef.reportId='tw-daily:'+o.targetDate+':'+o.runId;p.items.push(o);}p.page.returned=q.limit;p.page.hasMore=true;p.page.nextOffset=q.offset+q.limit<=10000?q.offset+q.limit:null;if(p.page.nextOffset===null){p.dataState='PARTIAL';p.warnings=['PAGINATION_OFFSET_LIMIT'];}return p;}
