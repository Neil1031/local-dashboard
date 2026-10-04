import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
export const horizons = Object.freeze(['1d', '1w', '1m', '3m', '6m']);
export const buckets = Object.freeze(['<85', '85-89', '90-94', '95+', 'UNSCORED']);
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const statuses = new Set(['COMPLETE', 'PARTIAL', 'PENDING', 'NOT_COMPUTED']);
const snapshotTypes = ['discovery', 'next_tradable', ...horizons];
const invalid = () => { throw new Error('INVALID_PERFORMANCE_RESPONSE'); };
const count = n => Number.isSafeInteger(n) && n >= 0;
const nullableNumber = n => n === null || typeof n === 'number' && Number.isFinite(n);
const time = s => typeof s === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s));
const strings = s => Array.isArray(s) && s.every(x => typeof x === 'string');
export const percent = n => n === null ? '—' : `${n}%`;
const value = n => isMessage(n) ? n : n == null ? '—' : String(n);
export function exactTicker(s) {
  if (typeof s !== 'string' || !s || s.length > 256 || /[:\s\x00-\x1f\x7f/\\]/u.test(s)) throw new Error('INVALID_PERFORMANCE_TICKER');
  return s;
}
function date(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(s) || s.startsWith('0000-')) invalid();
  const d = new Date(`${s}T00:00:00Z`); if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) invalid(); return s;
}
function signal(s) {
  if (!s || s.signalId !== `report:${date(s.reportDate)}:${exactTicker(s.ticker)}` || !(s.company === null || typeof s.company === 'string')
      || !time(s.discoveredAt) || typeof s.discoveryBasis !== 'string') invalid();
  for (const k of ['investment', 'signal']) { const score = s.scores?.[k]; if (!score || score.origin !== 'imported_ai_report' || !nullableNumber(score.value)
      || score.value !== null && (score.value < 0 || score.value > 100)) invalid(); }
}
function missing(s, status) { if (!strings(s) || status !== 'PARTIAL' && s.length) invalid(); s.forEach(date); }
function snapshot(s) {
  if (!s || !time(s.snapshotAt) || !time(s.createdAt) || !Number.isFinite(s.price) || s.price <= 0
      || !nullableNumber(s.returnFromDiscoveryPct) || !nullableNumber(s.returnFromTradablePct)
      || typeof s.provider !== 'string' || typeof s.priceBasis !== 'string') invalid();
}
export function readPerformance(p, kind, query) {
  if (p?.contractVersion !== 1 || p.sourceContractVersion !== 1 || p.source !== 'performance' || !states.has(p.dataState)
      || !time(p.observedAt) || !strings(p.warnings) || p.provenance?.sourceId !== 'insider-performance' || p.provenance.sourceVersion !== 1) invalid();
  const usable = p.dataState === 'READY' || p.dataState === 'EMPTY';
  if (usable ? !time(p.provenance.lastObservedAt) : p.provenance.lastObservedAt !== null) invalid();
  if (kind === 'summary') {
    if (p.horizon !== query.horizon || p.filters?.minInvestment !== null || p.filters.minSignal !== null || !Array.isArray(p.groups)) invalid();
    if (!usable) { if (p.groups.length || p.performanceStatusCounts !== null) invalid(); return p; }
    if (p.groups.length !== 5) invalid(); let total = 0;
    p.groups.forEach((g, i) => {
      if (g.bucket !== buckets[i] || !count(g.signals) || !count(g.observed) || !count(g.unobserved) || g.observed + g.unobserved !== g.signals
          || !nullableNumber(g.averageReturnPct) || !nullableNumber(g.winRatePct)
          || (g.observed === 0 ? g.averageReturnPct !== null || g.winRatePct !== null : g.averageReturnPct === null || g.winRatePct === null || g.winRatePct < 0 || g.winRatePct > 100)) invalid(); total += g.signals;
    });
    let statusTotal = 0; for (const k of ['complete', 'partial', 'pending', 'not_computed']) { if (!count(p.performanceStatusCounts?.[k])) invalid(); statusTotal += p.performanceStatusCounts[k]; }
    if (total !== statusTotal || (p.dataState === 'EMPTY') !== (total === 0)) invalid();
  } else if (kind === 'signals') {
    if (p.horizon !== query.horizon || p.ticker !== (query.ticker ?? null) || !Array.isArray(p.items) || p.items.length > query.limit
        || p.page?.limit !== query.limit || p.page.offset !== query.offset || typeof p.page.hasMore !== 'boolean'
        || (p.page.hasMore ? p.items.length !== query.limit || p.page.nextOffset !== query.offset + query.limit || p.page.nextOffset > 1000000 : p.page.nextOffset !== null)
        || (p.dataState === 'READY') !== (p.items.length > 0)) invalid();
    const ids = new Set(); for (const s of p.items) {
      signal(s); if (ids.has(s.signalId) || query.ticker && s.ticker !== query.ticker || !statuses.has(s.performanceStatus)) invalid(); ids.add(s.signalId);
      missing(s.missingSessions, s.performanceStatus);
      if (s.performanceStatus === 'NOT_COMPUTED' ? s.performanceAsOf !== null : !time(s.performanceAsOf)) invalid();
      if (typeof s.horizonObserved !== 'boolean' || s.horizonObserved !== (s.snapshot !== null)) invalid(); if (s.snapshot !== null) snapshot(s.snapshot);
    }
  } else if (kind === 'detail') {
    if (!usable) { if (p.signal !== null || p.performance !== null || Object.keys(p.snapshots ?? {}).length) invalid(); return p; }
    if (p.dataState !== 'READY') invalid(); signal(p.signal); if (p.signal.signalId !== query.signalId) invalid();
    const f = p.performance; if (!f || !statuses.has(f.status)) invalid(); missing(f.missingSessions, f.status);
    for (const k of ['asOf', 'updatedAt']) if (f.status === 'NOT_COMPUTED' ? f[k] !== null : !time(f[k])) invalid();
    for (const k of ['maxUpsidePct', 'maxAdversePct', 'maxDrawdownPct', 'daysToPeak', 'daysToFirst10PctGain', 'daysToFirst10PctLoss'])
      if (!nullableNumber(f[k]) || f.status === 'NOT_COMPUTED' && f[k] !== null || k.startsWith('days') && f[k] !== null && !count(f[k])) invalid();
    if (!p.snapshots || typeof p.snapshots !== 'object' || Array.isArray(p.snapshots)) invalid();
    for (const [k, s] of Object.entries(p.snapshots)) { if (!snapshotTypes.includes(k)) invalid(); snapshot(s); }
  } else invalid();
  return p;
}

