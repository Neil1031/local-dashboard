import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
// SEC transaction facts only; no report joins, scoring or amendment reconciliation.
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const value = v => isMessage(v) ? v : v == null || v === '' ? '—' : String(v);
const boolean = v => v == null ? '—' : v ? message("common.yes") : message("common.no");
const candidate = v => v === true ? message("us-sec-transactions.candidate") : message("us-sec-transactions.wording");
export function readSecTransactions(payload, query) {
  const invalid = () => { throw new Error('INVALID_SEC_TRANSACTIONS_RESPONSE'); };
  if (payload?.contractVersion !== 1 || !states.has(payload.dataState) || !Array.isArray(payload.items)
      || !Array.isArray(payload.sources) || !Array.isArray(payload.warnings) || !payload.warnings.every(v => typeof v === 'string')
      || typeof payload.observedAt !== 'string' || !Number.isFinite(Date.parse(payload.observedAt))
      || payload.page?.limit !== query.limit || payload.page?.offset !== query.offset
      || typeof payload.page.hasMore !== 'boolean' || payload.items.length > query.limit
      || (payload.page.hasMore ? payload.page.nextOffset !== query.offset + query.limit : payload.page.nextOffset !== null)) invalid();
  if ((payload.dataState === 'READY') !== (payload.items.length > 0)
      || (payload.dataState !== 'READY' && payload.page.hasMore)
      || !payload.sources.some(s => s.sourceId === 'insider-sec' && s.sourceVersion === 1)) invalid();
  const ids = new Set();
  for (const item of payload.items) {
    if (typeof item?.signalId !== 'string' || !item.signalId.startsWith('sec:') || ids.has(item.signalId)
        || !Number.isSafeInteger(item.transactionIndex) || item.transactionIndex < 0
        || !Array.isArray(item.qualityFlags) || !item.qualityFlags.every(v => typeof v === 'string')
        || !Array.isArray(item.provenance) || !Array.isArray(item.reportingOwners) || !Array.isArray(item.footnotes)
        || 'scores' in item || typeof item.candidateOpenMarketPurchase !== 'boolean' || typeof item.reviewRequired !== 'boolean'
        || (query.ticker && (typeof item.ticker !== 'string' || item.ticker.toUpperCase() !== query.ticker))) invalid();
    ids.add(item.signalId);
    for (const key of ['isDirect', 'is10b51']) if (!(item[key] === null || typeof item[key] === 'boolean')) invalid();
    for (const key of ['shares', 'insiderExecutionPrice', 'transactionAmount', 'ownershipAfter', 'ownershipIncreasePct'])
      if (!(item[key] === null || (typeof item[key] === 'number' && Number.isFinite(item[key])))) invalid();
    for (const owner of item.reportingOwners) {
      if (!(owner?.name === null || typeof owner?.name === 'string') || !(owner?.cik === null || typeof owner?.cik === 'string')
          || !Array.isArray(owner?.roles) || !owner.roles.every(v => typeof v === 'string')) invalid();
    }
    for (const note of item.footnotes) if (typeof note?.id !== 'string' || typeof note?.text !== 'string') invalid();
  }
  return payload;
}

