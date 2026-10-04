import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
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
  if (value == null) return String(message("evidence.unknown.0.no"));
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'UNKNOWN / —';
  if (typeof value !== 'string') return 'UNKNOWN / —';
  if (/^[A-Za-z0-9_:-]{1,128}$/.test(value) && !/^[A-Za-z]:/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) return value;
  return String(message("evidence.wording"));
}
export function evidenceIdentity(value) {
  if (value == null) return evidenceValue(null);
  return typeof value === 'string' && (/^[0-9a-f]{32}$/.test(value) || /^tw-(daily|weekly):\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/.test(value)) ? value : String(message("evidence.unknown"));
}
const values = (rows, codes = false) => rows == null ? evidenceValue(null) : Array.isArray(rows)
  ? rows.length ? rows.slice(0, 100).map(value => codes ? String(codeText(evidenceValue(value))) : evidenceValue(value)).join(' · ') + (rows.length > 100 ? message("evidence.100", { value0: rows.length }) : '') : message("evidence.0") : evidenceValue(null);
const countItems = rows => rows == null || typeof rows !== 'object' || Array.isArray(rows) ? evidenceValue(null)
  : Object.entries(rows).filter(([k, v]) => /^[A-Z][A-Z0-9_]{0,80}$/.test(k) && (v === null || Number.isSafeInteger(v) && v >= 0))
    .map(([k, v]) => message('common.codeCount', { code: codeText(k), count: evidenceValue(v) })) || (Object.keys(rows).length ? evidenceValue(null) : message("evidence.0"));

