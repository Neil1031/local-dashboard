import { readSignals, createSignalsView } from './us-signals.mjs';
import { readSecTransactions, createSecTransactionsView } from './us-sec-transactions.mjs';

export const TICKER_DETAIL_TIMEOUT_MS = 75000; // Two sequential max-30s adapter reads plus bounded stream drain.
export function exactTicker(value) {
  const ticker = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(ticker)) throw new Error('INVALID_TICKER');
  return ticker;
}
export function aggregateState(a, b) {
  const usable = v => ['READY', 'EMPTY'].includes(v);
  if (usable(a) && usable(b)) return a === 'EMPTY' && b === 'EMPTY' ? 'EMPTY' : 'READY';
  if (usable(a) || usable(b)) return 'PARTIAL';
  return a === 'ERROR' || b === 'ERROR' ? 'ERROR' : 'UNAVAILABLE';
}
const sectionQuery = (query, key) => ({ ticker: query.ticker, limit: query[`${key}Limit`], offset: query[`${key}Offset`] });
function sectionError(query, source) {
  return { contractVersion: 1, dataState: 'ERROR', observedAt: new Date().toISOString(), items: [],
    page: { limit: query.limit, offset: query.offset, hasMore: false, nextOffset: null },
    sources: [{ sourceId: `insider-${source}`, sourceVersion: 1, lastObservedAt: null }],
    warnings: ['SOURCE_SECTION_INVALID', ...(source === 'sec' ? ['SEC_PARTIAL_NOT_RECONCILED_OR_CERTIFIED'] : [])] };
}
export function readTickerDetail(payload, query) {
  if (payload?.contractVersion !== 1 || payload.ticker !== query.ticker
      || !['READY', 'PARTIAL', 'EMPTY', 'UNAVAILABLE', 'ERROR'].includes(payload.dataState)
      || typeof payload.observedAt !== 'string' || !Number.isFinite(Date.parse(payload.observedAt))
      || !Array.isArray(payload.warnings) || !payload.warnings.every(v => typeof v === 'string') || !payload.sections) throw new Error('INVALID_TICKER_DETAIL_RESPONSE');
  let invalid = false;
  const safe = (read, section, requested, source) => {
    try { return read(section, requested); } catch { invalid = true; return sectionError(requested, source); }
  };
  const signals = safe(readSignals, payload.sections.signals, sectionQuery(query, 'signals'), 'reports');
  const secTransactions = safe(readSecTransactions, payload.sections.secTransactions, sectionQuery(query, 'sec'), 'sec');
  const dataState = aggregateState(signals.dataState, secTransactions.dataState);
  if (!invalid && payload.dataState !== dataState) throw new Error('INVALID_AGGREGATE_STATE');
  return { ...payload, dataState, sections: { signals, secTransactions } };
}

export function mountUsTickerDetail(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), panel = get('tickerPanel');
  const signalsGet = id => get(id.startsWith('signals') ? `tickerSignals${id.slice(7)}` : `tickerSignal${id.slice(6)}`);
  const secGet = id => get(`tickerSec${id.slice(3)}`);
  const signalsView = createSignalsView(document, signalsGet), secView = createSecTransactionsView(document, secGet);
  let active = false, revision = 0, controller, query;
  const close = () => { signalsView.close(); secView.close(); };
  function clear() {
    for (const prefix of ['tickerSignals', 'tickerSec']) {
      for (const suffix of ['Rows', 'Source', 'Warnings', 'Page', 'Status']) get(prefix + suffix).replaceChildren();
      get(prefix + 'Previous').disabled = get(prefix + 'Next').disabled = true;
    }
    get('tickerSummary').textContent = '';
  }
  async function load() {
    if (!query || !active) return;
    controller?.abort(); const request = ++revision, requestController = new AbortController(); controller = requestController;
    const requestedQuery = { ...query }; close(); clear(); panel.setAttribute('aria-busy', 'true');
    get('tickerTitle').textContent = `${query.ticker} · Ticker Detail`;
    get('tickerStatus').setAttribute('role', 'status'); get('tickerStatus').textContent = 'Loading ticker sources…';
    const timer = setTimeout(() => requestController.abort(), TICKER_DETAIL_TIMEOUT_MS);
    try {
      const response = await fetcher(`/api/us/ticker-detail?${new URLSearchParams(requestedQuery)}`, { cache: 'no-store', signal: requestController.signal });
      if (!response.ok) throw new Error('TICKER_REQUEST_FAILED');
      const payload = readTickerDetail(await response.json(), requestedQuery);
      if (request !== revision || !active) return;
      if (requestController.signal.aborted) throw new Error('TICKER_REQUEST_ABORTED');
      signalsView.render(payload.sections.signals, sectionQuery(requestedQuery, 'signals'));
      secView.render(payload.sections.secTransactions, sectionQuery(requestedQuery, 'sec'));
      get('tickerStatus').textContent = `${payload.dataState} · 本次兩來源讀取 ${payload.observedAt}`;
      get('tickerStatus').setAttribute('role', ['UNAVAILABLE', 'ERROR'].includes(payload.dataState) ? 'alert' : 'status');
      get('tickerSummary').textContent = `Reports Signals ${payload.sections.signals.dataState} · SEC Transactions ${payload.sections.secTransactions.dataState}`;
    } catch {
      if (request !== revision || !active) return;
      get('tickerStatus').textContent = 'ERROR · 無法安全取得 Ticker Detail；請重試。'; get('tickerStatus').setAttribute('role', 'alert');
    } finally { clearTimeout(timer); if (request === revision) panel.setAttribute('aria-busy', 'false'); }
  }
  function setTicker(value) {
    try { query = { ticker: exactTicker(value), signalsLimit: 50, signalsOffset: 0, secLimit: 50, secOffset: 0 }; }
    catch { get('tickerValidation').textContent = 'Ticker 必填：1–16 字元，英數、點或連字號，開頭須為英數。'; get('tickerInput').focus(); return false; }
    get('tickerInput').value = query.ticker; get('tickerValidation').textContent = ''; return true;
  }
  get('tickerFilter').addEventListener('submit', event => { event.preventDefault(); if (setTicker(get('tickerInput').value)) void load(); });
  get('tickerReload').addEventListener('click', () => { if (query) void load(); else if (setTicker(get('tickerInput').value)) void load(); });
  for (const [key, prefix] of [['signals', 'tickerSignals'], ['sec', 'tickerSec']]) {
    for (const direction of ['Previous', 'Next']) get(prefix + direction).addEventListener('click', () => {
      if (!query) return;
      query = { ...query, [`${key}Offset`]: Math.max(0, query[`${key}Offset`] + (direction === 'Next' ? 1 : -1) * query[`${key}Limit`]) };
      void load();
    });
  }
  return {
    setTicker,
    show() { active = true; if (query) void load(); else { clear(); get('tickerStatus').textContent = '請輸入 exact ticker，分別查看 Reports 與 SEC。'; } },
    hide() { active = false; ++revision; controller?.abort(); close(); panel.setAttribute('aria-busy', 'false'); }
  };
}
