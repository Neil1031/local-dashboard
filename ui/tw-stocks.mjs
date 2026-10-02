const states = new Set(['COHERENT', 'PARTIAL', 'UNAVAILABLE', 'ERROR']);
const text = v => v == null ? 'UNKNOWN / —' : String(v).replace(/(?:file:\/\/[^\s<>"']+|[a-z]:[\\/][^\s<>"']+|\\\\[^\s<>"']+|(?<![\w:])\/(?:[^\s/]+\/)+[^\s<>"']*)/gi, '[local path omitted]');
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
  const node = (tag, value, cls) => { const n = document.createElement(tag); if (value != null) n.textContent = text(value); if (cls) n.className = cls; return n; };
  const fact = (list, label, v) => list.append(node('dt', label), node('dd', v == null ? 'UNKNOWN / —' : v));
  const facts = (root, entries) => { const dl = node('dl', null, 'signal-facts'); entries.forEach(([label, v]) => fact(dl, label, v)); root.append(dl); };
  const counts = v => v == null ? 'UNKNOWN' : Object.entries(v).map(([k,n]) => `${k}: ${n}`).join(' · ') || '來源保存 0 項';
  const values = v => v == null ? 'UNKNOWN' : v.length ? v.join(' · ') : '來源保存 0 項';
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('twCandidateClose').addEventListener('click', close);
  function clear() { close(); for (const id of ['twDaily','twAccumulation','twSources','twCandidates','twResponsibility','twWeekly','twWarnings','twCandidateBody']) get(id).replaceChildren(); }
  function detail(c, trigger) {
    returnFocus = trigger; get('twCandidateTitle').textContent = `${text(c.symbol)} · ${text(c.stockName)}`;
    const body = get('twCandidateBody'); body.replaceChildren();
    facts(body, [['Market',c.market],['Signal date',c.signalDate],['分類',c.classification],['分類依據',c.classificationBasis],['Coverage',c.coverageStatus],
      ['Anomaly rank',c.anomalyRank],['Anomaly score · 來源異常分數',c.anomalyScore],['Volume ratio',c.volumeRatio],['Volume z-score',c.volumeZscore],['Baseline volume',c.baselineVolume],['Risk flags',values(c.riskFlags)]]);
    body.append(node('h3','Public-info source check'));
    facts(body, [['Status',c.publicInfoCheck.status],['Record exists',c.publicInfoCheck.recordExists],['Source succeeded',c.publicInfoCheck.succeeded],['Checked at',c.publicInfoCheck.checkedAt],['As of',c.publicInfoCheck.asOf],['Coverage',c.publicInfoCheck.coverageStatus],['Reason',c.publicInfoCheck.reasonCode]]);
    body.append(node('p','SUCCESS 只表示該來源檢查成功，不能解讀為分析完成或適合投資。每日觀察不適用投資 eligibility（null）。'));
    dialog.showModal(); get('twCandidateClose').focus();
  }
  function render(p) {
    get('twStatus').textContent = `${p.dataState} · ${p.dataState === 'COHERENT' ? '保存快照一致；不代表商業成功或資料完整。' : p.dataState === 'PARTIAL' ? '保留可用來源事實；請一併閱讀缺口。' : '來源不可用，不能當成零候選。'}`;
    get('twProvenance').textContent = `${p.query.mode}${date ? ` · ${date}` : ''} · Dashboard read: ${text(p.observedAt)} · Source generated: ${text(p.generatedAt)}`;
    p.warnings.forEach(w => get('twWarnings').append(node('li',w)));
    if (p.snapshot === null) return;
    const o = p.observation, attempt = p.latestAttempt, finalized = p.latestFinalized;
    for (const [title, entries] of [['最新嘗試 · Latest attempt', [['Run ID',attempt?.runId],['State',attempt?.state],['Status',attempt?.status],['Created at',attempt?.createdAt],['Started at',attempt?.startedAt],['Finished at',attempt?.finishedAt],['Scheduled dates',values(attempt?.scheduledDates)],['Business finalized',attempt?.businessFinalized]]],
      ['已保存觀察 · Latest finalized', [['Target date',finalized?.targetDate],['Run ID',finalized?.runId],['Saved status',finalized?.status],['Saved finished at',finalized?.finishedAt],['Classification / readiness',o?.classificationStatus]]]]) {
      const card = node('article',null,'tw-card'); card.append(node('h3',title)); facts(card,entries); get('twDaily').append(card);
    }
    facts(get('twAccumulation'), [['Scope state',p.scope.state],['Scope mode',p.scope.mode],['Accumulation start',p.scope.startDate]]);
    if (!o) { get('twCandidates').append(node('p','UNAVAILABLE · 沒有可驗證的已保存 daily observation；不表示沒有候選。')); get('twAccumulation').append(node('p','Readiness UNAVAILABLE · 沒有已保存 daily observation；scope 事實獨立保留。')); }
    else {
      facts(get('twAccumulation'), [['Readiness',o.classificationStatus],['Skipped counts',counts(o.readiness.skippedCounts)],['Warming symbols',o.readiness.warmingSymbols],['Pending source news',values(o.readiness.pendingCandidateNews)],['Readiness reason',o.readiness.reasonCode],['Baseline diagnostics',o.baselineSessionDiagnostics.state],['Mapping diagnostics',o.mappingDiagnostics.state],['Unmapped symbols · 不是候選',values(o.mappingDiagnostics.unmappedSymbols)],['Recognized exclusions · 獨立於未映射',o.mappingDiagnostics.recognizedExclusions == null ? null : o.mappingDiagnostics.recognizedExclusions.length]]);
      if (o.baselineSessionDiagnostics.records.length) {
        const d = node('details'); d.append(node('summary',`Saved baseline diagnostics (${o.baselineSessionDiagnostics.records.length})`));
        for (const b of o.baselineSessionDiagnostics.records) facts(d,[['Symbol',b.symbol],['State',b.status],['Reason',b.reasonCode],['Reason date',b.reasonDate],['Lower bound',b.lowerBound],['Expected dates',values(b.expectedDates)],['Actual dates',values(b.actualDates)],['Missing dates',values(b.missingDates)]]);
        get('twAccumulation').append(d);
      }
      if (o.mappingDiagnostics.recognizedExclusions?.length) {
        const d = node('details'); d.append(node('summary','Source-backed recognized exclusions'));
        o.mappingDiagnostics.recognizedExclusions.forEach(e=>facts(d,[['Symbol',e.symbol],['Market',e.market],['Source',e.source],['Source date',e.sourceDate],['Reason',e.reasonCode]])); get('twAccumulation').append(d);
      }
      for (const s of o.sources) { const card = node('article',null,'tw-card'); card.append(node('h3',`${s.name} · ${s.status}`)); facts(card,[['Started',s.startedAt],['Finished',s.finishedAt],['Reason',s.reasonCode]]); get('twSources').append(card); }
      if (!o.sources.length) get('twSources').append(node('p','沒有已保存 source headers；請查看 reason codes，不能推定來源成功。'));
      for (const m of o.markets) { const card=node('article',null,'tw-card');card.append(node('h3',`${m.market} · saved completeness`));facts(card,[['Complete',m.complete],['Rows',m.rows],['Expected symbols',m.expectedMasterSymbols],['Fresh rows',m.freshRows],['Unpriced unknown',m.unpricedUnknownCount],['Status unknown',m.statusUnknownCount],['Quote scope',m.quoteScopeStatus],['Quote scope complete',m.quoteScopeComplete]]);get('twSources').append(card); }
      const summary = o.candidateSummary;
      get('twCandidates').append(node('p',`來源候選 metadata: ${summary.state} · Saved count: ${text(summary.savedCandidateCount)} · Saved total: ${text(summary.savedTotalCandidatesBeforeLimit)} · Truncated: ${text(summary.savedTruncated)} · Exported: ${summary.exportedCount}`));
      if (!o.candidates.length) get('twCandidates').append(node('p',o.classificationStatus === 'WARMING_UP' ? '目前來源回傳 0 個候選；資料仍在 WARMING_UP，不能解讀為沒有異常。' : '來源目前回傳 0 個候選；這只描述選定觀察，不能推定市場沒有異常。','tw-empty'));
      for (const c of o.candidates) {
        const card=node('article',null,'tw-card tw-candidate'); const trigger=node('button',`${c.symbol} · ${text(c.stockName)}`,'tw-candidate-open');trigger.type='button';trigger.addEventListener('click',()=>detail(c,trigger));card.append(trigger);
        facts(card,[['Market / date',`${c.market} · ${c.signalDate}`],['Classification',c.classification],['Coverage',c.coverageStatus],['Anomaly score · 來源異常分數',c.anomalyScore],['Anomaly rank',c.anomalyRank]]);get('twCandidates').append(card);
      }
    }
    const responsibility = p.responsibility;
    facts(get('twResponsibility'),[['State',responsibility.state],['Pending revalidation count',responsibility.pendingCount],['Unfinished run count',responsibility.unfinishedCount],['Truncated · totals may be unknown',responsibility.truncated]]);
    if (responsibility.state === 'UNKNOWN') get('twResponsibility').append(node('p','Journal 責任證據 UNKNOWN；不能解讀為 0 項待辦。'));
    if (responsibility.pendingRevalidation?.length || responsibility.unfinishedRuns?.length) {
      const d=node('details');d.append(node('summary','來源保存的待辦明細'));
      responsibility.pendingRevalidation?.forEach(r=>facts(d,[['Target date',r.targetDate],['Origin run',r.originRunId],['Required at',r.requiredAt]]));
      responsibility.unfinishedRuns?.forEach(r=>facts(d,[['Run ID',r.runId],['State',r.state],['Relevant dates',values(r.relevantTargetDates)]]));get('twResponsibility').append(d);
    }
    const w=p.weeklyCheck;
    get('twWeekly').append(node('p','Weekly check_run_id 是獨立身分；FAILED 不會抹除 daily observation。'));
    facts(get('twWeekly'),[['State',w.state],['Check run ID',w.checkRunId],['Checked at',w.checkedAt],['Week start',w.weekStart],['Week end',w.weekEnd],['Status',w.status],['Problems',w.problemCount],['Day counts',counts(w.dayStatusCounts)],['Pending revalidation',w.pendingRevalidationCount],['Unfinished runs',w.unfinishedRunCount],['Binding',w.binding],['Pointer corroboration',w.pointerState]]);
    get('twWeekly').append(node('p',w.binding==='SELECTED_RESULT' ? '來源明示 SELECTED_RESULT binding；weekly 身分仍與 daily 分開。' : '來源未證明與選定 daily 綁定；此 weekly summary 獨立呈現。'));
  }
  async function load(force=false) {
    if (pending && !force) return;
    ++revision; const current=revision, requested=date; controller?.abort(); controller=new AbortController();const own=controller;
    pending=true;loaded=true; clear();panel.setAttribute('aria-busy','true');get('twStatus').setAttribute('role','status');get('twStatus').textContent='Loading · 正在讀取唯讀來源…';get('twProvenance').textContent='';
    const timeout=setTimeout(()=>own.abort(),35000);
    try {
      const response=await fetchSource(`/api/tw/stocks${requested == null ? '' : `?date=${encodeURIComponent(requested)}`}`,{cache:'no-store',redirect:'error',signal:own.signal});
      if(!response.ok)throw new Error('SOURCE_REQUEST_FAILED');const payload=readTwStocks(await response.json(),requested);
      if(active && revision===current)render(payload);
    } catch {
      if(active && revision===current){clear();get('twStatus').textContent='ERROR · 無法讀取 TW Stocks；請重新讀取。';get('twStatus').setAttribute('role','alert');}
    } finally {clearTimeout(timeout);if(revision===current){pending=false;panel.setAttribute('aria-busy','false');}}
  }
  get('twFilter').addEventListener('submit',e=>{e.preventDefault();const value=get('twDate').value;if(!validTwDate(value)){get('twValidation').textContent='請輸入 YYYY-MM-DD 真實日曆日期（0001–9999）。';get('twDate').focus();return;}get('twValidation').textContent='';date=value;void load(true);});
  get('twLatest').addEventListener('click',()=>{date=null;get('twDate').value='';get('twValidation').textContent='';void load(true);});
  get('twReload').addEventListener('click',()=>void load());
  return {show(){if(active)return;active=true;if(!loaded)void load();},hide(){if(!active)return;active=false;close();if(pending){++revision;controller?.abort();pending=false;loaded=false;clear();panel.setAttribute('aria-busy','false');}}};
}
