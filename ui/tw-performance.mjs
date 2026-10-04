import { message, setText, codeText } from './i18n.mjs';
import { validTwDate } from './tw-stocks.mjs';
import { validTwRange } from './tw-history.mjs';
const states = ['READY','PARTIAL','EMPTY','UNAVAILABLE','ERROR'];
const reasons = ["CALENDAR_COVERAGE_INSUFFICIENT","CALENDAR_DATE_MISSING","CALENDAR_ALIAS_CONFLICT","CALENDAR_RECORD_INVALID","REFERENCE_NOT_TRADING_SESSION","SESSION_NOT_YET_DUE","OFFICIAL_PRICE_MISSING","PRICE_IDENTITY_AMBIGUOUS","PRICE_VALUE_INVALID","PRICE_TIMESTAMP_INVALID","OFFICIAL_PRICE_LINEAGE_MISMATCH","HISTORICAL_MARKET_UNVERIFIED","PRICE_RECEIPT_BUDGET_EXCEEDED","OFFICIAL_PRICE_RECEIPT_UNAVAILABLE","OFFICIAL_CLOSE_OBSERVED","OFFICIAL_PRICE_PROVENANCE_UNAVAILABLE","REFERENCE_CLOSE_UNAVAILABLE","RETURN_VALUE_INVALID"];
const warnings = ["INPUT_INVALID","RANGE_TOO_LARGE","RESULT_TIMESTAMP_INVALID","RESULT_BEFORE_SOURCE_SCOPE","SOURCE_SIZE_LIMIT","RESULT_PAYLOAD_BUDGET_EXCEEDED","RESULT_IDENTITY_MISMATCH","SAVED_CANDIDATES_UNAVAILABLE","OBSERVATION_READ_BUDGET_EXCEEDED","LINEAGE_PAYLOAD_BUDGET_EXCEEDED","RANGE_START_BEFORE_SOURCE_SCOPE","OBSERVATION_PRICE_EVIDENCE_INCOMPLETE","PAGINATION_OFFSET_LIMIT","SCOPE_UNAVAILABLE","SOURCE_HEADERS_UNAVAILABLE","SOURCE_HEADERS_INVALID","SOURCE_HEADERS_MISMATCH","DATABASE_MISSING","DATABASE_UNAVAILABLE","SQLITE_SIDECAR_UNSUPPORTED","SQLITE_HEADER_INVALID","SQLITE_WAL_UNSUPPORTED","DATABASE_CHANGED_DURING_READ","SOURCE_UNAVAILABLE","SOURCE_INVALID","STDOUT_SIZE_LIMIT"].concat('SOURCE_DISABLED|SOURCE_NOT_CONFIGURED|SOURCE_BUSY|SOURCE_TIMEOUT|SOURCE_INTERRUPTED|SOURCE_READ_FAILED|SOURCE_CONTRACT_UNSUPPORTED|SOURCE_INVALID_OUTPUT|SOURCE_OUTPUT_LIMIT|SOURCE_OUTPUT_ERROR'.split('|'));
const semantics = {"purpose":"OBSERVATION_RESEARCH_EVIDENCE","priceBasis":"CURRENT_SAVED_OFFICIAL_UNADJUSTED_CLOSE","formula":"(horizonClose / referenceClose - 1) * 100","dueClock":"CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI","priceFinalityClock":"CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI","crossPageSnapshot":false,"historicalPIT":false,"interpretationLimits":["referenceClose is not execution price","observed return is not realized P&L","positive return is not BUY success","negative return is not SELL signal","source anomaly score is not investment score","null is not zero","missing price is not 0% return","NOT_YET_DUE is not failure","PRICE_UNAVAILABLE is not flat return","unadjusted closes do not adjust corporate actions or dividends","normal regular trading ends at 13:30 Taipei","closing may be postponed, so this contract waits until 13:33 Taipei","the conservative availability gate is not finality proof for every extraordinary market condition"]};
const stamp = v => {
  if(typeof v!=='string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(v) || !validTwDate(v.slice(0,10)))return false;
  const offset=v.endsWith('Z')?null:v.slice(-6);
  return Number(v.slice(11,13))<=23 && Number(v.slice(14,16))<=59 && Number(v.slice(17,19))<=59 && (!offset || Number(offset.slice(1,3))<=18 && Number(offset.slice(4,6))<=59 && (Number(offset.slice(1,3))<18 || offset.slice(4,6)==='00')) && Number.isFinite(Date.parse(v));
};
const numeric = v => typeof v === 'number' && Number.isFinite(v);
const price = v => numeric(v) && v > 0;
const id = v => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const shape = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys.split(',').sort().join(',');
const nullable = (v, test) => v === null || test(v);
const codes = (v, allowed, max) => Array.isArray(v) && v.length <= max && new Set(v).size === v.length && v.every(c=>allowed.includes(c));
const same = (a,b) => Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v,i)=>same(v,b[i])) : a !== null && typeof a === 'object' ? shape(b,Object.keys(a).join(',')) && Object.keys(a).every(k=>same(a[k],b[k])) : a === b;
const provenance = v => shape(v,'authority,officialSource,priceObservedAt,marketObservedAt,priceRefreshedAt,sourceStartedAt,sourceFinishedAt,priceSourceRunId,sourceStatus') && v.authority === 'daily_price' && v.officialSource === 'TWSE_TPEX_OFFICIAL:market-data' && ['priceObservedAt','marketObservedAt','priceRefreshedAt','sourceStartedAt','sourceFinishedAt'].every(k=>stamp(v[k])) && id(v.priceSourceRunId) && ['SUCCESS','PARTIAL'].includes(v.sourceStatus);
export function readTwPerformance(p,q) {
  const check = v => { if(!v) throw Error('INVALID_TW_PERFORMANCE_RESPONSE'); };
  check(validTwRange(q.startDate,q.endDate) && Number.isInteger(q.limit) && q.limit>=1 && q.limit<=50 && Number.isInteger(q.offset) && q.offset>=0 && q.offset<=10000);
  check(shape(p,'contractVersion,sourceContractVersion,source,dataState,observedAt,generatedAt,provenance,query,scope,items,page,semantics,warnings'));
  check(p.contractVersion===1 && p.sourceContractVersion==='tw-observed-performance-v1' && p.source==='taiwan-performance' && states.includes(p.dataState) && stamp(p.observedAt) && nullable(p.generatedAt,stamp) && p.provenance==='CURRENT_SAVED_OFFICIAL_CLOSE_RESEARCH_EVIDENCE' && same(semantics,p.semantics));
  check(shape(p.query,'operation,requestedStartDate,requestedEndDate,limit,offset') && p.query.operation==='LIST' && p.query.requestedStartDate===q.startDate && p.query.requestedEndDate===q.endDate && p.query.limit===q.limit && p.query.offset===q.offset);
  check(codes(p.warnings,warnings,40) && Array.isArray(p.items) && p.items.length<=q.limit);
  check(p.scope===null || shape(p.scope,'state,mode,startDate') && p.scope.state==='AVAILABLE' && p.scope.mode==='DAILY_ACCUMULATION' && validTwDate(p.scope.startDate));
  if(['UNAVAILABLE','ERROR'].includes(p.dataState)) { check(!p.items.length && p.page===null && p.warnings.length>0); return p; }
  check(stamp(p.generatedAt) && p.scope!==null && shape(p.page,'limit,offset,returned,hasMore,nextOffset,total'));
  const page=p.page,next=q.offset+q.limit;
  check(page.limit===q.limit && page.offset===q.offset && page.returned===p.items.length && page.total===null && typeof page.hasMore==='boolean');
  check(page.hasMore && next<=10000 ? page.nextOffset===next : page.nextOffset===null);
  check(!page.hasMore || p.items.length===q.limit);
  check(!page.hasMore || next<=10000 || p.warnings.includes('PAGINATION_OFFSET_LIMIT'));
  check(p.dataState==='EMPTY' ? !p.items.length && !page.hasMore : p.items.length>0);
  check(p.dataState!=='READY' || !p.warnings.length); check(p.dataState!=='PARTIAL' || p.warnings.length>0);
  const seen=new Set();
  for(const o of p.items) {
    check(shape(o,'itemId,targetDate,runId,symbol,market,observationFinishedAt,savedStatus,referenceClose,referenceState,referenceReasonCode,referenceProvenance,calendarMarketsUsed,horizons'));
    check(validTwDate(o.targetDate) && o.targetDate>=q.startDate && o.targetDate<=q.endDate && o.targetDate>=p.scope.startDate && id(o.runId) && typeof o.symbol==='string' && /^[A-Za-z0-9]{1,16}$/.test(o.symbol) && ['TWSE','TPEX'].includes(o.market) && stamp(o.observationFinishedAt) && ['SUCCESS','PARTIAL','FAILED','SKIPPED_NON_TRADING_DAY'].includes(o.savedStatus));
    check(o.itemId==='tw-candidate:'+o.targetDate+':'+o.runId+':'+o.symbol && !seen.has(o.itemId));seen.add(o.itemId);
    check(nullable(o.referenceClose,price) && ['OBSERVED','NOT_YET_DUE','PRICE_UNAVAILABLE','CALENDAR_UNAVAILABLE'].includes(o.referenceState) && reasons.includes(o.referenceReasonCode) && nullable(o.referenceProvenance,provenance) && codes(o.calendarMarketsUsed,['TWSE','SII','LISTED','TPEX','OTC','TW',''],5));
    const observed=o.referenceState==='OBSERVED';
    check(observed ? o.referenceClose!==null && o.referenceProvenance!==null && o.referenceReasonCode==='OFFICIAL_CLOSE_OBSERVED' : o.referenceClose===null && o.referenceProvenance===null);
    check(Array.isArray(o.horizons) && o.horizons.length===5);
    for(let i=0;i<5;i++) {
      const h=o.horizons[i];
      check(shape(h,'sessionCount,expectedDate,close,returnPercent,state,reasonCode,dueAt,provenance') && h.sessionCount===[1,3,5,10,20][i] && nullable(h.expectedDate,validTwDate) && nullable(h.close,price) && nullable(h.returnPercent,numeric) && ['OBSERVED','NOT_YET_DUE','PRICE_UNAVAILABLE','CALENDAR_UNAVAILABLE'].includes(h.state) && reasons.includes(h.reasonCode) && nullable(h.dueAt,stamp) && nullable(h.provenance,provenance));
      if(h.state==='OBSERVED') check(h.expectedDate!==null && h.close!==null && h.returnPercent!==null && h.dueAt!==null && h.provenance!==null && h.reasonCode==='OFFICIAL_CLOSE_OBSERVED');
      if(h.state==='NOT_YET_DUE') check(h.expectedDate!==null && h.dueAt!==null && h.close===null && h.returnPercent===null && h.provenance===null && h.reasonCode==='SESSION_NOT_YET_DUE');
      if(h.state==='CALENDAR_UNAVAILABLE') check(['expectedDate','close','returnPercent','dueAt','provenance'].every(k=>h[k]===null));
      if(h.state==='PRICE_UNAVAILABLE') check(h.expectedDate!==null && h.dueAt!==null && h.returnPercent===null);
      check(observed || h.returnPercent===null);
    }
  }
  return p;
}