export function mountPerformance(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), dialog = get('performanceDetail');
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) setText(n, text); if (cls) n.className = cls; return n; };
  let active = false, visited = false, horizon = '3m', ticker, offset = 0, revision = 0, detailRevision = 0, controller, detailController, pending = false, detailPending = false, summaryPending = false, returnFocus;
  const setStatus = (id, state, rawState = state) => { setText(get(id), isMessage(state) ? state : codeText(state)); get(id).setAttribute('role', ['ERROR', 'UNAVAILABLE'].includes(rawState) ? 'alert' : 'status'); };
  function clearDetail() { setText(get('performanceFacts'), ''); setText(get('performanceSnapshots'), ''); setText(get('performanceDetailSource'), ''); }
  function closeDetail() { ++detailRevision; detailController?.abort(); detailPending = false; if (dialog.open) dialog.close(); clearDetail(); }
  get('performanceDetailClose').addEventListener('click', closeDetail);
  dialog.addEventListener('close', () => { ++detailRevision; detailController?.abort(); detailPending = false; clearDetail(); if (active && returnFocus?.isConnected) returnFocus.focus(); });
  const source = p => message("performance.insider.ai.report.performance.contract.v", { value0: p.sourceContractVersion, value1: p.observedAt, value2: value(p.provenance.lastObservedAt) });
  const facts = (node, pairs) => pairs.forEach(([k, v]) => node.append(el('dt', k), el('dd', value(v))));
  async function fetchData(kind, query, signal) {
    const response = await fetcher(`/api/performance/${kind}?${new URLSearchParams(query)}`, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('PERFORMANCE_READ_FAILED'); return readPerformance(await response.json(), kind, query);
  }
  async function loadDetail(id) {
    if (!active || !dialog.open || detailPending) return; detailPending = true;
    const n = ++detailRevision, c = new AbortController(); detailController = c; clearDetail(); setStatus('performanceDetailStatus', message("common.loading")); dialog.setAttribute('aria-busy', 'true');
    const timer = setTimeout(() => c.abort(), 35000);
    try {
      const p = await fetchData('detail', { signalId: id }, c.signal); if (n !== detailRevision || !active || !dialog.open) return;
      if (c.signal.aborted) throw new Error(); setStatus('performanceDetailStatus', p.dataState); setText(get('performanceDetailSource'), source(p));
      if (p.dataState !== 'READY') return; const s = p.signal, f = p.performance;
      facts(get('performanceFacts'), [[message("performance.source.signal.id"), s.signalId], [message("performance.ticker.company"), `${s.ticker} · ${value(s.company)}`], [message("performance.report.date"), s.reportDate],
        [message("performance.investment.score.imported.ai.report"), s.scores.investment.value], [message("performance.signal.score.imported.ai.report"), s.scores.signal.value], [message("performance.discovery"), s.discoveredAt], [message("performance.discovery.basis"), s.discoveryBasis],
        [message("performance.storedPerformance"), codeText(f.status)], [message("performance.stored.asof"), f.asOf], [message("performance.missing.sessions.exact.source.dates"), f.missingSessions.length ? f.missingSessions.join(', ') : message("performance.wording")],
        [message("performance.max.upside"), percent(f.maxUpsidePct)], [message("performance.max.adverse"), percent(f.maxAdversePct)], [message("performance.max.drawdown"), percent(f.maxDrawdownPct)], [message("performance.days.to.peak"), f.daysToPeak],
        [message("performance.days.to.first.10"), f.daysToFirst10PctGain], [message("performance.days.to.first.10.2"), f.daysToFirst10PctLoss], [message("performance.stored.updatedat"), f.updatedAt]]);
      for (const k of snapshotTypes) if (Object.hasOwn(p.snapshots, k)) {
        const s = p.snapshots[k], box = el('section', null, 'performance-snapshot'), dl = el('dl'); box.append(el('h4', k), dl);
        facts(dl, [[message("performance.snapshot.at"), s.snapshotAt], [message("performance.price"), s.price], [message("performance.return.from.tradable"), percent(s.returnFromTradablePct)], [message("performance.return.from.discovery"), percent(s.returnFromDiscoveryPct)],
          [message("performance.provider"), s.provider], [message("performance.price.basis"), s.priceBasis], [message("common.createdAt"), s.createdAt]]); get('performanceSnapshots').append(box);
      }
      if (!Object.keys(p.snapshots).length) get('performanceSnapshots').append(el('p', message("performance.noSnapshots")));
    } catch { if (n === detailRevision && active && dialog.open) { clearDetail(); setStatus('performanceDetailStatus', message("performance.error"), 'ERROR'); } }
    finally { clearTimeout(timer); if (n === detailRevision) { detailPending = false; dialog.setAttribute('aria-busy', 'false'); } }
  }
  function clearList() { setText(get('performanceRows'), ''); setText(get('performancePageCount'), ''); setText(get('performanceListSource'), ''); get('performancePrevious').disabled = get('performanceNext').disabled = true; closeDetail(); }
  function renderSummary(p) {
    setStatus('performanceSummaryStatus', p.dataState); setText(get('performanceSource'), source(p));
    if (!['READY', 'EMPTY'].includes(p.dataState)) return;
    for (const g of p.groups) {
      const card = el('section', null, 'performance-bucket'), dl = el('dl'); card.append(el('h3', g.bucket), dl);
      facts(dl, [[message("us.signals"), g.signals], [message("performance.observed.return"), g.observed], [message("performance.unobserved.return"), g.unobserved], [message("performance.average.return"), percent(g.averageReturnPct)], [message("performance.win.rate"), percent(g.winRatePct)]]);
      get('performanceGroups').append(card);
    }
    const counts = p.performanceStatusCounts; setText(get('performanceCounts'), message("performance.stored.performance.complete.partial.pending.not.computed", { value0: counts.complete, value1: counts.partial, value2: counts.pending, value3: counts.not_computed }));
  }
  function renderList(p) {
    setStatus('performanceListStatus', p.dataState); setText(get('performanceListSource'), source(p));
    if (!['READY', 'EMPTY'].includes(p.dataState)) return;
    for (const s of p.items) {
      const card = el('article', null, 'performance-row'), b = el('button', message("performance.signal.detail", { value0: s.ticker, value1: s.reportDate }), 'performance-open'); b.type = 'button';
      b.addEventListener('click', () => { closeDetail(); returnFocus = b; dialog.showModal(); get('performanceDetailClose').focus(); void loadDetail(s.signalId); });
      const state = !s.horizonObserved ? message("performance.snapshot.absent.return.unavailable") : s.snapshot.returnFromTradablePct === null ? message("performance.snapshot.saved.return.unavailable") : message("performance.snapshot.saved.observed.return");
      card.append(b, el('p', value(s.company)), el('p', message("performance.investment.score.signal.score.imported.ai.report", { value0: value(s.scores.investment.value), value1: value(s.scores.signal.value) })),
        el('p', message("performance.stored.performance.asof", { value0: s.performanceStatus, value1: value(s.performanceAsOf) })), el('p', message("display.wording.3", { value0: horizon.toUpperCase(), value1: state, value2: percent(s.snapshot?.returnFromTradablePct ?? null) })));
      get('performanceRows').append(card);
    }
    setText(get('performancePageCount'), message("performance.offset.20", { value0: p.items.length, value1: offset }));
    get('performancePrevious').disabled = offset === 0; get('performanceNext').disabled = !p.page.hasMore;
  }
  async function load(includeSummary = true, replace = false) {
    if (!active || pending && !replace) return; controller?.abort(); const n = ++revision, c = new AbortController(); controller = c; pending = true; visited = true;
    // Replacing a pending group must also replace its unfinished summary.
    if (!includeSummary && summaryPending) includeSummary = true;
    clearList(); setStatus('performanceListStatus', message("common.loading"));
    if (includeSummary) { summaryPending = true; setText(get('performanceGroups'), ''); setText(get('performanceCounts'), ''); setText(get('performanceSource'), ''); setStatus('performanceSummaryStatus', message("common.loading")); }
    const query = { horizon, limit: 20, offset }; if (ticker) query.ticker = ticker;
    const timer = setTimeout(() => c.abort(), 35000);
    const read = async(kind, q, render, id) => {
      try { const p = await fetchData(kind, q, c.signal); if (n !== revision || !active) return; if (c.signal.aborted) throw new Error(); render(p); }
      catch { if (n === revision && active) setStatus(id, message("performance.error.2"), 'ERROR'); }
      finally { if (kind === 'summary' && n === revision) summaryPending = false; }
    };
    try { await Promise.all([read('signals', query, renderList, 'performanceListStatus'), ...(includeSummary ? [read('summary', { horizon }, renderSummary, 'performanceSummaryStatus')] : [])]); }
    finally { clearTimeout(timer); if (n === revision) pending = false; }
  }
  get('performanceRefresh').addEventListener('click', () => void load());
  document.querySelectorAll('[data-performance-horizon]').forEach(b => b.addEventListener('click', () => {
    if (horizon === b.dataset.performanceHorizon) return; horizon = b.dataset.performanceHorizon; offset = 0;
    document.querySelectorAll('[data-performance-horizon]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); void load(true, true);
  }));
  get('performanceFilter').addEventListener('submit', e => {
    e.preventDefault(); try { const text = get('performanceTicker').value; ticker = text === '' ? undefined : exactTicker(text); offset = 0; setText(get('performanceValidation'), ''); void load(false, true); }
    catch { setText(get('performanceValidation'), message("performance.exact.ticker")); }
  });
  get('performancePrevious').addEventListener('click', () => { offset = Math.max(0, offset - 20); void load(false); });
  get('performanceNext').addEventListener('click', () => { offset += 20; void load(false); });
  return { show(page) {
    active = page === 'performance'; if (active) { if (!visited) void load(); }
    else { ++revision; controller?.abort(); if (pending) { visited = false; pending = false; clearList(); setText(get('performanceGroups'), ''); setText(get('performanceCounts'), ''); } closeDetail(); }
  } };
}
