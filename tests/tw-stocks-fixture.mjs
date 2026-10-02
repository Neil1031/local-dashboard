import {readFileSync} from 'node:fs';
// Actual source exporter output on isolated synthetic SQLite/journal/weekly files.
const source=JSON.parse(readFileSync(new URL('../src/test/resources/fixtures/tw-daily-accumulation-v1.json',import.meta.url),'utf8'));
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const convert=v=>Array.isArray(v)?v.map(convert):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,n])=>[camel(k),convert(n)])):v;
export function twFixture(date=null,state='COHERENT') {
  const s=convert(structuredClone(source));
  const p={contractVersion:1,sourceContractVersion:source.contract_version,dataState:state,observedAt:'2026-09-25T15:01:00Z',generatedAt:s.generatedAt,
    query:{mode:date===null?'LATEST_FINALIZED':'TARGET_DATE',targetDate:date},snapshot:s.snapshot,scope:s.scope,latestAttempt:s.statusSummary.latestAttempt,latestFinalized:s.statusSummary.latestFinalized,observation:s.observation,responsibility:s.responsibility,weeklyCheck:s.weeklyCheck,warnings:[]};
  p.snapshot.state=state;
  if(date){p.observation.targetDate=date;p.observation.identity.targetDate=date;p.latestFinalized.targetDate=date;p.observation.candidates.forEach(c=>c.signalDate=date);}
  if(state==='PARTIAL'){p.snapshot.reasonCodes=['JOURNAL_MISSING'];p.warnings=['JOURNAL_MISSING'];p.weeklyCheck.binding='INDEPENDENT';}
  if(state==='UNAVAILABLE'){p.observation=null;p.latestFinalized=null;p.latestAttempt=null;p.scope={state:'UNAVAILABLE',mode:null,startDate:null};p.responsibility={state:'UNKNOWN',pendingCount:null,unfinishedCount:null,pendingRevalidation:null,unfinishedRuns:null,truncated:false};p.weeklyCheck={state:'UNAVAILABLE',checkRunId:null,checkedAt:null,weekStart:null,weekEnd:null,status:'UNKNOWN',problemCount:null,dayStatusCounts:null,pendingRevalidationCount:null,unfinishedRunCount:null,binding:'UNKNOWN',pointerState:'UNKNOWN'};p.snapshot.reasonCodes=['DATABASE_MISSING'];p.warnings=['DATABASE_MISSING'];}
  if(state==='ERROR'){for(const k of ['snapshot','scope','latestAttempt','latestFinalized','observation','responsibility','weeklyCheck','generatedAt'])p[k]=null;p.warnings=['SOURCE_INVALID_OUTPUT'];}
  return p;
}
export function warmingFixture() {
  const p=twFixture(null,'PARTIAL');p.observation.classificationStatus='WARMING_UP';p.observation.candidates=[];p.observation.candidateSummary={state:'AVAILABLE',savedCandidateCount:0,savedTotalCandidatesBeforeLimit:0,savedTruncated:false,exportedCount:0};
  p.latestAttempt.runId='2'.repeat(32);p.latestAttempt.status='FAILED';p.responsibility={state:'UNKNOWN',pendingCount:null,unfinishedCount:null,pendingRevalidation:null,unfinishedRuns:null,truncated:false};return p;
}