export function createSecTransactionsView(document, get = id => document.getElementById(id), onTicker = null) {
  const dialog = get('secDetail');
  let returnFocus;
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text != null) setText(node, text);
    if (className) node.className = className; return node;
  }
  function fact(list, label, data) { list.append(element('dt', label), element('dd', value(data))); }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('secDetailClose').addEventListener('click', close);
  function detail(item, trigger) {
    returnFocus = trigger; setText(get('secDetailTitle'), message("display.wording.4", { value0: value(item.ticker), value1: value(item.company) }));
    const body = get('secDetailBody'); body.replaceChildren();
    body.append(element('p', message("us-sec-transactions.partial.slice.p.code.candidate.form.4.a.amendments.corrections"), 'signal-prose'));
    const facts = element('dl', null, 'signal-facts');
    for (const [label, data] of [[message("us-sec-transactions.id.immutable.business.event.id"), item.signalId], [message("us-sec-transactions.transaction.index"), item.transactionIndex],
      [message("us-sec-transactions.transaction.date"), item.eventDate], [message("us-sec-transactions.filing.date"), item.filingDate], [message("us-sec-transactions.filing.accepted.time"), item.filingAcceptedAt],
      [message("us-sec-transactions.local.discovered.time"), item.discoveredAt], [message("performance.discovery.basis"), item.discoveryBasis], [message("us-sec-transactions.recorded.at"), item.recordedAt], [message("common.updatedAt"), item.updatedAt],
      [message("us-sec-transactions.code.p"), item.transactionCode], [message("us-sec-transactions.security.type"), item.securityType], [message("us-sec-transactions.security.title"), item.securityTitle],
      [message("us-sec-transactions.acquired.disposed"), item.acquiredDisposed], [message("us-sec-transactions.shares"), item.shares], [message("us-sec-transactions.insider.execution.price"), item.insiderExecutionPrice],
      [message("us-sec-transactions.transaction.amount"), item.transactionAmount], [message("us-sec-transactions.ownership.after"), item.ownershipAfter], [message("us-sec-transactions.ownership.increase"), item.ownershipIncreasePct],
      [message("us-sec-transactions.direct.indirect"), item.isDirect == null ? '—' : item.isDirect ? message("us-sec-transactions.direct") : message("us-sec-transactions.indirect")], [message("us-sec-transactions.10b5.1"), boolean(item.is10b51)],
      [message("us-sec-transactions.candidate.open.market.flag"), candidate(item.candidateOpenMarketPurchase)], [message("us-sec-transactions.review.required"), boolean(item.reviewRequired)],
      [message("us-sec-transactions.filing.date.source"), item.filingDateSource], [message("us-sec-transactions.filing.date.metadata.observed.updated.at"), item.filingDateMetadataUpdatedAt]]) fact(facts, label, data);
    body.append(facts, element('h3', message("us-sec-transactions.reporting.owners")));
    for (const owner of item.reportingOwners) {
      const list = element('dl', null, 'signal-facts');
      for (const [label, data] of [[message("us-sec-transactions.name"), owner.name], ['CIK', owner.cik], [message("us-sec-transactions.roles"), owner.roles.join(' · ') || null]]) fact(list, label, data);
      body.append(list);
    }
    if (!item.reportingOwners.length) body.append(element('p', message("us-sec-transactions.owners")));
    body.append(element('h3', message("us-sec-transactions.quality.review.flags")));
    const flags = element('ul'); flags.append(...(item.qualityFlags.length ? item.qualityFlags : [message("us-sec-transactions.wording.2")]).map(f => element('li', f))); body.append(flags);
    body.append(element('h3', message("us-sec-transactions.footnotes")));
    for (const note of item.footnotes) body.append(element('p', message("display.wording.4", { value0: note.id, value1: note.text }), 'signal-prose'));
    if (!item.footnotes.length) body.append(element('p', message("us-sec-transactions.footnotes.2")));
    body.append(element('h3', message("us-sec-transactions.sanitized.source.provenance")));
    for (const ref of item.provenance) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ sourceType: message("us-sec-transactions.source.type"), table: message("us-sec-transactions.source.table"), recordId: 'Record ID', documentId: message("us-sec-transactions.accession.document.id"),
        contentHash: message("us-sec-transactions.content.hash"), firstObservedAt: message("us-sec-transactions.first.observed.at"), lastObservedAt: message("us-sec-transactions.last.observed.at") })) fact(list, label, ref[key]);
      body.append(list);
    }
    dialog.showModal(); get('secDetailClose').focus();
  }
  function render(payload, query) {
    setText(get('secSource'), message("us-sec-transactions.insider.sec.contract.v1", { value0: payload.observedAt, value1: value(payload.sources.find(s => s.sourceId === 'insider-sec')?.lastObservedAt) }));
    const messages = { READY: 'READY', EMPTY: message("us-sec-transactions.empty.sec.transactions"), UNAVAILABLE: message("us-sec-transactions.unavailable"), ERROR: message("reports.error.2") };
    setText(get('secStatus'), messages[payload.dataState]); get('secStatus').setAttribute('role', ['UNAVAILABLE', 'ERROR'].includes(payload.dataState) ? 'alert' : 'status');
    setText(get('secWarnings'), payload.warnings.join(' · '));
    const rows = get('secRows'); rows.replaceChildren();
    for (const item of payload.items) {
      const card = element('article', null, 'signal-card sec-card');
      const open = element('button', message("display.wording.4", { value0: value(item.ticker), value1: value(item.company) }), 'signal-open sec-open'); open.type = 'button';
      open.addEventListener('click', () => detail(item, open)); card.append(open);
      if (onTicker && typeof item.ticker === 'string' && /^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(item.ticker.toUpperCase())) {
        const navigate = element('button', message("us-sec-transactions.view.ticker"), 'ticker-link'); navigate.type = 'button';
        navigate.addEventListener('click', () => onTicker(item.ticker)); card.append(navigate);
      }
      const facts = element('dl', null, 'signal-facts');
      for (const [label, data] of [[message("us-sec-transactions.reporting.owner.s"), item.reportingOwners.map(o => value(o.name)).join(' · ') || null], [message("us-sec-transactions.transaction.date.2"), item.eventDate],
        [message("us-sec-transactions.transaction.code"), item.transactionCode], [message("us-sec-transactions.shares"), item.shares], [message("us-sec-transactions.insider.execution.price"), item.insiderExecutionPrice],
        [message("us-sec-transactions.transaction.amount"), item.transactionAmount], [message("us-sec-transactions.filing.date.2"), item.filingDate], [message("us-sec-transactions.security.type"), item.securityType],
        [message("us-sec-transactions.candidate.2"), candidate(item.candidateOpenMarketPurchase)], [message("us-sec-transactions.review.required"), boolean(item.reviewRequired)]]) fact(facts, label, data);
      card.append(facts, element('p', message("us-sec-transactions.review", { value0: item.qualityFlags.length }))); rows.append(card);
    }
    setText(get('secPage'), message("us-sec-transactions.offset", { value0: payload.items.length, value1: query.offset, value2: query.limit }));
    get('secPrevious').disabled = query.offset === 0 || !['READY', 'EMPTY'].includes(payload.dataState); get('secNext').disabled = !payload.page.hasMore;
  }
  return { render, close };
}

