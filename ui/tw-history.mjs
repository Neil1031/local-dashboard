import { message, setText, codeText } from './i18n.mjs';
import { validTwDate } from './tw-stocks.mjs';
const states = new Set(['READY', 'PARTIAL', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const itemWarnings = new Set('CLASSIFICATION_UNAVAILABLE|MARKET_DIAGNOSTICS_UNAVAILABLE|OBSERVATION_UNAVAILABLE|READINESS_UNAVAILABLE|SAVED_CANDIDATES_UNAVAILABLE|SAVED_FACT_UNKNOWN|SAVED_READINESS_REASON_UNKNOWN|SOURCE_COMPLETENESS_INCOMPLETE|STRATEGY_STATUS_UNKNOWN'.split('|'));
const warnings = new Set([...itemWarnings, ...'CLASSIFICATION_UNAVAILABLE|DATABASE_CHANGED_DURING_READ|DATABASE_MISSING|DATABASE_UNAVAILABLE|INPUT_INVALID|MARKET_DIAGNOSTICS_UNAVAILABLE|OBSERVATION_UNAVAILABLE|PAGE_PAYLOAD_SIZE_LIMIT|PAGINATION_OFFSET_LIMIT|RANGE_START_BEFORE_SOURCE_SCOPE|RANGE_TOO_LARGE|READINESS_UNAVAILABLE|RESULT_BEFORE_SOURCE_SCOPE|RESULT_IDENTITY_MISMATCH|RESULT_UNAVAILABLE|SAVED_CANDIDATES_UNAVAILABLE|SAVED_FACT_UNKNOWN|SAVED_READINESS_REASON_UNKNOWN|SCOPE_UNAVAILABLE|SOURCE_COMPLETENESS_INCOMPLETE|SOURCE_HEADERS_INVALID|SOURCE_HEADERS_MISMATCH|SOURCE_HEADERS_UNAVAILABLE|SOURCE_INVALID|SOURCE_SIZE_LIMIT|SOURCE_UNAVAILABLE|SQLITE_HEADER_INVALID|SQLITE_SIDECAR_UNSUPPORTED|SQLITE_WAL_UNSUPPORTED|STDOUT_SIZE_LIMIT|STRATEGY_STATUS_UNKNOWN|SOURCE_DISABLED|SOURCE_NOT_CONFIGURED|SOURCE_BUSY|SOURCE_TIMEOUT|SOURCE_INTERRUPTED|SOURCE_READ_FAILED|SOURCE_CONTRACT_UNSUPPORTED|SOURCE_INVALID_OUTPUT|SOURCE_OUTPUT_LIMIT|SOURCE_OUTPUT_ERROR'.split('|')]);
const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000;
const stamp = v => typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(v) && validTwDate(v.slice(0,10)) && Number.isFinite(Date.parse(v));
export function validTwRange(startDate, endDate) {
  if (!validTwDate(startDate) || !validTwDate(endDate)) return false;
  const days = (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000 + 1;
  return days >= 1 && days <= 366;
}
export function readTwHistory(p, q) {
  const check = ok => { if (!ok) throw new Error('INVALID_TW_HISTORY_RESPONSE'); };
  const enumValue = (v, allowed) => typeof v === 'string' && allowed.split('|').includes(v);
  const nullable = (v, valid) => v === null || valid(v);
  const codes = (v, allowed, max) => Array.isArray(v) && v.length <= max && new Set(v).size === v.length && v.every(w => allowed.has(w));
  check(validTwRange(q.startDate,q.endDate) && Number.isInteger(q.limit) && q.limit >= 1 && q.limit <= 50 && Number.isInteger(q.offset) && q.offset >= 0 && q.offset <= 10000);
  check(p?.contractVersion === 1 && p.sourceContractVersion === 'tw-history-range-v1' && p.source === 'taiwan-history' && states.has(p.dataState)
    && stamp(p.observedAt) && nullable(p.generatedAt,stamp) && p.provenance === 'SAVED_ACCUMULATION_RESULT_AND_MATCHING_SOURCE_HEADERS'
    && p.query?.operation === 'LIST' && p.query.requestedStartDate === q.startDate && p.query.requestedEndDate === q.endDate && p.query.limit === q.limit && p.query.offset === q.offset
    && codes(p.warnings,warnings,40) && Array.isArray(p.items) && p.items.length <= q.limit);
  check(p.scope === null || p.scope?.state === 'AVAILABLE' && p.scope.mode === 'DAILY_ACCUMULATION' && validTwDate(p.scope.startDate));
  if (['UNAVAILABLE','ERROR'].includes(p.dataState)) { check(p.items.length === 0 && p.page === null && p.warnings.length > 0); return p; }
  const page = p.page;
  check(stamp(p.generatedAt) && p.scope !== null && page?.limit === q.limit && page.offset === q.offset && page.returned === p.items.length && page.total === null && typeof page.hasMore === 'boolean');
  const next = q.offset + q.limit;
  check(page.hasMore && next <= 10000 ? page.nextOffset === next : page.nextOffset === null);
  check(!page.hasMore || p.items.length === q.limit);
  check(!page.hasMore || next <= 10000 || p.warnings.includes('PAGINATION_OFFSET_LIMIT'));
  check(p.dataState === 'EMPTY' ? !p.items.length && !page.hasMore : p.items.length > 0);
  check(p.dataState !== 'READY' || !p.warnings.length); check(p.dataState !== 'PARTIAL' || p.warnings.length > 0);
  const seen = new Set();
  for (const o of p.items) {
    check(validTwDate(o.targetDate) && o.targetDate >= q.startDate && o.targetDate <= q.endDate && o.targetDate >= p.scope.startDate
      && /^[0-9a-f]{32}$/.test(o.runId) && stamp(o.finishedAt) && o.observationId === 'tw-observation:' + o.targetDate + ':' + o.runId && !seen.has(o.observationId)); seen.add(o.observationId);
    check(enumValue(o.savedStatus,'SUCCESS|PARTIAL|FAILED|SKIPPED_NON_TRADING_DAY') && enumValue(o.classificationStatus,'WARMING_UP|OBSERVATIONS_AVAILABLE|UNAVAILABLE|NOT_APPLICABLE|NO_MARKET_DATA|UNKNOWN') && enumValue(o.strategyStatus,'OUT_OF_SCOPE|UNKNOWN'));
    check(nullable(o.candidateCount,count) && nullable(o.savedTotalCandidatesBeforeLimit,count) && nullable(o.savedCandidateTruncated,v=>typeof v === 'boolean'));
    if (o.candidateCount !== null && o.savedTotalCandidatesBeforeLimit !== null) check(o.savedTotalCandidatesBeforeLimit >= o.candidateCount && (o.savedCandidateTruncated === null || o.savedCandidateTruncated === (o.savedTotalCandidatesBeforeLimit > o.candidateCount)));
    check(o.detailRef?.contractVersion === 'tw-reports-v1' && o.detailRef.reportId === 'tw-daily:' + o.targetDate + ':' + o.runId);
    const c=o.sourceStatusCounts; check(c && Object.keys(c).length === 3 && ['SUCCESS','PARTIAL','FAILED'].every(k=>count(c[k])) && c.SUCCESS+c.PARTIAL+c.FAILED <=64);
    const r=o.readiness; check(r && nullable(r.warmingSymbols,count) && nullable(r.reasonCode,v=>enumValue(v,'BASELINE_SESSION_GAP|INSUFFICIENT_HISTORY|NO_ELIGIBLE_OBSERVATION_SYMBOLS|NO_MARKET_DATA|OBSERVATIONS_AVAILABLE|WARMING_UP')));
    check(r.skippedCounts === null || r.skippedCounts && typeof r.skippedCounts === 'object' && !Array.isArray(r.skippedCounts) && Object.entries(r.skippedCounts).every(([k,v])=>enumValue(k,'BASELINE_SESSION_GAP|BELOW_ANOMALY_THRESHOLD|INSUFFICIENT_HISTORY|ZERO_VOLUME_OR_RECENT_HALT') && nullable(v,count)));
    check(Array.isArray(o.markets) && o.markets.length === 2 && new Set(o.markets.map(m=>m.market)).size === 2);
    for (const m of o.markets) check(enumValue(m.market,'TWSE|TPEX') && nullable(m.complete,v=>typeof v === 'boolean') && ['expectedMasterSymbols','freshRows','unpricedUnknownCount','statusUnknownCount'].every(k=>nullable(m[k],count)) && nullable(m.quoteScopeStatus,v=>enumValue(v,'ABANDONED|FAILED|IMPORTED|NOT_CHECKED|NOT_DUE|NOT_REQUESTED|PARTIAL|RUNNING|SKIPPED_NON_TRADING_DAY|SUCCESS|UNAVAILABLE|UNKNOWN')));
    check(codes(o.projectionWarnings,itemWarnings,9) && o.projectionWarnings.every(w=>p.warnings.includes(w)));
  }
  return p;
}

/** TW subpage coordinator: Current keeps its existing contract and cached behavior. */
export function mountTwHistory(document, fetchSource, current) {
  const get=id=>document.getElementById(id), panel=get('twHistoryPanel');
  let active=false, subpage='current', loaded=false, pending=false, revision=0, controller, result=null;
  const today=new Date(), endDate=today.toISOString().slice(0,10); today.setUTCDate(today.getUTCDate()-6);
  let query={startDate:today.toISOString().slice(0,10),endDate,limit:20,offset:0};
  get('twHistoryStart').value=query.startDate; get('twHistoryEnd').value=query.endDate;
  const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!=null)setText(n,value);if(cls)n.className=cls;return n;};
  const facts=(root,entries)=>{const dl=node('dl',null,'signal-facts');for(const [key,value] of entries)dl.append(node('dt',message(key)),node('dd',value===null?message('evidence.unknown.0.no'):typeof value==='boolean'?message('common.codeLabel',{label:message(value?'common.yes':'common.no'),code:String(value)}):value));root.append(dl);};
  const counts=v=>v===null?message('evidence.unknown.0.no'):message('common.heldText',{text:Object.entries(v).map(([code,n])=>message('common.codeCount',{code:codeText(code),count:n===null?message('evidence.unknown.0.no'):n}))});
  function paging(){get('twHistoryPrevious').disabled=pending || query.offset===0;get('twHistoryNext').disabled=pending || !result?.page?.hasMore || result.page.nextOffset===null;}
  function clear(){result=null;for(const id of ['twHistoryRows','twHistoryWarnings','twHistoryProvenance','twHistoryScope','twHistoryPage'])get(id).replaceChildren();paging();}
  function render(p){
    result=p;setText(get('twHistoryStatus'),codeText(p.dataState));
    setText(get('twHistoryProvenance'),message('twHistory.provenance',{observedAt:p.observedAt,generatedAt:p.generatedAt===null?message('evidence.unknown.0.no'):p.generatedAt}));
    if(p.scope)setText(get('twHistoryScope'),message('twHistory.scope',{state:codeText(p.scope.state),mode:p.scope.mode,startDate:p.scope.startDate}));
    p.warnings.forEach(w=>get('twHistoryWarnings').append(node('li',codeText(w))));
    if(p.page)setText(get('twHistoryPage'),message('twHistory.page',{offset:p.page.offset,returned:p.page.returned}));
    if(p.dataState==='EMPTY')get('twHistoryRows').append(node('p',message('twHistory.empty')));
    if(p.page?.hasMore && p.page.nextOffset===null)get('twHistoryWarnings').append(node('li',message('twHistory.offsetLimit')));
    for(const o of p.items){
      const card=node('article',null,'tw-card tw-history-observation');card.dataset.observationId=o.observationId;card.append(node('h4',o.targetDate));
      facts(card,[['common.runId',o.runId],['evidence.saved.status',codeText(o.savedStatus)],['twHistory.classification',codeText(o.classificationStatus)],['twHistory.finished',o.finishedAt],['twHistory.candidates',o.candidateCount],['twHistory.totalCandidates',o.savedTotalCandidatesBeforeLimit],['twHistory.truncated',o.savedCandidateTruncated],['twHistory.sourceCounts',counts(o.sourceStatusCounts)],['evidence.warming.symbols',o.readiness.warmingSymbols],['twHistory.skipped',counts(o.readiness.skippedCounts)],['evidence.readiness.reason',codeText(o.readiness.reasonCode)],['twHistory.reportId',o.detailRef.reportId]]);
      if(o.classificationStatus==='WARMING_UP' && o.candidateCount===0)card.append(node('p',message('twHistory.warming')));
      for(const m of o.markets){card.append(node('h5',m.market));facts(card,[['evidence.complete',m.complete],['evidence.expected.symbols',m.expectedMasterSymbols],['evidence.freshRows',m.freshRows],['evidence.unpriced.unknown',m.unpricedUnknownCount],['evidence.status.unknown',m.statusUnknownCount],['tw-stocks.quote.scope',codeText(m.quoteScopeStatus)]]);}
      card.append(node('h5',message('twHistory.warnings')));const list=node('ul',null,'signal-warnings');o.projectionWarnings.forEach(w=>list.append(node('li',codeText(w))));card.append(list);get('twHistoryRows').append(card);
    }
    paging();
  }
  async function load(force=false){
    if(!active || subpage!=='history' || pending && !force)return;
    const ownRevision=++revision, requested={...query};controller?.abort();controller=new AbortController();const own=controller;
    pending=true;loaded=true;clear();panel.setAttribute('aria-busy','true');get('twHistoryStatus').setAttribute('role','status');setText(get('twHistoryStatus'),message('twHistory.loading'));
    const timeout=setTimeout(()=>own.abort(),35000);
    try{const params=new URLSearchParams(requested);const response=await fetchSource('/api/tw/history?'+params,{cache:'no-store',redirect:'error',signal:own.signal});if(!response.ok)throw Error('SOURCE_REQUEST_FAILED');const p=readTwHistory(await response.json(),requested);if(active && subpage==='history' && revision===ownRevision)render(p);}
    catch{if(active && subpage==='history' && revision===ownRevision){clear();setText(get('twHistoryStatus'),message('twHistory.error'));get('twHistoryStatus').setAttribute('role','alert');}}
    finally{clearTimeout(timeout);if(revision===ownRevision){pending=false;panel.setAttribute('aria-busy','false');paging();}}
  }
  function suspend(){if(pending){++revision;controller?.abort();pending=false;loaded=false;clear();panel.setAttribute('aria-busy','false');setText(get('twHistoryStatus'),'');}}
  function select(next){if(next===subpage)return;subpage=next;get('twCurrentPanel').hidden=next!=='current';panel.hidden=next!=='history';get('twCurrentTab').setAttribute('aria-pressed',String(next==='current'));get('twHistoryTab').setAttribute('aria-pressed',String(next==='history'));if(next==='current'){suspend();if(active)current.show();}else{current.hide();if(active && !loaded)void load();}}
  get('twCurrentTab').addEventListener('click',()=>select('current'));get('twHistoryTab').addEventListener('click',()=>select('history'));
  get('twHistoryFilter').addEventListener('submit',e=>{e.preventDefault();const startDate=get('twHistoryStart').value,endDate=get('twHistoryEnd').value;if(!validTwRange(startDate,endDate)){setText(get('twHistoryValidation'),message('twHistory.validation'));get('twHistoryStart').focus();return;}setText(get('twHistoryValidation'),'');query={startDate,endDate,limit:20,offset:0};void load(true);});
  get('twHistoryRefresh').addEventListener('click',()=>void load());
  get('twHistoryPrevious').addEventListener('click',()=>{if(query.offset>0 && !pending){query={...query,offset:Math.max(0,query.offset-query.limit)};void load();}});
  get('twHistoryNext').addEventListener('click',()=>{if(result?.page?.hasMore && result.page.nextOffset!==null && !pending){query={...query,offset:result.page.nextOffset};void load();}});
  return {show(){if(active)return;active=true;if(subpage==='current')current.show();else if(!loaded)void load();},hide(){if(!active)return;active=false;current.hide();suspend();}};
}