const counts = rows => { const items = countItems(rows); return Array.isArray(items) && !items.length ? Object.keys(rows).length ? message('evidence.unknown.0.no') : message('evidence.0') : message('common.heldText', { text: items }); };

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
    if (text != null) setText(n, text);
    if (className) n.className = className;
    return n;
  };
  const facts = (root, entries) => {
    const list = node('dl', null, 'evidence-facts');
    for (const [label, value, kind] of entries) list.append(node('dt', label), node('dd', () => kind === 'identity' ? evidenceIdentity(value) : kind === 'code' ? codeText(evidenceValue(value)) : evidenceValue(value)));
    root.append(list);
  };
  const joinedFact = (root, label, value) => {
    const list = node('dl', null, 'evidence-facts');
    list.append(node('dt', label), node('dd', value)); root.append(list);
  };
  function warnings(root, list, label = message("evidence.envelope.warnings")) {
    const detail = node('div', null, 'evidence-warnings'); detail.append(node('h4', label));
    if (list == null) detail.append(node('p', 'UNKNOWN / —'));
    else if (!list.length) detail.append(node('p', message("evidence.wording.2")));
    else {
      const ul = node('ul');
      for (const w of list) ul.append(node('li', typeof w === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(w) ? codeText(w) : message("evidence.wording.3")));
      detail.append(ul);
    }
    root.append(detail);
  }
  function expandable(root, title, rows, fields) {
    if (rows == null) { root.append(node('p', message("common.labelUnknown", { label: title }))); return; }
    if (!Array.isArray(rows)) { root.append(node('p', message("display.unknown", { value0: title }))); return; }
    const detail = node('details'); detail.append(node('summary', message("evidence.wording.4", { value0: title, value1: rows.length })));
    if (!rows.length) detail.append(node('p', message("evidence.0.2")));
    for (const row of rows.slice(0, 100)) {
      const card = node('div', null, 'evidence-record');
      for (const [label, key, array] of fields) {
        if (array) joinedFact(card, label, () => values(row?.[key]));
        else facts(card, [[label, row?.[key], ['runId','originRunId','checkRunId','reportId','accumulationRunId'].includes(key) ? 'identity' : ['state','status','reasonCode'].includes(key) ? 'code' : undefined]]);
      }
      detail.append(card);
    }
    if (rows.length > 100) detail.append(node('p', message("evidence.100.2")));
    root.append(detail);
  }
  function sourceCard(source, result) {
    const root = get(`evidenceSource-${source}`); root.replaceChildren();
    root.append(node('h3', message({ stocks: 'nav.twStocks', daily: 'reports.twDaily', weekly: 'reports.twWeekly' }[source])));
    const p = result?.payload, state = result?.failed ? 'ERROR' : p?.dataState ?? 'LOADING';
    const status = node('p', message("common.stateNotice", { state: codeText(state), notice: result?.failed ? message("evidence.wording.5") : message("evidence.wording.6") }), 'evidence-state');
    status.setAttribute('role', result?.failed ? 'alert' : 'status'); root.append(status);
    facts(root, [[message("evidence.contract"), evidenceSources[source].contract], [message("evidence.dashboard.observed"), p?.observedAt], [message("evidence.source.generated"), p?.generatedAt]]);
    if (source === 'stocks') facts(root, [[message("evidence.daily.date"), p?.observation?.targetDate], [message("evidence.daily.run.id"), p?.observation?.runId, 'identity']]);
    else facts(root, [[message("evidence.list.report.id"), p?.items[0]?.reportId, 'identity']]);
    warnings(root, p?.warnings);
  }
  function renderStocks(result) {
    for (const id of ['evidenceDaily','evidenceCompleteness','evidenceReadiness','evidenceResponsibility','evidenceWeekly']) setText(get(id), '');
    const p = result?.payload, daily = get('evidenceDaily');
    if (!p) { daily.append(node('p', result?.failed ? message("evidence.error.stocks.reports") : message("evidence.stocks"))); return; }
    const o = p.observation;
    facts(daily, [[message("evidence.query.mode"), p.query.mode], [message("evidence.query.target.date"), p.query.targetDate], [message("evidence.snapshot.state"), p.snapshot?.state, 'code'],
      [message("evidence.scope.state"), p.scope?.state, 'code'], [message("evidence.scope.mode"), p.scope?.mode], [message("evidence.scope.start"), p.scope?.startDate],
      [message("evidence.dashboard.read"), p.observedAt], [message("evidence.source.generated"), p.generatedAt], [message("evidence.read.started"), p.snapshot?.readStartedAt], [message("evidence.read.finished"), p.snapshot?.readFinishedAt]]);
    joinedFact(daily, message("evidence.snapshot.reason.codes"), () => values(p.snapshot?.reasonCodes, true));
    for (const [title, rows] of [
      [message("evidence.latest.attempt"), [[message("common.runId"), p.latestAttempt?.runId, 'identity'], [message("evidence.state"), p.latestAttempt?.state, 'code'], [message("common.status"), p.latestAttempt?.status, 'code'], [message("evidence.created"), p.latestAttempt?.createdAt], [message("automations.started"), p.latestAttempt?.startedAt], [message("evidence.finished"), p.latestAttempt?.finishedAt], [message("evidence.business.finalized"), p.latestAttempt?.businessFinalized]]],
      [message("evidence.latest.finalized"), [[message("common.runId"), p.latestFinalized?.runId, 'identity'], [message("evidence.target.date"), p.latestFinalized?.targetDate], [message("evidence.saved.status"), p.latestFinalized?.status, 'code'], [message("evidence.finished"), p.latestFinalized?.finishedAt]]],
      [message("evidence.daily.observation"), [[message("common.runId"), o?.runId, 'identity'], [message("evidence.date"), o?.targetDate], [message("evidence.saved.status"), o?.status, 'code'], [message("evidence.finished"), o?.finishedAt], [message("evidence.classification"), o?.classificationStatus, 'code'], [message("evidence.strategy"), o?.strategyStatus, 'code']]]
    ]) { const card = node('article', null, 'evidence-card'); card.append(node('h3', title)); facts(card, rows); daily.append(card); }
    joinedFact(daily, message("evidence.latest.attempt.scheduled.dates"), () => values(p.latestAttempt?.scheduledDates));

    const completeness = get('evidenceCompleteness');
    expandable(completeness, message("evidence.source.headers"), o?.sources, [[message("common.source"),'name'],[message("evidence.state"),'status'],[message("automations.started"),'startedAt'],[message("evidence.finished"),'finishedAt'],[message("common.reason"),'reasonCode']]);
    for (const market of ['TWSE','TPEX']) {
      const m = o?.markets.find(row => row.market === market), card = node('article', null, 'evidence-card');
      card.append(node('h4', message("evidence.wording.7", { value0: market })));
      facts(card, [[message("evidence.complete"), m?.complete], [message("evidence.quote.scope.complete"), m?.quoteScopeComplete], [message("evidence.quote.scope.state"), m?.quoteScopeStatus, 'code'], [message("evidence.rows"), m?.rows], [message("evidence.expected.symbols"), m?.expectedMasterSymbols], [message("evidence.freshRows"), m?.freshRows], [message("evidence.unpriced.unknown"), m?.unpricedUnknownCount], [message("evidence.status.unknown"), m?.statusUnknownCount]]);
      completeness.append(card);
    }
    const readiness = get('evidenceReadiness');
    facts(readiness, [[message("evidence.classification"), o?.classificationStatus, 'code'], [message("evidence.warming.symbols"), o?.readiness.warmingSymbols], [message("evidence.readiness.reason"), o?.readiness.reasonCode, 'code'], [message("evidence.baselineState"), o?.baselineSessionDiagnostics.state, 'code'], [message("evidence.mappingState"), o?.mappingDiagnostics.state, 'code'],
      [message("evidence.candidate.summary.state"), o?.candidateSummary.state, 'code'], [message("evidence.saved.candidates"), o?.candidateSummary.savedCandidateCount], [message("evidence.saved.total.before.limit"), o?.candidateSummary.savedTotalCandidatesBeforeLimit], [message("evidence.saved.truncated"), o?.candidateSummary.savedTruncated], [message("evidence.exported.candidates"), o?.candidateSummary.exportedCount]]);
    joinedFact(readiness, message("tw.skippedCounts"), () => counts(o?.readiness.skippedCounts));
    joinedFact(readiness, message("tw.pendingSourceNews"), () => values(o?.readiness.pendingCandidateNews));
    joinedFact(readiness, message("evidence.unmapped.symbols"), () => values(o?.mappingDiagnostics.unmappedSymbols));
    readiness.append(node('p', o?.classificationStatus === 'WARMING_UP' ? message("evidence.warming.up.0.warming.symbols.insufficient.history") : message("evidence.candidate"), 'evidence-interpretation'));
    expandable(readiness, message("evidence.baselineState"), o?.baselineSessionDiagnostics.records, [[message("evidence.symbol"),'symbol'],[message("evidence.state"),'status'],[message("common.reason"),'reasonCode'],[message("evidence.lower.bound"),'lowerBound'],[message("evidence.reason.date"),'reasonDate'],[message("evidence.expected.dates"),'expectedDates',true],[message("evidence.actual.dates"),'actualDates',true],[message("evidence.missing.dates"),'missingDates',true]]);
    expandable(readiness, message("evidence.recognized.exclusions.unmapped"), o?.mappingDiagnostics.recognizedExclusions, [[message("evidence.symbol"),'symbol'],[message("evidence.market"),'market'],[message("common.source"),'source'],[message("evidence.source.date"),'sourceDate'],[message("common.reason"),'reasonCode']]);

    const responsibility = get('evidenceResponsibility'), r = p.responsibility;
    facts(responsibility, [[message("evidence.responsibility.state"), r?.state, 'code'], [message("evidence.pending.revalidation.total"), r?.pendingCount], [message("evidence.unfinished.runs.total"), r?.unfinishedCount], [message("evidence.truncated"), r?.truncated]]);
    responsibility.append(node('p', message("evidence.null.unknown.0")));
    expandable(responsibility, message("evidence.pendingRevalidation"), r?.pendingRevalidation, [[message("evidence.date"),'targetDate'],[message("evidence.origin.run.id"),'originRunId'],[message("evidence.required.at"),'requiredAt']]);
    expandable(responsibility, message("evidence.unfinishedRuns"), r?.unfinishedRuns, [[message("common.runId"),'runId'],[message("evidence.state"),'state'],[message("evidence.relevant.dates"),'relevantTargetDates',true]]);
    const weekly = get('evidenceWeekly'), w = p.weeklyCheck;
    facts(weekly, [[message("evidence.weekly.state"), w?.state, 'code'], [message("evidence.check.run.id"), w?.checkRunId, 'identity'], [message("evidence.checked.at"), w?.checkedAt], [message("evidence.week.start"), w?.weekStart], [message("evidence.week.end"), w?.weekEnd], [message("evidence.wording.8"), w?.status, 'code'], [message("evidence.problems.total"), w?.problemCount], [message("evidence.pending.revalidation.total"), w?.pendingRevalidationCount], [message("evidence.unfinished.runs.total"), w?.unfinishedRunCount], [message("evidence.source.binding"), w?.binding], [message("evidence.pointer.state"), w?.pointerState]]);
    joinedFact(weekly, message("evidence.saved.day.status.counts"), () => counts(w?.dayStatusCounts));
    weekly.append(node('p', message("evidence.weekly.failed.daily.observation.binding")));
  }
  function renderReport(source, result) {
    const root = get(`evidenceReport-${source}`); root.replaceChildren();
    root.append(node('h3', message({ stocks: 'nav.twStocks', daily: 'reports.twDaily', weekly: 'reports.twWeekly' }[source])));
    const p = result?.payload;
    if (!p) { root.append(node('p', result?.failed ? message("evidence.error") : message("evidence.list"))); return; }
    facts(root, [[message("evidence.source.datastate"), p.dataState, 'code'], [message("evidence.dashboard.observed"), p.observedAt], [message("evidence.source.generated"), p.generatedAt], [message("evidence.source.provenance"), p.provenance]]);
    warnings(root, p.warnings);
    root.append(node('p', message("evidence.1.latest.history.stocks")));
    const item = p.items[0];
    if (!item) { root.append(node('p', p.dataState === 'EMPTY' ? message("evidence.empty.bounded.list") : message("evidence.list.2", { value0: p.dataState }))); return; }
    facts(root, source === 'daily' ? [[message("common.reportId"),item.reportId, 'identity'],[message("evidence.target.date"),item.targetDate],[message("evidence.accumulation.run.id"),item.accumulationRunId, 'identity'],[message("common.savedAt"),item.savedAt],[message("evidence.wording.9"),item.status, 'code'],[message("evidence.classification"),item.classificationStatus, 'code'],[message("evidence.candidate.count"),item.candidateCount]]
      : [[message("common.reportId"),item.reportId, 'identity'],[message("evidence.week.start"),item.weekStart],[message("evidence.week.end"),item.weekEnd],[message("evidence.check.run.id"),item.checkRunId, 'identity'],[message("evidence.checked.at"),item.checkedAt],[message("evidence.wording.8"),item.status, 'code'],[message("evidence.list.3"),item.problemCount],[message("evidence.pending.revalidation.total"),item.pendingRevalidationCount],[message("evidence.unfinished.run.total"),item.unfinishedRunCount]]);
    if (source === 'weekly') { joinedFact(root,message("evidence.saved.day.status.counts"),() => counts(item.dayStatusCounts)); root.append(node('p',message("evidence.weekly.failed.reports"))); }
    if (source === 'daily' && item.classificationStatus === 'WARMING_UP') root.append(node('p',message("evidence.warming.up.0")));
    warnings(root,item.warnings,message("evidence.list.item.warnings"));
  }
  let previous = {};
  const loader = createEvidenceLoader(fetcher, view => {
    panel.setAttribute('aria-busy',String(view.pending));
    setText(get('evidenceStatus'), view.pending ? view.waiting ? message("evidence.loading") : message("evidence.loading.stocks.daily.weekly") : view.loaded ? message("evidence.refresh.2") : message("evidence.wording.10"));
    for (const source of ['stocks','daily','weekly']) if (previous[source] !== view[source]) {
      sourceCard(source,view[source]);
      if (source === 'stocks') renderStocks(view.stocks); else renderReport(source,view[source]);
    }
    previous = view;
  });
  get('evidenceReload').addEventListener('click',loader.refresh);
  return loader;
}
