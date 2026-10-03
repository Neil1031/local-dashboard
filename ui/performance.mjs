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
const value = n => n == null ? '—' : String(n);
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
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  let active = false, visited = false, horizon = '3m', ticker, offset = 0, revision = 0, detailRevision = 0, controller, detailController, pending = false, detailPending = false, returnFocus;
  const setStatus = (id, state) => { get(id).textContent = state; get(id).setAttribute('role', state.startsWith('ERROR') || state.startsWith('UNAVAILABLE') ? 'alert' : 'status'); };
  function clearDetail() { get('performanceFacts').replaceChildren(); get('performanceSnapshots').replaceChildren(); get('performanceDetailSource').textContent = ''; }
  function closeDetail() { ++detailRevision; detailController?.abort(); detailPending = false; if (dialog.open) dialog.close(); clearDetail(); }
  get('performanceDetailClose').addEventListener('click', closeDetail);
  dialog.addEventListener('close', () => { ++detailRevision; detailController?.abort(); detailPending = false; clearDetail(); if (active && returnFocus?.isConnected) returnFocus.focus(); });
  const source = p => `Insider AI report Performance · contract v${p.sourceContractVersion} · 本次觀察 ${p.observedAt} · 成功來源觀察 ${value(p.provenance.lastObservedAt)}`;
  const facts = (node, pairs) => pairs.forEach(([k, v]) => node.append(el('dt', k), el('dd', value(v))));
  async function fetchData(kind, query, signal) {
    const response = await fetcher(`/api/performance/${kind}?${new URLSearchParams(query)}`, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('PERFORMANCE_READ_FAILED'); return readPerformance(await response.json(), kind, query);
  }
  async function loadDetail(id) {
    if (!active || !dialog.open || detailPending) return; detailPending = true;
    const n = ++detailRevision, c = new AbortController(); detailController = c; clearDetail(); setStatus('performanceDetailStatus', 'Loading…'); dialog.setAttribute('aria-busy', 'true');
    const timer = setTimeout(() => c.abort(), 35000);
    try {
      const p = await fetchData('detail', { signalId: id }, c.signal); if (n !== detailRevision || !active || !dialog.open) return;
      if (c.signal.aborted) throw new Error(); setStatus('performanceDetailStatus', p.dataState); get('performanceDetailSource').textContent = source(p);
      if (p.dataState !== 'READY') return; const s = p.signal, f = p.performance;
      facts(get('performanceFacts'), [['Source signal ID', s.signalId], ['Ticker / company', `${s.ticker} · ${value(s.company)}`], ['Report date', s.reportDate],
        ['Investment Score · imported_ai_report', s.scores.investment.value], ['Signal Score · imported_ai_report', s.scores.signal.value], ['Discovery', s.discoveredAt], ['Discovery basis', s.discoveryBasis],
        ['Stored performance', f.status], ['Stored asOf', f.asOf], ['Missing sessions · exact source dates', f.missingSessions.length ? f.missingSessions.join(', ') : '來源未列出缺漏日期'],
        ['Max upside', percent(f.maxUpsidePct)], ['Max adverse', percent(f.maxAdversePct)], ['Max drawdown', percent(f.maxDrawdownPct)], ['Days to peak', f.daysToPeak],
        ['Days to first +10%', f.daysToFirst10PctGain], ['Days to first −10%', f.daysToFirst10PctLoss], ['Stored updatedAt', f.updatedAt]]);
      for (const k of snapshotTypes) if (Object.hasOwn(p.snapshots, k)) {
        const s = p.snapshots[k], box = el('section', null, 'performance-snapshot'), dl = el('dl'); box.append(el('h4', k), dl);
        facts(dl, [['Snapshot at', s.snapshotAt], ['Price', s.price], ['Return from tradable', percent(s.returnFromTradablePct)], ['Return from discovery', percent(s.returnFromDiscoveryPct)],
          ['Provider', s.provider], ['Price basis', s.priceBasis], ['Created at', s.createdAt]]); get('performanceSnapshots').append(box);
      }
      if (!Object.keys(p.snapshots).length) get('performanceSnapshots').append(el('p', '沒有保存的 snapshots。'));
    } catch { if (n === detailRevision && active && dialog.open) { clearDetail(); setStatus('performanceDetailStatus', 'ERROR · 無法安全取得來源明細。'); } }
    finally { clearTimeout(timer); if (n === detailRevision) { detailPending = false; dialog.setAttribute('aria-busy', 'false'); } }
  }
  function clearList() { get('performanceRows').replaceChildren(); get('performancePageCount').textContent = ''; get('performanceListSource').textContent = ''; get('performancePrevious').disabled = get('performanceNext').disabled = true; closeDetail(); }
  function renderSummary(p) {
    setStatus('performanceSummaryStatus', p.dataState); get('performanceSource').textContent = source(p);
    if (!['READY', 'EMPTY'].includes(p.dataState)) return;
    for (const g of p.groups) {
      const card = el('section', null, 'performance-bucket'), dl = el('dl'); card.append(el('h3', g.bucket), dl);
      facts(dl, [['Signals', g.signals], ['Observed return', g.observed], ['Unobserved return', g.unobserved], ['Average return', percent(g.averageReturnPct)], ['Win rate', percent(g.winRatePct)]]);
      get('performanceGroups').append(card);
    }
    const counts = p.performanceStatusCounts; get('performanceCounts').textContent = `Stored performance: COMPLETE ${counts.complete} · PARTIAL ${counts.partial} · PENDING ${counts.pending} · NOT_COMPUTED ${counts.not_computed}`;
  }
  function renderList(p) {
    setStatus('performanceListStatus', p.dataState); get('performanceListSource').textContent = source(p);
    if (!['READY', 'EMPTY'].includes(p.dataState)) return;
    for (const s of p.items) {
      const card = el('article', null, 'performance-row'), b = el('button', `${s.ticker} · ${s.reportDate} · Signal Detail`, 'performance-open'); b.type = 'button';
      b.addEventListener('click', () => { closeDetail(); returnFocus = b; dialog.showModal(); get('performanceDetailClose').focus(); void loadDetail(s.signalId); });
      const state = !s.horizonObserved ? 'Snapshot absent · return unavailable' : s.snapshot.returnFromTradablePct === null ? 'Snapshot saved / return unavailable' : 'Snapshot saved / observed return';
      card.append(b, el('p', value(s.company)), el('p', `Investment Score ${value(s.scores.investment.value)} · Signal Score ${value(s.scores.signal.value)} · Imported AI report`),
        el('p', `Stored performance ${s.performanceStatus} · asOf ${value(s.performanceAsOf)}`), el('p', `${horizon.toUpperCase()} · ${state} · ${percent(s.snapshot?.returnFromTradablePct ?? null)}`));
      get('performanceRows').append(card);
    }
    get('performancePageCount').textContent = `本頁 ${p.items.length} 筆 · offset ${offset} · 每頁 20`;
    get('performancePrevious').disabled = offset === 0; get('performanceNext').disabled = !p.page.hasMore;
  }
  async function load(includeSummary = true, replace = false) {
    if (!active || pending && !replace) return; controller?.abort(); const n = ++revision, c = new AbortController(); controller = c; pending = true; visited = true;
    // Replacing a pending group must also replace its unfinished summary.
    if (!includeSummary && get('performanceSummaryStatus').textContent === 'Loading…') includeSummary = true;
    clearList(); setStatus('performanceListStatus', 'Loading…');
    if (includeSummary) { get('performanceGroups').replaceChildren(); get('performanceCounts').textContent = ''; get('performanceSource').textContent = ''; setStatus('performanceSummaryStatus', 'Loading…'); }
    const query = { horizon, limit: 20, offset }; if (ticker) query.ticker = ticker;
    const timer = setTimeout(() => c.abort(), 35000);
    const read = async(kind, q, render, id) => {
      try { const p = await fetchData(kind, q, c.signal); if (n !== revision || !active) return; if (c.signal.aborted) throw new Error(); render(p); }
      catch { if (n === revision && active) setStatus(id, 'ERROR · 無法安全取得來源資料。'); }
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
    e.preventDefault(); try { const text = get('performanceTicker').value; ticker = text === '' ? undefined : exactTicker(text); offset = 0; get('performanceValidation').textContent = ''; void load(false, true); }
    catch { get('performanceValidation').textContent = '請輸入完整 exact ticker；保留大小寫、不去空白。'; }
  });
  get('performancePrevious').addEventListener('click', () => { offset = Math.max(0, offset - 20); void load(false); });
  get('performanceNext').addEventListener('click', () => { offset += 20; void load(false); });
  return { show(page) {
    active = page === 'performance'; if (active) { if (!visited) void load(); }
    else { ++revision; controller?.abort(); if (pending) { visited = false; pending = false; clearList(); get('performanceGroups').replaceChildren(); get('performanceCounts').textContent = ''; } closeDetail(); }
  } };
}
