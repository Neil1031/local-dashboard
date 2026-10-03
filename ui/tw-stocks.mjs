import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
const states = new Set(['COHERENT', 'PARTIAL', 'UNAVAILABLE', 'ERROR']);
const text = v => isMessage(v) ? String(v) : v == null ? 'UNKNOWN / —' : String(v).replace(/(?:file:\/\/[^\s<>"']+|[a-z]:[\\/][^\s<>"']+|\\\\[^\s<>"']+|(?<![\w:])\/(?:[^\s/]+\/)+[^\s<>"']*)/gi, '[local path omitted]');
export function validTwDate(s) {
  return typeof s === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) && !s.startsWith('0000-')
    && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}
export function readTwStocks(p, date = null) {
  const reject = () => { throw new Error('INVALID_TW_RESPONSE'); };
  if (p?.contractVersion !== 1 || p.sourceContractVersion !== 'tw-daily-accumulation-v1' || !states.has(p.dataState)
      || !Number.isFinite(Date.parse(p.observedAt)) || !Array.isArray(p.warnings) || !p.warnings.every(s => typeof s === 'string')
      || p.query?.mode !== (date == null ? 'LATEST_FINALIZED' : 'TARGET_DATE') || p.query.targetDate !== date) reject();
  if (p.snapshot === null) {
    if (!['ERROR', 'UNAVAILABLE'].includes(p.dataState) || ['scope','latestAttempt','latestFinalized','observation','responsibility','weeklyCheck'].some(k => p[k] !== null)) reject();
    return p;
  }
  if (p.snapshot?.state !== p.dataState || p.snapshot.readOnly !== true || !Array.isArray(p.snapshot.reasonCodes)
      || !p.scope || !p.responsibility || !p.weeklyCheck || !Number.isFinite(Date.parse(p.generatedAt))) reject();
  if (p.observation !== null) {
    const o = p.observation;
    if (!/^[0-9a-f]{32}$/.test(o.runId) || !validTwDate(o.targetDate) || o.identity?.runId !== o.runId || o.identity.targetDate !== o.targetDate
        || (date !== null && o.targetDate !== date) || ['runId','targetDate','finishedAt','status'].some(k => p.latestFinalized?.[k] !== o[k])
        || !Array.isArray(o.candidates) || o.candidates.length > 5000 || o.candidateSummary?.exportedCount !== o.candidates.length
        || !Array.isArray(o.sources) || !Array.isArray(o.markets) || !o.readiness || !o.baselineSessionDiagnostics || !o.mappingDiagnostics) reject();
    const symbols = new Set();
    for (const c of o.candidates) {
      if (!/^[A-Za-z0-9]{1,16}$/.test(c.symbol) || symbols.has(c.symbol) || c.signalDate !== o.targetDate || !['TWSE','TPEX'].includes(c.market)
          || c.analysisEligible !== null || c.analysisEligibleSemantics !== 'NOT_APPLICABLE_DAILY_OBSERVATION'
          || !c.publicInfoCheck || !Array.isArray(c.riskFlags)) reject();
      symbols.add(c.symbol);
    }
  } else if (p.latestFinalized !== null || p.dataState === 'COHERENT') reject();
  return p;
}

export function mountTwStocks(document, fetchSource = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), panel = get('twView'), dialog = get('twCandidateDetail');
  let active = false, loaded = false, pending = false, date = null, revision = 0, controller, returnFocus;
  const node = (tag, value, cls) => { const n = document.createElement(tag); if (value != null) setText(n, value, text); if (cls) n.className = cls; return n; };
  const fact = (list, label, v) => list.append(node('dt', label), node('dd', v == null ? 'UNKNOWN / —' : v));
  const facts = (root, entries) => { const dl = node('dl', null, 'signal-facts'); entries.forEach(([label, v]) => fact(dl, label, v)); root.append(dl); };
  const counts = v => v == null ? codeText('UNKNOWN') : Object.keys(v).length
    ? message('common.heldText', { text: Object.entries(v).map(([k,n]) => message('common.codeCount', { code: codeText(k), count: n })) }) : message("tw-stocks.0");
  const values = v => v == null ? 'UNKNOWN' : v.length ? v.join(' · ') : message("tw-stocks.0");
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('twCandidateClose').addEventListener('click', close);
  function clear() { close(); for (const id of ['twDaily','twAccumulation','twSources','twCandidates','twResponsibility','twWeekly','twWarnings','twCandidateBody']) setText(get(id), ''); }
  function detail(c, trigger) {
    returnFocus = trigger; setText(get('twCandidateTitle'), message("display.wording.4", { value0: text(c.symbol), value1: text(c.stockName) }));
    const body = get('twCandidateBody'); body.replaceChildren();
    facts(body, [[message("evidence.market"),c.market],[message("tw-stocks.signal.date"),c.signalDate],[message("tw-stocks.wording"),c.classification],[message("tw-stocks.wording.2"),c.classificationBasis],[message("automations.coverage"),codeText(c.coverageStatus)],
      [message("tw-stocks.anomaly.rank"),c.anomalyRank],[message("tw-stocks.anomaly.score"),c.anomalyScore],[message("tw-stocks.volume.ratio"),c.volumeRatio],[message("tw-stocks.volume.z.score"),c.volumeZscore],[message("tw-stocks.baseline.volume"),c.baselineVolume],[message("tw-stocks.risk.flags"),values(c.riskFlags)]]);
    body.append(node('h3',message("tw-stocks.public.info.source.check")));
    facts(body, [[message("common.status"),codeText(c.publicInfoCheck.status)],[message("tw-stocks.record.exists"),c.publicInfoCheck.recordExists],[message("reason.SOURCE_SUCCESS"),c.publicInfoCheck.succeeded],[message("evidence.checked.at"),c.publicInfoCheck.checkedAt],[message("tw-stocks.as.of"),c.publicInfoCheck.asOf],[message("automations.coverage"),codeText(c.publicInfoCheck.coverageStatus)],[message("common.reason"),codeText(c.publicInfoCheck.reasonCode)]]);
    body.append(node('p',message("tw-stocks.success.eligibility.null")));
    dialog.showModal(); get('twCandidateClose').focus();
  }
  function render(p) {
    setText(get('twStatus'), message('common.stateNotice', { state: codeText(p.dataState), notice: p.dataState === 'COHERENT' ? message('tw-stocks.wording.3') : p.dataState === 'PARTIAL' ? message('tw.status.partial') : message('tw.status.unavailable') }));
    setText(get('twProvenance'), message("tw-stocks.dashboard.read.source.generated", { value0: p.query.mode, value1: date ? ` · ${date}` : '', value2: text(p.observedAt), value3: text(p.generatedAt) }));
    p.warnings.forEach(w => get('twWarnings').append(node('li',w)));
    if (p.snapshot === null) return;
    const o = p.observation, attempt = p.latestAttempt, finalized = p.latestFinalized;
    for (const [title, entries] of [[message("evidence.latest.attempt"), [[message("common.runId"),attempt?.runId],[message("evidence.state"),codeText(attempt?.state)],[message("common.status"),codeText(attempt?.status)],[message("common.createdAt"),attempt?.createdAt],[message("tw-stocks.started.at"),attempt?.startedAt],[message("tw-stocks.finished.at"),attempt?.finishedAt],[message("tw-stocks.scheduled.dates"),values(attempt?.scheduledDates)],[message("evidence.business.finalized"),attempt?.businessFinalized]]],
      [message("tw-stocks.latest.finalized"), [[message("evidence.target.date"),finalized?.targetDate],[message("common.runId"),finalized?.runId],[message("evidence.saved.status"),codeText(finalized?.status)],[message("tw-stocks.saved.finished.at"),finalized?.finishedAt],[message("tw-stocks.classification.readiness"),codeText(o?.classificationStatus)]]]]) {
      const card = node('article',null,'tw-card'); card.append(node('h3',title)); facts(card,entries); get('twDaily').append(card);
    }
    facts(get('twAccumulation'), [[message("evidence.scope.state"),codeText(p.scope.state)],[message("evidence.scope.mode"),p.scope.mode],[message("tw-stocks.accumulation.start"),p.scope.startDate]]);
    if (!o) { get('twCandidates').append(node('p',message("tw-stocks.unavailable.daily.observation"))); get('twAccumulation').append(node('p',message("tw-stocks.readiness.unavailable.daily.observation.scope"))); }
    else {
      facts(get('twAccumulation'), [[message("tw.readiness"),codeText(o.classificationStatus)],[message("tw.skippedCounts"),counts(o.readiness.skippedCounts)],[message("evidence.warming.symbols"),o.readiness.warmingSymbols],[message("tw.pendingSourceNews"),values(o.readiness.pendingCandidateNews)],[message("evidence.readiness.reason"),codeText(o.readiness.reasonCode)],[message("evidence.baselineState"),codeText(o.baselineSessionDiagnostics.state)],[message("evidence.mappingState"),codeText(o.mappingDiagnostics.state)],[message("tw-stocks.unmapped.symbols"),values(o.mappingDiagnostics.unmappedSymbols)],[message("tw-stocks.recognized.exclusions"),o.mappingDiagnostics.recognizedExclusions == null ? null : o.mappingDiagnostics.recognizedExclusions.length]]);
      if (o.baselineSessionDiagnostics.records.length) {
        const d = node('details'); d.append(node('summary',message("tw-stocks.saved.baseline.diagnostics", { value0: o.baselineSessionDiagnostics.records.length })));
        for (const b of o.baselineSessionDiagnostics.records) facts(d,[[message("evidence.symbol"),b.symbol],[message("evidence.state"),codeText(b.status)],[message("common.reason"),codeText(b.reasonCode)],[message("evidence.reason.date"),b.reasonDate],[message("evidence.lower.bound"),b.lowerBound],[message("evidence.expected.dates"),values(b.expectedDates)],[message("evidence.actual.dates"),values(b.actualDates)],[message("evidence.missing.dates"),values(b.missingDates)]]);
        get('twAccumulation').append(d);
      }
      if (o.mappingDiagnostics.recognizedExclusions?.length) {
        const d = node('details'); d.append(node('summary',message("tw-stocks.source.backed.recognized.exclusions")));
        o.mappingDiagnostics.recognizedExclusions.forEach(e=>facts(d,[[message("evidence.symbol"),e.symbol],[message("evidence.market"),e.market],[message("common.source"),e.source],[message("evidence.source.date"),e.sourceDate],[message("common.reason"),codeText(e.reasonCode)]])); get('twAccumulation').append(d);
      }
      for (const s of o.sources) { const card = node('article',null,'tw-card'); card.append(node('h3',message("display.wording.4", { value0: s.name, value1: s.status }))); facts(card,[[message("automations.started"),s.startedAt],[message("evidence.finished"),s.finishedAt],[message("common.reason"),codeText(s.reasonCode)]]); get('twSources').append(card); }
      if (!o.sources.length) get('twSources').append(node('p',message("tw-stocks.source.headers.reason.codes")));
      for (const m of o.markets) { const card=node('article',null,'tw-card');card.append(node('h3',message("tw-stocks.saved.completeness", { value0: m.market })));facts(card,[[message("evidence.complete"),m.complete],[message("evidence.rows"),m.rows],[message("evidence.expected.symbols"),m.expectedMasterSymbols],[message("evidence.freshRows"),m.freshRows],[message("evidence.unpriced.unknown"),m.unpricedUnknownCount],[message("evidence.status.unknown"),m.statusUnknownCount],[message("tw-stocks.quote.scope"),codeText(m.quoteScopeStatus)],[message("evidence.quote.scope.complete"),m.quoteScopeComplete]]);get('twSources').append(card); }
      const summary = o.candidateSummary;
      get('twCandidates').append(node('p',message("tw-stocks.metadata.saved.count.saved.total.truncated.exported", { value0: summary.state, value1: text(summary.savedCandidateCount), value2: text(summary.savedTotalCandidatesBeforeLimit), value3: text(summary.savedTruncated), value4: summary.exportedCount })));
      if (!o.candidates.length) get('twCandidates').append(node('p',o.classificationStatus === 'WARMING_UP' ? message("tw.noCandidatesWarming") : message("tw.noCandidates"),'tw-empty'));
      for (const c of o.candidates) {
        const card=node('article',null,'tw-card tw-candidate'); const trigger=node('button',message("display.wording.4", { value0: c.symbol, value1: text(c.stockName) }),'tw-candidate-open');trigger.type='button';trigger.addEventListener('click',()=>detail(c,trigger));card.append(trigger);
        facts(card,[[message("tw-stocks.market.date"),`${c.market} · ${c.signalDate}`],[message("evidence.classification"),c.classification],[message("automations.coverage"),codeText(c.coverageStatus)],[message("tw-stocks.anomaly.score"),c.anomalyScore],[message("tw-stocks.anomaly.rank"),c.anomalyRank]]);get('twCandidates').append(card);
      }
    }
    const responsibility = p.responsibility;
    facts(get('twResponsibility'),[[message("evidence.state"),codeText(responsibility.state)],[message("tw-stocks.pending.revalidation.count"),responsibility.pendingCount],[message("tw-stocks.unfinished.run.count"),responsibility.unfinishedCount],[message("tw-stocks.truncated.totals.may.be.unknown"),responsibility.truncated]]);
    if (responsibility.state === 'UNKNOWN') get('twResponsibility').append(node('p',message("tw-stocks.journal.unknown.0")));
    if (responsibility.pendingRevalidation?.length || responsibility.unfinishedRuns?.length) {
      const d=node('details');d.append(node('summary',message("tw-stocks.wording.4")));
      responsibility.pendingRevalidation?.forEach(r=>facts(d,[[message("evidence.target.date"),r.targetDate],[message("tw-stocks.origin.run"),r.originRunId],[message("evidence.required.at"),r.requiredAt]]));
      responsibility.unfinishedRuns?.forEach(r=>facts(d,[[message("common.runId"),r.runId],[message("evidence.state"),codeText(r.state)],[message("evidence.relevant.dates"),values(r.relevantTargetDates)]]));get('twResponsibility').append(d);
    }
    const w=p.weeklyCheck;
    get('twWeekly').append(node('p',message("tw-stocks.weekly.check.run.id.failed.daily.observation")));
    facts(get('twWeekly'),[[message("evidence.state"),codeText(w.state)],[message("evidence.check.run.id"),w.checkRunId],[message("evidence.checked.at"),w.checkedAt],[message("evidence.week.start"),w.weekStart],[message("evidence.week.end"),w.weekEnd],[message("common.status"),codeText(w.status)],[message("tw-stocks.problems"),w.problemCount],[message("tw-stocks.day.counts"),counts(w.dayStatusCounts)],[message("evidence.pendingRevalidation"),w.pendingRevalidationCount],[message("evidence.unfinishedRuns"),w.unfinishedRunCount],[message("tw-stocks.binding"),w.binding],[message("tw-stocks.pointer.corroboration"),w.pointerState]]);
    get('twWeekly').append(node('p',w.binding==='SELECTED_RESULT' ? message("tw-stocks.selected.result.binding.weekly.daily") : message("tw-stocks.daily.weekly.summary")));
  }
  async function load(force=false) {
    if (pending && !force) return;
    ++revision; const current=revision, requested=date; controller?.abort(); controller=new AbortController();const own=controller;
    pending=true;loaded=true; clear();panel.setAttribute('aria-busy','true');get('twStatus').setAttribute('role','status');setText(get('twStatus'), message("tw-stocks.loading"));setText(get('twProvenance'), '');
    const timeout=setTimeout(()=>own.abort(),35000);
    try {
      const response=await fetchSource(`/api/tw/stocks${requested == null ? '' : `?date=${encodeURIComponent(requested)}`}`,{cache:'no-store',redirect:'error',signal:own.signal});
      if(!response.ok)throw new Error('SOURCE_REQUEST_FAILED');const payload=readTwStocks(await response.json(),requested);
      if(active && revision===current)render(payload);
    } catch {
      if(active && revision===current){clear();setText(get('twStatus'), message("tw-stocks.error.tw.stocks"));get('twStatus').setAttribute('role','alert');}
    } finally {clearTimeout(timeout);if(revision===current){pending=false;panel.setAttribute('aria-busy','false');}}
  }
  get('twFilter').addEventListener('submit',e=>{e.preventDefault();const value=get('twDate').value;if(!validTwDate(value)){setText(get('twValidation'), message("tw-stocks.yyyy.mm.dd.0001.9999"));get('twDate').focus();return;}setText(get('twValidation'), '');date=value;void load(true);});
  get('twLatest').addEventListener('click',()=>{date=null;get('twDate').value='';setText(get('twValidation'), '');void load(true);});
  get('twReload').addEventListener('click',()=>void load());
  return {show(){if(active)return;active=true;if(!loaded)void load();},hide(){if(!active)return;active=false;close();if(pending){++revision;controller?.abort();pending=false;loaded=false;clear();panel.setAttribute('aria-busy','false');}}};
}