export function mountUsSecTransactions(document, fetcher = globalThis.fetch.bind(globalThis), onTicker = null) {
  const get = id => document.getElementById(id), panel = get('secPanel');
  let query = { limit: 50, offset: 0 }, revision = 0, controller, active = false;
  const { render, close } = createSecTransactionsView(document, get, onTicker);
  async function load() {
    controller?.abort(); const request = ++revision, requestController = new AbortController(); controller = requestController;
    const requestedQuery = { ...query }; close(); panel.setAttribute('aria-busy', 'true');
    for (const id of ['secRows', 'secSource', 'secPage', 'secWarnings']) setText(get(id), '');
    get('secStatus').setAttribute('role', 'status'); setText(get('secStatus'), message("us-sec-transactions.loading.sec.transactions"));
    get('secPrevious').disabled = get('secNext').disabled = true;
    const timer = setTimeout(() => requestController.abort(), 35000);
    try {
      const response = await fetcher(`/api/us/sec-transactions?${new URLSearchParams(requestedQuery)}`, { cache: 'no-store', signal: requestController.signal });
      if (!response.ok) throw new Error('SOURCE_REQUEST_FAILED');
      const payload = readSecTransactions(await response.json(), requestedQuery); if (request === revision && active) render(payload, requestedQuery);
    } catch {
      if (request !== revision || !active) return;
      setText(get('secStatus'), message("us-sec-transactions.error.sec.transactions")); get('secStatus').setAttribute('role', 'alert');
    } finally { clearTimeout(timer); if (request === revision) panel.setAttribute('aria-busy', 'false'); }
  }
  get('secFilter').addEventListener('submit', event => {
    event.preventDefault(); const ticker = get('secTicker').value.trim().toUpperCase();
    if (ticker && !/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(ticker)) {
      setText(get('secStatus'), message("us-sec-transactions.ticker.16")); get('secTicker').focus(); return;
    }
    query = { limit: 50, offset: 0, ...(ticker ? { ticker } : {}) }; void load();
  });
  get('secReload').addEventListener('click', () => void load());
  get('secNext').addEventListener('click', () => { query = { ...query, offset: query.offset + query.limit }; void load(); });
  get('secPrevious').addEventListener('click', () => { query = { ...query, offset: Math.max(0, query.offset - query.limit) }; void load(); });
  return { show() { active = true; void load(); }, hide() { active = false; ++revision; controller?.abort(); close(); panel.setAttribute('aria-busy', 'false'); } };
}
