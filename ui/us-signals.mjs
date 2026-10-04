import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
// Report assessments retain source identity, score origin and uncertainty.
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const value = v => isMessage(v) ? v : v == null || v === '' ? '—' : String(v);
export function readSignals(payload, query) {
  const invalid = () => { throw new Error('INVALID_SIGNALS_RESPONSE'); };
  if (payload?.contractVersion !== 1 || !states.has(payload.dataState) || !Array.isArray(payload.items)
      || !Array.isArray(payload.sources) || !Array.isArray(payload.warnings)
      || typeof payload.observedAt !== 'string' || !Number.isFinite(Date.parse(payload.observedAt))
      || payload.page?.limit !== query.limit || payload.page?.offset !== query.offset
      || typeof payload.page.hasMore !== 'boolean' || payload.items.length > query.limit
      || (payload.page.hasMore ? payload.page.nextOffset !== query.offset + query.limit : payload.page.nextOffset !== null)) invalid();
  if ((payload.dataState === 'READY') !== (payload.items.length > 0)
      || (!['READY', 'EMPTY'].includes(payload.dataState) && payload.page.hasMore)
      || (payload.dataState === 'EMPTY' && payload.page.hasMore)) invalid();
  if (!payload.sources.some(s => s.sourceId === 'insider-reports' && s.sourceVersion === 1)) invalid();
  const ids = new Set();
  for (const item of payload.items) {
    if (typeof item?.signalId !== 'string' || !item.signalId.startsWith('report:') || ids.has(item.signalId)
        || !Array.isArray(item.qualityFlags) || !item.qualityFlags.every(v => typeof v === 'string')
        || !Array.isArray(item.provenance) || !Array.isArray(item.buyers)
        || item.listedBuyerCount !== item.buyers.length
        || (query.ticker && (typeof item.ticker !== 'string' || item.ticker.toUpperCase() !== query.ticker))) invalid();
    ids.add(item.signalId);
    for (const key of ['signal', 'investment']) {
      const score = item.scores?.[key];
      if (score?.origin !== 'imported_ai_report' || !(score.value === null || (typeof score.value === 'number' && Number.isFinite(score.value)))) invalid();
    }
  }
  return payload;
}

export function createSignalsView(document, get = id => document.getElementById(id), onTicker = null) {
  const dialog = get('signalDetail');
  let returnFocus;
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text != null) setText(node, text);
    if (className) node.className = className; return node;
  }
  function fact(list, label, data) { list.append(element('dt', label), element('dd', value(data))); }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('signalDetailClose').addEventListener('click', close);
  function detail(item, trigger) {
    returnFocus = trigger; setText(get('signalDetailTitle'), message("display.wording.4", { value0: value(item.ticker), value1: value(item.company) }));
    const body = get('signalDetailBody'); body.replaceChildren();
    const facts = element('dl', null, 'signal-facts');
    for (const [label, data] of [[message("common.signal.id"), item.signalId], [message("us-signals.wording"), message("us-signals.imported.ai.report")],
      [message("performance.report.date"), item.reportDate], [message("us-signals.event.date"), item.eventDate], [message("us-sec-transactions.filing.date.2"), item.filingDate],
      [message("us-signals.discovered.at"), item.discoveredAt], [message("performance.discovery.basis"), item.discoveryBasis], [message("us-sec-transactions.recorded.at"), item.recordedAt],
      [message("common.updatedAt"), item.updatedAt], [message("us-signals.wording.2"), item.listedBuyerCount],
      [message("us-signals.approximate.purchase.amount"), item.approximatePurchaseAmount], [message("us-signals.person"), item.personName], [message("us-signals.role"), item.personRole]]) fact(facts, label, data);
    body.append(facts);
    for (const [title, text] of [[message("us-signals.positive.reasons"), item.positiveReasons], [message("us-signals.risks"), item.risks]])
      body.append(element('h3', title), element('p', value(text), 'signal-prose'));
    body.append(element('h3', message("us-signals.quality.flags")));
    const flags = element('ul'); flags.append(...(item.qualityFlags.length ? item.qualityFlags : [message("us-signals.wording.3")]).map(f => element('li', f))); body.append(flags);
    body.append(element('h3', message("us-signals.buyers")));
    for (const buyer of item.buyers) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ person_name: message("us-signals.person"), person_role: message("us-signals.role"), transaction_date: message("us-sec-transactions.transaction.date.2"),
        filing_date: message("us-sec-transactions.filing.date.2"), shares: message("us-sec-transactions.shares"), insider_execution_price: message("us-sec-transactions.insider.execution.price"), transaction_amount: message("us-sec-transactions.transaction.amount") })) fact(list, label, buyer[key]);
      body.append(list);
    }
    if (!item.buyers.length) body.append(element('p', message("us-signals.wording.4")));
    body.append(element('h3', message("evidence.source.provenance")));
    for (const ref of item.provenance) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ sourceType: message("us-sec-transactions.source.type"), table: message("us-sec-transactions.source.table"), recordId: 'Record ID',
        documentId: 'Document ID', contentHash: message("us-sec-transactions.content.hash"), firstObservedAt: message("us-sec-transactions.first.observed.at"), lastObservedAt: message("us-sec-transactions.last.observed.at") })) fact(list, label, ref[key]);
      body.append(list);
    }
    dialog.showModal(); get('signalDetailClose').focus();
  }
  function render(payload, query) {
    const sourceObserved = payload.sources.find(s => s.sourceId === 'insider-reports')?.lastObservedAt;
    setText(get('signalsSource'), message("us-signals.insider.reports.imported.ai.report.contract.v1", { value0: payload.observedAt, value1: value(sourceObserved) }));
    const messages = { READY: 'READY', EMPTY: message("us-signals.empty.report.signals"),
      UNAVAILABLE: message("us-sec-transactions.unavailable"), ERROR: message("reports.error.2") };
    setText(get('signalsStatus'), messages[payload.dataState]);
    get('signalsStatus').setAttribute('role', ['UNAVAILABLE', 'ERROR'].includes(payload.dataState) ? 'alert' : 'status');
    setText(get('signalsWarnings'), payload.warnings.join(' · '));
    const rows = get('signalsRows'); rows.replaceChildren();
    for (const item of payload.items) {
      const card = element('article', null, 'signal-card');
      const open = element('button', message("display.wording.4", { value0: value(item.ticker), value1: value(item.company) }), 'signal-open');
      open.type = 'button'; open.addEventListener('click', () => detail(item, open)); card.append(open);
      if (onTicker && typeof item.ticker === 'string' && /^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(item.ticker.toUpperCase())) {
        const navigate = element('button', message("us-sec-transactions.view.ticker"), 'ticker-link'); navigate.type = 'button';
        navigate.addEventListener('click', () => onTicker(item.ticker)); card.append(navigate);
      }
      const facts = element('dl', null, 'signal-facts');
      for (const [label, data] of [[message("performance.report.date"), item.reportDate], [message("us-signals.event.date"), item.eventDate],
        [message("us-signals.investment.score"), item.scores.investment.value], [message("us-signals.signal.score"), item.scores.signal.value],
        [message("us-signals.wording.5"), item.listedBuyerCount], [message("us-signals.approximate.amount"), item.approximatePurchaseAmount],
        [message("us-signals.discovered.at"), item.discoveredAt], [message("performance.discovery.basis"), item.discoveryBasis]]) fact(facts, label, data);
      card.append(facts, element('p', message("us-signals.imported.ai.report"), 'signal-origin'),
        element('p', item.qualityFlags.length ? message("us-signals.wording.6", { value0: item.qualityFlags.length }) : message("us-signals.wording.7")));
      rows.append(card);
    }
    setText(get('signalsPage'), message("us-sec-transactions.offset", { value0: payload.items.length, value1: query.offset, value2: query.limit }));
    get('signalsPrevious').disabled = query.offset === 0 || !['READY', 'EMPTY'].includes(payload.dataState);
    get('signalsNext').disabled = !payload.page.hasMore;
  }
  return { render, close };
}

