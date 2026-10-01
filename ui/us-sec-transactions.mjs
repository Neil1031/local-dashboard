// SEC transaction facts only; no report joins, scoring or amendment reconciliation.
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const value = v => v == null || v === '' ? '—' : String(v);
const boolean = v => v == null ? '—' : v ? '是' : '否';
const candidate = v => v === true ? 'Candidate / 尚未認證' : '來源未標示候選；不代表已認證';
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
    const node = document.createElement(tag); if (text != null) node.textContent = String(text);
    if (className) node.className = className; return node;
  }
  function fact(list, label, data) { list.append(element('dt', label), element('dd', value(data))); }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  get('secDetailClose').addEventListener('click', close);
  function detail(item, trigger) {
    returnFocus = trigger; get('secDetailTitle').textContent = `${value(item.ticker)} · ${value(item.company)}`;
    const body = get('secDetailBody'); body.replaceChildren();
    body.append(element('p', 'Partial slice：P code 與 Candidate 均尚未認證。Form 4/A amendments/corrections 未對帳，不合併或刪除來源列。', 'signal-prose'));
    const facts = element('dl', null, 'signal-facts');
    for (const [label, data] of [['來源位置 ID · 非 immutable business-event ID', item.signalId], ['Transaction index', item.transactionIndex],
      ['Transaction date · 交易日', item.eventDate], ['Filing date · 申報日', item.filingDate], ['Filing accepted time', item.filingAcceptedAt],
      ['Local discovered time', item.discoveredAt], ['Discovery basis', item.discoveryBasis], ['Recorded at', item.recordedAt], ['Updated at', item.updatedAt],
      ['Code · P 不代表已認證買進', item.transactionCode], ['Security type', item.securityType], ['Security title', item.securityTitle],
      ['Acquired / disposed', item.acquiredDisposed], ['Shares', item.shares], ['Insider execution price · 非策略進場價', item.insiderExecutionPrice],
      ['Transaction amount', item.transactionAmount], ['Ownership after', item.ownershipAfter], ['Ownership increase %', item.ownershipIncreasePct],
      ['Direct / indirect', item.isDirect == null ? '—' : item.isDirect ? 'Direct' : 'Indirect'], ['10b5-1 · 來源狀態', boolean(item.is10b51)],
      ['Candidate open-market flag', candidate(item.candidateOpenMarketPurchase)], ['Review required', boolean(item.reviewRequired)],
      ['Filing-date source', item.filingDateSource], ['Filing-date metadata observed / updated at', item.filingDateMetadataUpdatedAt]]) fact(facts, label, data);
    body.append(facts, element('h3', 'Reporting owners · 全部來源列'));
    for (const owner of item.reportingOwners) {
      const list = element('dl', null, 'signal-facts');
      for (const [label, data] of [['Name', owner.name], ['CIK', owner.cik], ['Roles', owner.roles.join(' · ') || null]]) fact(list, label, data);
      body.append(list);
    }
    if (!item.reportingOwners.length) body.append(element('p', '來源未列出 owners；不代表沒有申報人。'));
    body.append(element('h3', 'Quality / review flags'));
    const flags = element('ul'); flags.append(...(item.qualityFlags.length ? item.qualityFlags : ['來源未列出旗標；不代表已完成審核']).map(f => element('li', f))); body.append(flags);
    body.append(element('h3', 'Footnotes'));
    for (const note of item.footnotes) body.append(element('p', `${note.id} · ${note.text}`, 'signal-prose'));
    if (!item.footnotes.length) body.append(element('p', '來源未列出 footnotes。'));
    body.append(element('h3', 'Sanitized source provenance'));
    for (const ref of item.provenance) {
      const list = element('dl', null, 'signal-facts');
      for (const [key, label] of Object.entries({ sourceType: 'Source type', table: 'Source table', recordId: 'Record ID', documentId: 'Accession / document ID',
        contentHash: 'Content hash', firstObservedAt: 'First observed at', lastObservedAt: 'Last observed at' })) fact(list, label, ref[key]);
      body.append(list);
    }
    dialog.showModal(); get('secDetailClose').focus();
  }
  function render(payload, query) {
    get('secSource').textContent = `Insider SEC · contract v1 · 本次查詢 ${payload.observedAt} · 成功來源觀察 ${value(payload.sources.find(s => s.sourceId === 'insider-sec')?.lastObservedAt)}`;
    const messages = { READY: 'READY', EMPTY: 'EMPTY · 此頁沒有符合條件的 SEC transactions。', UNAVAILABLE: 'UNAVAILABLE · 來源未設定或目前無法唯讀讀取。', ERROR: 'ERROR · 來源回應無法安全解析。' };
    get('secStatus').textContent = messages[payload.dataState]; get('secStatus').setAttribute('role', ['UNAVAILABLE', 'ERROR'].includes(payload.dataState) ? 'alert' : 'status');
    get('secWarnings').textContent = payload.warnings.join(' · ');
    const rows = get('secRows'); rows.replaceChildren();
    for (const item of payload.items) {
      const card = element('article', null, 'signal-card sec-card');
      const open = element('button', `${value(item.ticker)} · ${value(item.company)}`, 'signal-open sec-open'); open.type = 'button';
      open.addEventListener('click', () => detail(item, open)); card.append(open);
      if (onTicker && typeof item.ticker === 'string' && /^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(item.ticker.toUpperCase())) {
        const navigate = element('button', 'View ticker', 'ticker-link'); navigate.type = 'button';
        navigate.addEventListener('click', () => onTicker(item.ticker)); card.append(navigate);
      }
      const facts = element('dl', null, 'signal-facts');
      for (const [label, data] of [['Reporting owner(s)', item.reportingOwners.map(o => value(o.name)).join(' · ') || null], ['Transaction date', item.eventDate],
        ['Transaction code', item.transactionCode], ['Shares', item.shares], ['Insider execution price · 非策略進場價', item.insiderExecutionPrice],
        ['Transaction amount', item.transactionAmount], ['Filing date', item.filingDate], ['Security type', item.securityType],
        ['Candidate', candidate(item.candidateOpenMarketPurchase)], ['Review required', boolean(item.reviewRequired)]]) fact(facts, label, data);
      card.append(facts, element('p', `⚠ ${item.qualityFlags.length} 個品質／review 旗標 · 開啟明細查看`)); rows.append(card);
    }
    get('secPage').textContent = `本頁 ${payload.items.length} 筆 · offset ${query.offset} · 每頁 ${query.limit}；非總筆數`;
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
    for (const id of ['secRows', 'secSource', 'secPage', 'secWarnings']) get(id).replaceChildren();
    get('secStatus').setAttribute('role', 'status'); get('secStatus').textContent = 'Loading SEC transactions…';
    get('secPrevious').disabled = get('secNext').disabled = true;
    const timer = setTimeout(() => requestController.abort(), 35000);
    try {
      const response = await fetcher(`/api/us/sec-transactions?${new URLSearchParams(requestedQuery)}`, { cache: 'no-store', signal: requestController.signal });
      if (!response.ok) throw new Error('SOURCE_REQUEST_FAILED');
      const payload = readSecTransactions(await response.json(), requestedQuery); if (request === revision && active) render(payload, requestedQuery);
    } catch {
      if (request !== revision || !active) return;
      get('secStatus').textContent = 'ERROR · 無法取得 SEC Transactions；請重試。'; get('secStatus').setAttribute('role', 'alert');
    } finally { clearTimeout(timer); if (request === revision) panel.setAttribute('aria-busy', 'false'); }
  }
  get('secFilter').addEventListener('submit', event => {
    event.preventDefault(); const ticker = get('secTicker').value.trim().toUpperCase();
    if (ticker && !/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(ticker)) {
      get('secStatus').textContent = '請輸入有效 ticker（最多 16 字元，英數、點或連字號）。'; get('secTicker').focus(); return;
    }
    query = { limit: 50, offset: 0, ...(ticker ? { ticker } : {}) }; void load();
  });
  get('secReload').addEventListener('click', () => void load());
  get('secNext').addEventListener('click', () => { query = { ...query, offset: query.offset + query.limit }; void load(); });
  get('secPrevious').addEventListener('click', () => { query = { ...query, offset: Math.max(0, query.offset - query.limit) }; void load(); });
  return { show() { active = true; void load(); }, hide() { active = false; ++revision; controller?.abort(); close(); panel.setAttribute('aria-busy', 'false'); } };
}
