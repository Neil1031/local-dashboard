import { readTwStocks } from './tw-stocks.mjs';
import { readTwReports } from './tw-reports.mjs';

export const evidenceSources = Object.freeze({
  stocks: Object.freeze({ name: 'TW Stocks', contract: 'tw-daily-accumulation-v1', url: '/api/tw/stocks' }),
  daily: Object.freeze({ name: 'TW Daily Reports', contract: 'tw-reports-v1', url: '/api/reports/tw?type=daily&limit=1&offset=0' }),
  weekly: Object.freeze({ name: 'TW Weekly Reports', contract: 'tw-reports-v1', url: '/api/reports/tw?type=weekly&limit=1&offset=0' })
});

export function readEvidenceSource(source, payload) {
  if (source === 'stocks') return readTwStocks(payload);
  if (source === 'daily' || source === 'weekly') return readTwReports(payload, { type: source, limit: 1, offset: 0 });
  throw new Error('UNKNOWN_EVIDENCE_SOURCE');
}

// Presentation allowlist only. Paths, free-form warnings and unknown response fields
// are not public diagnostic facts, even if a test/server adds them to an envelope.
export function evidenceValue(value) {
  if (value == null) return 'UNKNOWN / —（未提供；不是 0／NO）';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'UNKNOWN / —';
  if (typeof value !== 'string') return 'UNKNOWN / —';
  if (/^[A-Za-z0-9_:-]{1,128}$/.test(value) && !/^[A-Za-z]:/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) return value;
  return '來源文字未公開';
}
export function evidenceIdentity(value) {
  if (value == null) return evidenceValue(null);
  return typeof value === 'string' && (/^[0-9a-f]{32}$/.test(value) || /^tw-(daily|weekly):\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/.test(value)) ? value : 'UNKNOWN / —（來源身分未公開）';
}
const values = rows => rows == null ? evidenceValue(null) : Array.isArray(rows)
  ? rows.length ? rows.slice(0, 100).map(evidenceValue).join(' · ') + (rows.length > 100 ? `（畫面前 100／本次 ${rows.length} 項）` : '') : '來源回應 0 項' : evidenceValue(null);
const counts = rows => rows == null || typeof rows !== 'object' || Array.isArray(rows) ? evidenceValue(null)
  : Object.entries(rows).filter(([k, v]) => /^[A-Z][A-Z0-9_]{0,80}$/.test(k) && (v === null || Number.isSafeInteger(v) && v >= 0))
    .map(([k, v]) => `${k}: ${evidenceValue(v)}`).join(' · ') || (Object.keys(rows).length ? evidenceValue(null) : '來源回應 0 項');