/** Source-separated coordinator. Each source retains its own loaded range/page. */
export function mountTwPerformance(document,fetchSource,us) {
  const get=id=>document.getElementById(id),panel=get('twPerformancePanel');
  let active=false,source='us',loaded=false,pending=false,revision=0,controller,result=null;
  const now=new Date(),endDate=now.toISOString().slice(0,10);now.setUTCDate(now.getUTCDate()-6);
  let query={startDate:now.toISOString().slice(0,10),endDate,limit:20,offset:0};
  get('twPerformanceStart').value=query.startDate;get('twPerformanceEnd').value=query.endDate;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)setText(n,text);if(cls)n.className=cls;return n;};
  const facts=(root,entries)=>{const dl=node('dl',null,'signal-facts');for(const [key,value] of entries)dl.append(node('dt',message(key)),node('dd',value===null?message('evidence.unknown.0.no'):value));root.append(dl);};
  const priceFacts=(root,p)=>{if(!p)return;facts(root,Object.entries(p).map(([k,v])=>['twPerformance.'+k,k==='sourceStatus'?codeText(v):v]));};
  function paging(){get('twPerformancePrevious').disabled=pending || query.offset===0;get('twPerformanceNext').disabled=pending || !result?.page?.hasMore || result.page.nextOffset===null;}
  function clear(){result=null;for(const id of ['twPerformanceRows','twPerformanceWarnings','twPerformanceProvenance','twPerformanceScope','twPerformancePage'])get(id).replaceChildren();paging();}
  function render(p) {
    result=p;setText(get('twPerformanceStatus'),codeText(p.dataState));
    setText(get('twPerformanceProvenance'),message('twPerformance.provenance',{observedAt:p.observedAt,generatedAt:p.generatedAt===null?message('evidence.unknown.0.no'):p.generatedAt}));
    if(p.scope)setText(get('twPerformanceScope'),message('twHistory.scope',{state:codeText(p.scope.state),mode:p.scope.mode,startDate:p.scope.startDate}));
    p.warnings.forEach(w=>get('twPerformanceWarnings').append(node('li',codeText(w))));
    if(p.page)setText(get('twPerformancePage'),message('twHistory.page',{offset:p.page.offset,returned:p.page.returned}));
    if(p.dataState==='EMPTY')get('twPerformanceRows').append(node('p',message('twPerformance.empty')));
    if(p.page?.hasMore && p.page.nextOffset===null)get('twPerformanceWarnings').append(node('li',message('twHistory.offsetLimit')));
    for(const o of p.items) {
      const card=node('article',null,'tw-card tw-performance-observation');card.dataset.itemId=o.itemId;card.append(node('h4',o.targetDate+' · '+o.symbol+' · '+o.market));
      facts(card,[['twPerformance.itemId',o.itemId],['common.runId',o.runId],['evidence.saved.status',codeText(o.savedStatus)],['twPerformance.observationFinishedAt',o.observationFinishedAt],['twPerformance.referenceClose',o.referenceClose],['twPerformance.referenceState',codeText(o.referenceState)],['twPerformance.referenceReasonCode',codeText(o.referenceReasonCode)],['twPerformance.calendarMarketsUsed',JSON.stringify(o.calendarMarketsUsed)]]);
      card.append(node('h5',message('twPerformance.referenceProvenance')));priceFacts(card,o.referenceProvenance);
      for(const h of o.horizons) {
        const part=node('section',null,'tw-performance-horizon');part.dataset.sessionCount=h.sessionCount;part.append(node('h5',message('twPerformance.horizon',{count:h.sessionCount})));
        facts(part,[['twPerformance.expectedDate',h.expectedDate],['twPerformance.close',h.close],['twPerformance.returnPercent',h.returnPercent===null?null:message('twPerformance.percent',{value:h.returnPercent})],['twPerformance.state',codeText(h.state)],['twPerformance.reasonCode',codeText(h.reasonCode)],['twPerformance.dueAt',h.dueAt]]);
        priceFacts(part,h.provenance);card.append(part);
      }
      get('twPerformanceRows').append(card);
    }
    paging();
  }
  async function load(force=false) {
    if(!active || source!=='tw' || pending && !force)return;
    const ownRevision=++revision,requested={...query};controller?.abort();controller=new AbortController();const own=controller;
    pending=true;loaded=true;clear();panel.setAttribute('aria-busy','true');get('twPerformanceStatus').setAttribute('role','status');setText(get('twPerformanceStatus'),message('twPerformance.loading'));
    const timeout=setTimeout(()=>own.abort(),35000);
    try{const response=await fetchSource('/api/tw/performance?'+new URLSearchParams(requested),{cache:'no-store',redirect:'error',signal:own.signal});if(!response.ok)throw Error();const p=readTwPerformance(await response.json(),requested);if(active && source==='tw' && revision===ownRevision)render(p);}
    catch{if(active && source==='tw' && revision===ownRevision){clear();setText(get('twPerformanceStatus'),message('twPerformance.error'));get('twPerformanceStatus').setAttribute('role','alert');}}
    finally{clearTimeout(timeout);if(revision===ownRevision){pending=false;panel.setAttribute('aria-busy','false');paging();}}
  }
  function suspend(){if(pending){++revision;controller?.abort();pending=false;loaded=false;clear();panel.setAttribute('aria-busy','false');setText(get('twPerformanceStatus'),'');}}
  function select(next){if(next===source)return;source=next;get('performanceUsPanel').hidden=next!=='us';panel.hidden=next!=='tw';get('performanceUsTab').setAttribute('aria-pressed',String(next==='us'));get('performanceTwTab').setAttribute('aria-pressed',String(next==='tw'));us.show(active && next==='us'?'performance':'');if(next==='us')suspend();else if(active && !loaded)void load();}
  get('performanceUsTab').addEventListener('click',()=>select('us'));get('performanceTwTab').addEventListener('click',()=>select('tw'));
  get('twPerformanceFilter').addEventListener('submit',e=>{e.preventDefault();const startDate=get('twPerformanceStart').value,endDate=get('twPerformanceEnd').value;if(!validTwRange(startDate,endDate)){setText(get('twPerformanceValidation'),message('twHistory.validation'));get('twPerformanceStart').focus();return;}setText(get('twPerformanceValidation'),'');query={startDate,endDate,limit:20,offset:0};void load(true);});
  get('twPerformanceRefresh').addEventListener('click',()=>void load());
  get('twPerformancePrevious').addEventListener('click',()=>{if(query.offset>0 && !pending){query={...query,offset:Math.max(0,query.offset-query.limit)};void load();}});
  get('twPerformanceNext').addEventListener('click',()=>{if(result?.page?.hasMore && result.page.nextOffset!==null && !pending){query={...query,offset:result.page.nextOffset};void load();}});
  return {show(page){const next=page==='performance';if(next===active)return;active=next;us.show(active && source==='us'?'performance':'');if(active && source==='tw' && !loaded)void load();if(!active)suspend();}};
}
