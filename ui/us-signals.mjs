// Report assessments retain source identity, score origin and uncertainty.
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const value = v => v == null || v === '' ? '—' : String(v);
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
    const node = document.createElement(tag); if (text != null) node.textContent = String(text);
    if (className) node.className = className; return node;
  }
  function fact(list, label, data) { list.append(element('dt', label), element('dd', value(data))); }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('signalDetailClose').addEventListener('click', close);
  function detail(item, trigger) {
    returnFocus = trigger; get('signalDetailTitle').textContent = `${value(item.ticker)} · ${value(item.company)}`;
    const body = get('signalDetailBody'); body.replaceChildren();
    const facts = element('dl', null, 'signal-facts');
    for (const [label, data] of [['Signal ID', item.signalId], ['分數來源', 'Imported AI report'],
      ['Report date', item.reportDate], ['Event date · 交易日', item.eventDate], ['Filing date', item.filingDate],
      ['Discovered at', item.discoveredAt], ['Discovery basis', item.discoveryBasis], ['Recorded at', item.recordedAt],
      ['Updated at', item.updatedAt], ['來源列出買方筆數 · 非完整群體', item.listedBuyerCount],
      ['Approximate purchase amount · 來源值', item.approximatePurchaseAmount], ['Person', item.personName], ['Role', item.personRole]]) fact(facts, label, data);
    body.append(facts);
    for (const [title, text] of [['Positive reasons', item.positiveReasons], ['Risks', item.risks]])
      body.append(element('h3', title), element('p', value(text), 'signal-prose'));
    body.append(element('h3', 'Quality flags'));
    const flags = element('ul'); flags.append(...(item.qualityFlags.length ? item.qualityFlags : ['無來源旗標']).map(f => element('li', f))); body.append(flags);
    body.append(element('h3', 'Buyers · 來源列出資料'));
    for (const buyer of item.buyers) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ person_name: 'Person', person_role: 'Role', transaction_date: 'Transaction date',
        filing_date: 'Filing date', shares: 'Shares', insider_execution_price: 'Insider execution price · 非策略進場價', transaction_amount: 'Transaction amount' })) fact(list, label, buyer[key]);
      body.append(list);
    }
    if (!item.buyers.length) body.append(element('p', '來源沒有列出買方明細；不代表沒有買方。'));
    body.append(element('h3', 'Source provenance'));
    for (const ref of item.provenance) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ sourceType: 'Source type', table: 'Source table', recordId: 'Record ID',
        documentId: 'Document ID', contentHash: 'Content hash', firstObservedAt: 'First observed at', lastObservedAt: 'Last observed at' })) fact(list, label, ref[key]);
      body.append(list);
    }
    dialog.showModal(); get('signalDetailClose').focus();
  }
  function render(payload, query) {
    const sourceObserved = payload.sources.find(s => s.sourceId === 'insider-reports')?.lastObservedAt;
    get('signalsSource').textContent = `Insider reports · Imported AI report · contract v1 · 本次查詢 ${payload.observedAt} · 成功來源觀察 ${value(sourceObserved)}`;
    const messages = { READY: 'READY', EMPTY: 'EMPTY · 此頁沒有符合條件的 report signals。',
      UNAVAILABLE: 'UNAVAILABLE · 來源未設定或目前無法唯讀讀取。', ERROR: 'ERROR · 來源回應無法安全解析。' };
    get('signalsStatus').textContent = messages[payload.dataState];
    get('signalsStatus').setAttribute('role', ['UNAVAILABLE', 'ERROR'].includes(payload.dataState) ? 'alert' : 'status');
    get('signalsWarnings').textContent = payload.warnings.join(' · ');
    const rows = get('signalsRows'); rows.replaceChildren();
    for (const item of payload.items) {
      const card = element('article', null, 'signal-card');
      const open = element('button', `${value(item.ticker)} · ${value(item.company)}`, 'signal-open');
      open.type = 'button'; open.addEventListener('click', () => detail(item, open)); card.append(open);
      if (onTicker && typeof item.ticker === 'string' && /^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(item.ticker.toUpperCase())) {
        const navigate = element('button', 'View ticker', 'ticker-link'); navigate.type = 'button';
        navigate.addEventListener('click', () => onTicker(item.ticker)); card.append(navigate);
      }
      const facts = element('dl', null, 'signal-facts');
      for (const [label, data] of [['Report date', item.reportDate], ['Event date · 交易日', item.eventDate],
        ['Investment Score', item.scores.investment.value], ['Signal Score', item.scores.signal.value],
        ['來源列出買方筆數', item.listedBuyerCount], ['Approximate amount · 來源值', item.approximatePurchaseAmount],
        ['Discovered at', item.discoveredAt], ['Discovery basis', item.discoveryBasis]]) fact(facts, label, data);
      card.append(facts, element('p', 'Imported AI report', 'signal-origin'),
        element('p', item.qualityFlags.length ? `⚠ ${item.qualityFlags.length} 個資料品質旗標 · 開啟明細查看` : '來源未列出資料品質旗標'));
      rows.append(card);
    }
    get('signalsPage').textContent = `本頁 ${payload.items.length} 筆 · offset ${query.offset} · 每頁 ${query.limit}；非總筆數`;
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
    get('signalsRows').replaceChildren(); get('signalsSource').textContent = '';
    get('signalsPage').textContent = ''; get('signalsWarnings').textContent = '';
    get('signalsStatus').setAttribute('role', 'status'); get('signalsStatus').textContent = 'Loading report signals…';
    get('signalsPrevious').disabled = get('signalsNext').disabled = true;
    const timer = setTimeout(() => requestController.abort(), 35000);
    try {
      const response = await fetcher(`/api/us/signals?${new URLSearchParams(requestedQuery)}`, { cache: 'no-store', signal: requestController.signal });
      if (!response.ok) throw new Error('SOURCE_REQUEST_FAILED');
      const payload = readSignals(await response.json(), requestedQuery);
      if (request === revision && active) render(payload, requestedQuery);
    } catch {
      if (request !== revision || !active) return;
      get('signalsStatus').textContent = 'ERROR · 無法取得 Signals；請重試。'; get('signalsStatus').setAttribute('role', 'alert');
    } finally { clearTimeout(timer); if (request === revision) panel.setAttribute('aria-busy', 'false'); }
  }
  get('signalsFilter').addEventListener('submit', event => {
    event.preventDefault(); const ticker = get('signalsTicker').value.trim().toUpperCase();
    if (ticker && !/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(ticker)) {
      get('signalsStatus').textContent = '請輸入有效 ticker（最多 16 字元，英數、點或連字號）。'; get('signalsTicker').focus(); return;
    }
    query = { limit: 50, offset: 0, ...(ticker ? { ticker } : {}) }; void load();
  });
  get('signalsReload').addEventListener('click', () => void load());
  get('signalsNext').addEventListener('click', () => { query = { ...query, offset: query.offset + query.limit }; void load(); });
  get('signalsPrevious').addEventListener('click', () => { query = { ...query, offset: Math.max(0, query.offset - query.limit) }; void load(); });
  return { show() { active = true; void load(); }, hide() { active = false; ++revision; controller?.abort(); close(); panel.setAttribute('aria-busy', 'false'); } };
}