export function mountUsSignals(document, fetcher = globalThis.fetch.bind(globalThis), onTicker = null) {
  const get = id => document.getElementById(id), panel = get('signalsPanel');
  let query = { limit: 50, offset: 0 }, revision = 0, controller, active = false;
  const { render, close } = createSignalsView(document, get, onTicker);
  async function load() {
    controller?.abort(); const request = ++revision; const requestController = new AbortController(); controller = requestController;
    const requestedQuery = { ...query };
    close(); panel.setAttribute('aria-busy', 'true');
    setText(get('signalsRows'), ''); setText(get('signalsSource'), '');
    setText(get('signalsPage'), ''); setText(get('signalsWarnings'), '');
    get('signalsStatus').setAttribute('role', 'status'); setText(get('signalsStatus'), message("us-signals.loading.report.signals"));
    get('signalsPrevious').disabled = get('signalsNext').disabled = true;
    const timer = setTimeout(() => requestController.abort(), 35000);
    try {
      const response = await fetcher(`/api/us/signals?${new URLSearchParams(requestedQuery)}`, { cache: 'no-store', signal: requestController.signal });
      if (!response.ok) throw new Error('SOURCE_REQUEST_FAILED');
      const payload = readSignals(await response.json(), requestedQuery);
      if (request === revision && active) render(payload, requestedQuery);
    } catch {
      if (request !== revision || !active) return;
      setText(get('signalsStatus'), message("us-signals.error.signals")); get('signalsStatus').setAttribute('role', 'alert');
    } finally { clearTimeout(timer); if (request === revision) panel.setAttribute('aria-busy', 'false'); }
  }
  get('signalsFilter').addEventListener('submit', event => {
    event.preventDefault(); const ticker = get('signalsTicker').value.trim().toUpperCase();
    if (ticker && !/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(ticker)) {
      setText(get('signalsStatus'), message("us-sec-transactions.ticker.16")); get('signalsTicker').focus(); return;
    }
    query = { limit: 50, offset: 0, ...(ticker ? { ticker } : {}) }; void load();
  });
  get('signalsReload').addEventListener('click', () => void load());
  get('signalsNext').addEventListener('click', () => { query = { ...query, offset: query.offset + query.limit }; void load(); });
  get('signalsPrevious').addEventListener('click', () => { query = { ...query, offset: Math.max(0, query.offset - query.limit) }; void load(); });
  return { show() { active = true; void load(); }, hide() { active = false; ++revision; controller?.abort(); close(); panel.setAttribute('aria-busy', 'false'); } };
}
