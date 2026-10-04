import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
import { renderMarkdown } from './safe-markdown.mjs';

export const TW_REPORT_TIMEOUT_MS = 35000;
const states = new Set(['READY', 'PARTIAL', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const usable = state => ['READY', 'PARTIAL', 'EMPTY'].includes(state);
const integer = n => Number.isSafeInteger(n) && n >= 0 && n <= 1e9;
const nullableCount = n => n === null || integer(n);
const strings = a => Array.isArray(a) && a.length <= 100 && a.every(x => typeof x === 'string' && /^[A-Z0-9_]+$/.test(x));
const invalid = () => { throw new Error('INVALID_TW_REPORTS_RESPONSE'); };
const stamp = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
const provenance = type => type === 'DAILY' ? 'SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS' : 'SAVED_IMMUTABLE_WEEKLY_CHECK';
export function exactTwReportId(id) {
  if (typeof id !== 'string' || !/^tw-(daily|weekly):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9a-f]{32}$/.test(id)) invalid();
  const [family, day] = id.split(':'), date = new Date(`${day}T00:00:00Z`);
  if (day.startsWith('0000-') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || family === 'tw-weekly' && date.getUTCDay() !== 5) invalid();
  return family === 'tw-daily' ? 'DAILY' : 'WEEKLY';
}
function envelope(p, type) {
  if (p?.contractVersion !== 1 || p.sourceContractVersion !== 'tw-reports-v1' || p.source !== 'taiwan-reports' || p.reportType !== type
      || p.provenance !== provenance(type) || !states.has(p.dataState) || !stamp(p.observedAt) || !(p.generatedAt === null || stamp(p.generatedAt)) || !strings(p.warnings)) invalid();
}
function summary(item, type) {
  if (!item || exactTwReportId(item.reportId) !== type || item.reportType !== type) invalid();
  const [, day, id] = item.reportId.split(':');
  if (item.effectiveDate !== day) invalid();
  if (type === 'DAILY') {
    if (item.targetDate !== day || item.accumulationRunId !== id || !stamp(item.savedAt) || !nullableCount(item.candidateCount)
        || !['SUCCESS','PARTIAL','FAILED','SKIPPED_NON_TRADING_DAY'].includes(item.status)
        || !['WARMING_UP','OBSERVATIONS_AVAILABLE','UNAVAILABLE','NOT_APPLICABLE','NO_MARKET_DATA','UNKNOWN'].includes(item.classificationStatus)) invalid();
  } else {
    const start = new Date(`${day}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 4);
    if (item.weekEnd !== day || item.weekStart !== start.toISOString().slice(0,10) || item.checkRunId !== id || !stamp(item.checkedAt)
        || !['SUCCESS','FAILED','NOT_DUE'].includes(item.status) || !item.dayStatusCounts || typeof item.dayStatusCounts !== 'object' || Array.isArray(item.dayStatusCounts)
        || !Object.entries(item.dayStatusCounts).every(([key,n]) => ['SUCCESS','PARTIAL','FAILED','SKIPPED_NON_TRADING_DAY'].includes(key) && integer(n))) invalid();
    for (const key of ['problemCount','pendingRevalidationCount','unfinishedRunCount']) if (!nullableCount(item[key])) invalid();
  }
}
export function readTwReports(p, query) {
  const type = query.type.toUpperCase(); envelope(p, type);
  if (!Array.isArray(p.items) || p.items.length > query.limit || p.report !== null) invalid();
  if (!usable(p.dataState)) { if (p.items.length || p.page !== null) invalid(); return p; }
  if (!p.page || p.page.limit !== query.limit || p.page.offset !== query.offset || p.page.total !== null || typeof p.page.hasMore !== 'boolean'
      || (p.page.hasMore && query.offset + query.limit <= 10000 ? p.page.nextOffset !== query.offset + query.limit : p.page.nextOffset !== null)
      || p.dataState === 'READY' && !p.items.length || p.dataState === 'EMPTY' && (p.items.length || p.page.hasMore)) invalid();
  const ids = new Set(); for (const item of p.items) { summary(item,type); if (!strings(item.warnings) || ids.has(item.reportId)) invalid(); ids.add(item.reportId); }
  return p;
}
export function readTwReportDetail(p, id) {
  const type = exactTwReportId(id); envelope(p,type);
  if (p.page !== null || !Array.isArray(p.items) || p.items.length || p.dataState === 'EMPTY') invalid();
  if (!['READY','PARTIAL'].includes(p.dataState)) { if (p.report !== null) invalid(); return p; }
  const r = p.report; summary(r,type);
  if (r.reportId !== id || typeof r.markdown !== 'string' || new TextEncoder().encode(r.markdown).length > 65536 || typeof r.bodyTruncated !== 'boolean' || r.facts?.provenance !== provenance(type)) invalid();
  const bounded = (v,max,nullable=false) => { if (!(nullable && v === null) && (!Array.isArray(v) || v.length > max)) invalid(); };
  if (type === 'DAILY') {
    for (const [key,max] of [['sources',64],['markets',2]]) bounded(r.facts[key],max);
    bounded(r.facts.candidates,100,true); bounded(r.facts.baselineDiagnostics?.records,100);
    if (!r.facts.scope || !r.facts.readiness || !r.facts.mappingDiagnostics || !r.facts.candidateSummary) invalid();
    for (const c of r.facts.candidates || []) if (c.analysisEligible !== null || c.analysisEligibleSemantics !== 'NOT_APPLICABLE_DAILY_OBSERVATION' || c.signalDate !== r.targetDate || !c.publicInfoCheck) invalid();
  } else {
    bounded(r.facts.days,5); bounded(r.facts.problems,50,true); bounded(r.facts.pendingRevalidation,100,true); bounded(r.facts.unfinishedRuns,100,true);
    if (r.facts.pointerState !== 'NOT_INSPECTED' || r.facts.dailyBinding !== 'INDEPENDENT') invalid();
  }
  return p;
}

// Only these normalized facts are presented. Unknown response fields are never rendered.
const publicInfo = ['recordExists','status','succeeded','checkedAt','asOf','coverageStatus','reasonCode'];
const problem = ['code','targetDate','runId'];
const shapes = {
  DAILY: {
    scope:['mode','startDate'], strategyStatus:null,
    sources:[['name','status','startedAt','finishedAt','reasonCode']],
    markets:[['market','complete','quoteScopeComplete','rows','expectedMasterSymbols','freshRows','unpricedUnknownCount','statusUnknownCount','quoteScopeStatus']],
    readiness:{skippedCounts:['BASELINE_SESSION_GAP','BELOW_ANOMALY_THRESHOLD','INSUFFICIENT_HISTORY','ZERO_VOLUME_OR_RECENT_HALT'],warmingSymbols:null,pendingCandidateNews:null,reasonCode:null},
    mappingDiagnostics:{state:null,unmappedSymbols:null,recognizedExclusions:[['symbol','market','source','sourceDate','reasonCode']]},
    baselineDiagnostics:{state:null,records:[['symbol','status','reasonCode','lowerBound','reasonDate','expectedDates','actualDates','missingDates']]},
    candidateSummary:['savedCandidateCount','savedTotalCandidatesBeforeLimit','savedTruncated','exportedCount','exportTruncated'],
    candidates:[{symbol:null,stockName:null,market:null,signalDate:null,classification:null,classificationBasis:null,coverageStatus:null,analysisEligible:null,analysisEligibleSemantics:null,publicInfoCheck:publicInfo,riskFlags:null,anomalyRank:null,sourceAnomalyScore:null,volumeRatio:null,volumeZscore:null,baselineVolume:null}], provenance:null
  },
  WEEKLY: {
    days:[{targetDate:null,status:null,accumulationRunId:null,savedAt:null,bindingState:null,savedCollectionStatus:null,problems:[problem]}],
    problems:[problem],pendingRevalidation:[['targetDate','originRunId','requiredAt']],unfinishedRuns:[['runId','state','targetDates','targetDatesSemantics']],pointerState:null,dailyBinding:null,provenance:null
  }
};
const labels = {
  scope:message("tw-reports.wording"),strategyStatus:message("tw-reports.wording.2"),sources:message("tw-reports.wording.3"),markets:message("tw-reports.wording.4"),readiness:message("tw.readiness"),mappingDiagnostics:message("evidence.mappingState"),baselineDiagnostics:message("tw-reports.wording.5"),candidateSummary:message("tw-reports.wording.6"),candidates:message("tw-reports.wording.7"),days:message("tw-reports.binding"),problems:message("tw-reports.wording.8"),pendingRevalidation:message("tw-reports.wording.9"),unfinishedRuns:message("tw-reports.runs"),sourceAnomalyScore:message("tw-reports.source.anomaly.score"),analysisEligible:message("tw-reports.analysis.eligibility"),provenance:message("evidence.source.provenance")
};
const label = key => Object.hasOwn(labels, key) ? labels[key] : message(`twFacts.${key}`);
const display = (v,key) => v === null ? key === 'analysisEligible' ? message("tw-reports.null.not.applicable.daily.observation") : message("common.nullMeaning") : typeof v === 'boolean' ? String(v) : ['state','status','reasonCode','classificationStatus','quoteScopeStatus','coverageStatus','bindingState','savedCollectionStatus'].includes(key) ? codeText(String(v)) : String(v);
export function mountTwReports(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), dialog = get('twReportDetail');
  const element = (tag,text,cls) => { const n=document.createElement(tag);if(text!=null)setText(n, text);if(cls)n.className=cls;return n; };
  const sections = new Map(['daily','weekly'].map(type => [type,{type,root:get(`twReports-${type}`),query:{type,limit:20,offset:0},revision:0,controller:null,pending:null}]));
  let active=false,current='all',detailRevision=0,detailController,detailId,detailPending,returnFocus;
  const visible = s => active && (current === 'all' || current === `tw-${s.type}`);
  const messages={READY:message("tw-reports.ready"),PARTIAL:message("tw-reports.partial"),EMPTY:message("tw-reports.empty.bounded.page"),UNAVAILABLE:message("tw-reports.unavailable"),ERROR:message("tw-reports.error")};
  function status(node,state) { setText(node, messages[state]||state);node.setAttribute('role',['ERROR','UNAVAILABLE'].includes(state)?'alert':'status'); }
  function source(p) { return message("tw-reports.taiwan.volume.watch.tw.reports.v1", { value0: p.reportType, value1: p.provenance, value2: p.observedAt, value3: display(p.generatedAt) }); }
  function warnings(node,items) { node.replaceChildren(...items.map(v=>element('li',v))); }
  function clearDetail() { for(const id of ['twReportMetadata','twReportFacts','twReportBody','twReportWarnings','twReportSource'])setText(get(id), ''); }
  function cancelDetail() { ++detailRevision;detailController?.abort();detailPending=null;dialog.setAttribute('aria-busy','false'); }
  function closeDetail() { cancelDetail();clearDetail();if(dialog.open)dialog.close(); }
  get('twReportClose').addEventListener('click',closeDetail);
  dialog.addEventListener('close',()=>{cancelDetail();clearDetail();if(returnFocus?.isConnected && returnFocus.closest('[hidden]')===null)returnFocus.focus();});
  function facts(node,obj,shape) {
    const entries=Array.isArray(shape)?shape.map(k=>[k,null]):Object.entries(shape);
    for(const [key,child] of entries) {
      if(!Object.hasOwn(obj,key))continue;const v=obj[key],section=element('section',null,'tw-fact-section');section.append(element('h4',label(key)));
      if(v===null || child===null) section.append(element('p',Array.isArray(v)? v.length ? v.map(x=>display(x,key)).join(', ') : message("tw-reports.0") : display(v,key)));
      else if(Array.isArray(child) && typeof child[0]!=='string') {
        section.append(element('p',message("tw-reports.wording.10", { value0: v.length })));for(const row of v){const dl=element('div',null,'tw-fact-record');facts(dl,row,child[0]);section.append(dl);}
      } else facts(section,v,child);
      node.append(section);
    }
  }
  function metadata(node,r) {
    const pairs=r.reportType==='DAILY'?[[message("tw-reports.wording.11"),'targetDate'],[message("reports.source.report.id"),'reportId'],[message("evidence.accumulation.run.id"),'accumulationRunId'],[message("evidence.wording.9"),'status'],[message("evidence.classification"),'classificationStatus'],[message("tw-reports.wording.12"),'candidateCount'],[message("common.savedAt"),'savedAt']]:[[message("evidence.week.start"),'weekStart'],[message("evidence.week.end"),'weekEnd'],[message("reports.source.report.id"),'reportId'],[message("evidence.check.run.id"),'checkRunId'],[message("tw-reports.wording.13"),'status'],[message("tw-reports.wording.14"),'problemCount'],[message("tw-reports.wording.15"),'pendingRevalidationCount'],[message("tw-reports.wording.16"),'unfinishedRunCount'],[message("tw-reports.wording.17"),'checkedAt']];
    for(const [name,key] of pairs)node.append(element('dt',name),element('dd',display(r[key],key)));
    if(r.reportType==='WEEKLY')for(const [key,n]of Object.entries(r.dayStatusCounts))node.append(element('dt',message("tw-reports.day", { value0: key })),element('dd',n));
  }
  async function loadDetail(force = false) {
    if(!active||!dialog.open||!detailId)return;
    if(!force && detailPending===detailId)return;
    cancelDetail();const id=detailId,revision=++detailRevision,controller=new AbortController();detailController=controller;detailPending=id;clearDetail();dialog.setAttribute('aria-busy','true');status(get('twReportStatus'),message("tw-reports.loading.taiwan.report"));
    const timer=setTimeout(()=>controller.abort(),TW_REPORT_TIMEOUT_MS);
    try {
      const response=await fetcher(`/api/reports/tw/detail?${new URLSearchParams({reportId:id})}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();
      const p=readTwReportDetail(await response.json(),id);if(revision!==detailRevision||!active||!dialog.open||id!==detailId)return;if(controller.signal.aborted)throw new Error();
      status(get('twReportStatus'),p.dataState);setText(get('twReportSource'), source(p));warnings(get('twReportWarnings'),p.warnings);
      if(!p.report)return;metadata(get('twReportMetadata'),p.report);facts(get('twReportFacts'),p.report.facts,shapes[p.reportType]);renderMarkdown(document,get('twReportBody'),p.report.markdown);
      if(p.report.bodyTruncated)get('twReportBody').prepend(element('p',message("tw-reports.body.truncated.markdown.machine.truth")));
    } catch {if(revision===detailRevision&&active&&dialog.open){clearDetail();status(get('twReportStatus'),'ERROR');}}
    finally{clearTimeout(timer);if(revision===detailRevision){detailPending=null;dialog.setAttribute('aria-busy','false');}}
  }
  function openDetail(item,opener) {
    cancelDetail();clearDetail();returnFocus=opener;detailId=item.reportId;setText(get('twReportTitle'), message('reports.twDetailTitle', { type: item.reportType === 'DAILY' ? message('tw-reports.daily') : message('tw-reports.weekly'), date: item.effectiveDate }));if(!dialog.open)dialog.showModal();get('twReportClose').focus();void loadDetail();
  }
  function clearList(s) { for(const key of ['Rows','Source','Warnings','Page'])setText(get(`tw${s.type}-${key}`), '');get(`tw${s.type}-Previous`).disabled=s.query.offset===0;get(`tw${s.type}-Next`).disabled=true; }
  function cancelList(s) {++s.revision;s.controller?.abort();s.pending=null;s.root.setAttribute('aria-busy','false');}
  async function loadList(s, force = false) {
    if(!visible(s))return;const query={...s.query},key=JSON.stringify(query);if(!force && s.pending===key)return;
    cancelList(s);if(dialog.open&&detailId?.startsWith(`tw-${s.type}:`))closeDetail();const revision=++s.revision,controller=new AbortController();s.controller=controller;s.pending=key;clearList(s);s.root.setAttribute('aria-busy','true');status(get(`tw${s.type}-Status`),message("tw-reports.loading.taiwan.reports"));
    const timer=setTimeout(()=>controller.abort(),TW_REPORT_TIMEOUT_MS);
    try {
      const response=await fetcher(`/api/reports/tw?${new URLSearchParams(query)}`,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error();const p=readTwReports(await response.json(),query);
      if(revision!==s.revision||!visible(s))return;if(controller.signal.aborted)throw new Error();status(get(`tw${s.type}-Status`),p.dataState);setText(get(`tw${s.type}-Source`), source(p));warnings(get(`tw${s.type}-Warnings`),p.warnings);
      get(`tw${s.type}-Rows`).replaceChildren(...p.items.map(item=>{
        const card=element('article',null,'signal-card tw-report-card'),button=element('button',s.type==='daily'?item.targetDate:`${item.weekStart} → ${item.weekEnd}`,'signal-open tw-report-open');button.type='button';button.addEventListener('click',()=>openDetail(item,button));const dl=element('dl',null,'signal-facts');metadata(dl,item);card.append(element('p',message("tw-reports.taiwan.volume.watch.tw", { value0: s.type==='daily'?message("tw-reports.daily"):message("tw-reports.weekly") }),'eyebrow'),button,dl);
        if(s.type==='daily'&&item.classificationStatus==='WARMING_UP')card.append(element('p',message("tw-reports.warming.up.0"),'tw-report-limit'));
        const w=element('ul');warnings(w,item.warnings);card.append(w);return card;
      }));
      setText(get(`tw${s.type}-Page`), message("tw-reports.offset.pit.snapshot", { value0: p.items.length, value1: query.offset, value2: query.limit }));
      get(`tw${s.type}-Previous`).disabled=query.offset===0||!usable(p.dataState);get(`tw${s.type}-Next`).disabled=!p.page?.hasMore||p.page.nextOffset===null;
      if(p.page?.hasMore&&p.page.nextOffset===null)get(`tw${s.type}-Page`).append(element('span',message("tw-reports.wording.18")));
    } catch {if(revision===s.revision&&visible(s)){clearList(s);status(get(`tw${s.type}-Status`),'ERROR');get(`tw${s.type}-Previous`).disabled=true;}}
    finally{clearTimeout(timer);if(revision===s.revision){s.pending=null;s.root.setAttribute('aria-busy','false');}}
  }
  for(const s of sections.values()) {
    get(`tw${s.type}-Reload`).addEventListener('click',()=>void loadList(s, true));
    for(const direction of ["Previous",'Next'])get(`tw${s.type}-${direction}`).addEventListener('click',()=>{const offset=s.query.offset+(direction==='Next'?1:-1)*s.query.limit;if(offset<0||offset>10000)return;s.query={...s.query,offset};void loadList(s);});
  }
  get('twReportReload').addEventListener('click',()=>void loadDetail(true));
  return {
    show(next){active=true;current=next;closeDetail();for(const s of sections.values()){cancelList(s);s.root.hidden=!visible(s);if(visible(s))void loadList(s);}get('twReportsLimits').hidden=!['all','tw-daily','tw-weekly'].includes(next);},
    hide(){active=false;for(const s of sections.values())cancelList(s);closeDetail();}
  };
}