export function createEvidenceLoader(fetcher, onChange = () => {}, timeoutMs = 35000) {
  let active = false, loaded = false, revision = 0, queued = null, running = null;
  const controllers = new Set();
  let view = { stocks: null, daily: null, weekly: null, pending: false, waiting: false };
  const publish = () => onChange({ ...view, active, loaded, revision });
  const matches = own => active && own === revision;
  const abortPresentation = () => { for (const controller of controllers) controller.abort(); };

  async function read(source) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(evidenceSources[source].url, { cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('SOURCE_REQUEST_FAILED');
      const payload = readEvidenceSource(source, await response.json());
      if (controller.signal.aborted) throw new Error('BROWSER_READ_ABORTED');
      return { payload, failed: false };
    } catch {
      return { payload: null, failed: true };
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }

  async function cycle(own) {
    view.waiting = false; publish();
    // Await both fetch and JSON body settlement. An abort signal alone is never
    // treated as a settled browser request or as proof of source-child cancellation.
    const stocks = await read('stocks');
    if (!matches(own)) return;
    view.stocks = stocks; publish();
    await Promise.all(['daily', 'weekly'].map(async source => {
      const result = await read(source);
      if (matches(own)) { view[source] = result; publish(); }
    }));
    if (matches(own)) { view.pending = false; loaded = true; publish(); }
  }

  function drain() {
    if (running) return;
    running = (async () => {
      while (active && queued !== null) {
        const own = queued; queued = null;
        await cycle(own);
      }
    })().finally(() => { running = null; if (active && queued !== null) drain(); });
  }
  function request() {
    if (!active) return;
    ++revision; loaded = false; abortPresentation(); queued = revision;
    view = { stocks: null, daily: null, weekly: null, pending: true, waiting: running !== null };
    publish(); drain();
  }
  return {
    show() { if (active) return; active = true; if (!loaded) request(); else publish(); },
    refresh: request,
    hide() {
      if (!active) return;
      active = false; ++revision; queued = null; abortPresentation();
      if (view.pending) { loaded = false; view = { stocks: null, daily: null, weekly: null, pending: false, waiting: false }; }
      publish();
    },
    async whenIdle() { while (running) await running; },
    get state() { return { ...view, active, loaded, revision }; }
  };
}

export function mountEvidence(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), panel = get('evidenceView');
  const node = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const facts = (root, entries) => {
    const list = node('dl', null, 'evidence-facts');
    for (const [label, value] of entries) list.append(node('dt', label), node('dd', /\bID\b/.test(label) ? evidenceIdentity(value) : evidenceValue(value)));
    root.append(list);
  };
  const joinedFact = (root, label, value) => {
    const list = node('dl', null, 'evidence-facts');
    list.append(node('dt', label), node('dd', value)); root.append(list);
  };
  function warnings(root, list, label = '來源 envelope warnings') {
    const detail = node('div', null, 'evidence-warnings'); detail.append(node('h4', label));
    if (list == null) detail.append(node('p', 'UNKNOWN / —'));
    else if (!list.length) detail.append(node('p', '本次回應未列警告；不代表來源完整。'));
    else {
      const ul = node('ul');
      for (const w of list) ul.append(node('li', typeof w === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(w) ? w : '來源警告（內容不公開）'));
      detail.append(ul);
    }
    root.append(detail);
  }
  function expandable(root, title, rows, fields) {
    if (rows == null) { root.append(node('p', `${title}：UNKNOWN / —`)); return; }
    if (!Array.isArray(rows)) { root.append(node('p', `${title}：UNKNOWN / —`)); return; }
    const detail = node('details'); detail.append(node('summary', `${title} · 本次回應 ${rows.length} 筆`));
    if (!rows.length) detail.append(node('p', '本次來源回應 0 筆。'));
    for (const row of rows.slice(0, 100)) {
      const card = node('div', null, 'evidence-record');
      for (const [label, key, array] of fields) {
        if (array) joinedFact(card, label, values(row?.[key]));
        else facts(card, [[label, row?.[key]]]);
      }
      detail.append(card);
    }
    if (rows.length > 100) detail.append(node('p', '畫面最多呈現本次回應的前 100 筆；不是完整歷史。'));
    root.append(detail);
  }
  function sourceCard(source, result) {
    const root = get(`evidenceSource-${source}`); root.replaceChildren();
    root.append(node('h3', evidenceSources[source].name));
    const p = result?.payload, state = result?.failed ? 'ERROR' : p?.dataState ?? 'LOADING';
    const status = node('p', `${state} · ${result?.failed ? '本次來源讀取失敗；其他來源獨立保留。' : '來源狀態獨立，不是整體健康或投資訊號。'}`, 'evidence-state');
    status.setAttribute('role', result?.failed ? 'alert' : 'status'); root.append(status);
    facts(root, [['Contract', evidenceSources[source].contract], ['Dashboard observed', p?.observedAt], ['Source generated', p?.generatedAt]]);
    if (source === 'stocks') facts(root, [['選定 daily date', p?.observation?.targetDate], ['選定 daily run ID', p?.observation?.runId]]);
    else facts(root, [['本次 LIST 首筆 report ID', p?.items[0]?.reportId]]);
    warnings(root, p?.warnings);
  }
  function renderStocks(result) {
    for (const id of ['evidenceDaily','evidenceCompleteness','evidenceReadiness','evidenceResponsibility','evidenceWeekly']) get(id).replaceChildren();
    const p = result?.payload, daily = get('evidenceDaily');
    if (!p) { daily.append(node('p', result?.failed ? 'ERROR · Stocks 證據讀取失敗；Reports 仍會獨立讀取。' : '等待 Stocks 證據。')); return; }
    const o = p.observation;
    facts(daily, [['Query mode', p.query.mode], ['Query target date', p.query.targetDate], ['Snapshot state', p.snapshot?.state],
      ['Scope state', p.scope?.state], ['Scope mode', p.scope?.mode], ['Scope start', p.scope?.startDate],
      ['Dashboard read', p.observedAt], ['Source generated', p.generatedAt], ['Read started', p.snapshot?.readStartedAt], ['Read finished', p.snapshot?.readFinishedAt]]);
    joinedFact(daily, 'Snapshot reason codes', values(p.snapshot?.reasonCodes));
    for (const [title, rows] of [
      ['最新嘗試 · Latest attempt', [['Run ID', p.latestAttempt?.runId], ['State', p.latestAttempt?.state], ['Status', p.latestAttempt?.status], ['Created', p.latestAttempt?.createdAt], ['Started', p.latestAttempt?.startedAt], ['Finished', p.latestAttempt?.finishedAt], ['Business finalized', p.latestAttempt?.businessFinalized]]],
      ['已保存 · Latest finalized', [['Run ID', p.latestFinalized?.runId], ['Target date', p.latestFinalized?.targetDate], ['Saved status', p.latestFinalized?.status], ['Finished', p.latestFinalized?.finishedAt]]],
      ['選定 Daily Observation', [['Run ID', o?.runId], ['Date', o?.targetDate], ['Saved status', o?.status], ['Finished', o?.finishedAt], ['Classification', o?.classificationStatus], ['Strategy', o?.strategyStatus]]]
    ]) { const card = node('article', null, 'evidence-card'); card.append(node('h3', title)); facts(card, rows); daily.append(card); }
    joinedFact(daily, 'Latest attempt scheduled dates', values(p.latestAttempt?.scheduledDates));

    const completeness = get('evidenceCompleteness');
    expandable(completeness, 'Source headers', o?.sources, [['Source','name'],['State','status'],['Started','startedAt'],['Finished','finishedAt'],['Reason','reasonCode']]);
    for (const market of ['TWSE','TPEX']) {
      const m = o?.markets.find(row => row.market === market), card = node('article', null, 'evidence-card');
      card.append(node('h4', `${market} · 保存的市場完整性`));
      facts(card, [['Complete', m?.complete], ['Quote scope complete', m?.quoteScopeComplete], ['Quote scope state', m?.quoteScopeStatus], ['Rows', m?.rows], ['Expected symbols', m?.expectedMasterSymbols], ['Fresh rows', m?.freshRows], ['Unpriced unknown', m?.unpricedUnknownCount], ['Status unknown', m?.statusUnknownCount]]);
      completeness.append(card);
    }
    const readiness = get('evidenceReadiness');
    facts(readiness, [['Classification', o?.classificationStatus], ['Warming symbols', o?.readiness.warmingSymbols], ['Readiness reason', o?.readiness.reasonCode], ['Baseline diagnostics', o?.baselineSessionDiagnostics.state], ['Mapping diagnostics', o?.mappingDiagnostics.state],
      ['Candidate summary state', o?.candidateSummary.state], ['Saved candidates', o?.candidateSummary.savedCandidateCount], ['Saved total before limit', o?.candidateSummary.savedTotalCandidatesBeforeLimit], ['Saved truncated', o?.candidateSummary.savedTruncated], ['Exported candidates', o?.candidateSummary.exportedCount]]);
    joinedFact(readiness, 'Skipped counts', counts(o?.readiness.skippedCounts));
    joinedFact(readiness, 'Pending source news', values(o?.readiness.pendingCandidateNews));
    joinedFact(readiness, 'Unmapped symbols（不是候選）', values(o?.mappingDiagnostics.unmappedSymbols));
    readiness.append(node('p', o?.classificationStatus === 'WARMING_UP' ? 'WARMING_UP：0 候選不代表沒有異常；請同時閱讀 warming symbols 與 INSUFFICIENT_HISTORY。' : '候選筆數只描述選定來源觀察；candidate 不是買進建議，來源異常分數不是投資分數。', 'evidence-interpretation'));
    expandable(readiness, 'Baseline diagnostics', o?.baselineSessionDiagnostics.records, [['Symbol','symbol'],['State','status'],['Reason','reasonCode'],['Lower bound','lowerBound'],['Reason date','reasonDate'],['Expected dates','expectedDates',true],['Actual dates','actualDates',true],['Missing dates','missingDates',true]]);
    expandable(readiness, 'Recognized exclusions（與 unmapped 分開）', o?.mappingDiagnostics.recognizedExclusions, [['Symbol','symbol'],['Market','market'],['Source','source'],['Source date','sourceDate'],['Reason','reasonCode']]);

    const responsibility = get('evidenceResponsibility'), r = p.responsibility;
    facts(responsibility, [['Responsibility state', r?.state], ['Pending revalidation total', r?.pendingCount], ['Unfinished runs total', r?.unfinishedCount], ['Truncated', r?.truncated]]);
    responsibility.append(node('p', 'null／UNKNOWN 不是 0 項待辦；截斷回應不能當成完整責任清單。'));
    expandable(responsibility, 'Pending revalidation', r?.pendingRevalidation, [['Date','targetDate'],['Origin run ID','originRunId'],['Required at','requiredAt']]);
    expandable(responsibility, 'Unfinished runs', r?.unfinishedRuns, [['Run ID','runId'],['State','state'],['Relevant dates','relevantTargetDates',true]]);
    const weekly = get('evidenceWeekly'), w = p.weeklyCheck;
    facts(weekly, [['Weekly state', w?.state], ['Check run ID', w?.checkRunId], ['Checked at', w?.checkedAt], ['Week start', w?.weekStart], ['Week end', w?.weekEnd], ['保存週檢業務狀態', w?.status], ['Problems total', w?.problemCount], ['Pending revalidation total', w?.pendingRevalidationCount], ['Unfinished runs total', w?.unfinishedRunCount], ['Source binding', w?.binding], ['Pointer state', w?.pointerState]]);
    joinedFact(weekly, 'Saved day status counts', counts(w?.dayStatusCounts));
    weekly.append(node('p', 'Weekly FAILED 是保存業務狀態，不會抹除可用 Daily Observation；binding 只呈現來源明示值，不從日期推論。'));
  }
  function renderReport(source, result) {
    const root = get(`evidenceReport-${source}`); root.replaceChildren();
    root.append(node('h3', evidenceSources[source].name));
    const p = result?.payload;
    if (!p) { root.append(node('p', result?.failed ? 'ERROR · 本來源讀取失敗；其他證據保留。' : '等待本來源 LIST 證據。')); return; }
    facts(root, [['Source dataState', p.dataState], ['Dashboard observed', p.observedAt], ['Source generated', p.generatedAt], ['Source provenance', p.provenance]]);
    warnings(root, p.warnings);
    root.append(node('p', '本次來源清單首筆 · 最多 1 筆；不是完整 latest history，也不是與 Stocks／另一份報告的原子觀察。'));
    const item = p.items[0];
    if (!item) { root.append(node('p', p.dataState === 'EMPTY' ? 'EMPTY · 本次 bounded LIST 沒有報告。' : `${p.dataState} · 本次 LIST 未提供可讀首筆。`)); return; }
    facts(root, source === 'daily' ? [['Report ID',item.reportId],['Target date',item.targetDate],['Accumulation run ID',item.accumulationRunId],['Saved at',item.savedAt],['保存業務狀態',item.status],['Classification',item.classificationStatus],['Candidate count',item.candidateCount]]
      : [['Report ID',item.reportId],['Week start',item.weekStart],['Week end',item.weekEnd],['Check run ID',item.checkRunId],['Checked at',item.checkedAt],['保存週檢業務狀態',item.status],['問題總數（LIST 提供）',item.problemCount],['Pending revalidation total',item.pendingRevalidationCount],['Unfinished run total',item.unfinishedRunCount]]);
    if (source === 'weekly') { joinedFact(root,'Saved day status counts',counts(item.dayStatusCounts)); root.append(node('p','Weekly FAILED 保留為業務狀態；問題內容與完整報告由 Reports 明細頁負責。')); }
    if (source === 'daily' && item.classificationStatus === 'WARMING_UP') root.append(node('p','WARMING_UP：0 候選不代表沒有異常。'));
    warnings(root,item.warnings,'本次 LIST 首筆 item warnings');
  }
  let previous = {};
  const loader = createEvidenceLoader(fetcher, view => {
    panel.setAttribute('aria-busy',String(view.pending));
    get('evidenceStatus').textContent = view.pending ? view.waiting ? 'Loading · 等候前次瀏覽器請求結束後，重新讀取。' : 'Loading · Stocks 先讀取，完成後 Daily／Weekly 分開讀取。' : view.loaded ? '本次讀取已結束；下方三個來源狀態各自獨立。使用 Refresh 明確重新讀取。' : '尚未完成本次讀取；進入頁面時讀取一次。';
    for (const source of ['stocks','daily','weekly']) if (previous[source] !== view[source]) {
      sourceCard(source,view[source]);
      if (source === 'stocks') renderStocks(view.stocks); else renderReport(source,view[source]);
    }
    previous = view;
  });
  get('evidenceReload').addEventListener('click',loader.refresh);
  return loader;
}
