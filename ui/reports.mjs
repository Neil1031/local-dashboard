import { renderMarkdown } from './safe-markdown.mjs';

export const REPORT_LIST_TIMEOUT_MS = 35000, REPORT_DETAIL_TIMEOUT_MS = 75000;
const states = new Set(['READY', 'EMPTY', 'UNAVAILABLE', 'ERROR']);
const value = v => v == null || v === '' ? '—' : String(v);
export function exactReportDate(date, required = false) {
  if (!required && (date == null || date === '')) return null;
  if (typeof date !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || date.startsWith('0000-')) throw new Error('INVALID_REPORT_DATE');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('INVALID_REPORT_DATE');
  return date;
}
const invalid = () => { throw new Error('INVALID_REPORTS_RESPONSE'); };
const strings = v => Array.isArray(v) && v.every(x => typeof x === 'string');
const count = n => Number.isSafeInteger(n) && n >= 0;
function envelope(payload) {
  if (payload?.contractVersion !== 1 || !states.has(payload.dataState) || !strings(payload.warnings)
      || typeof payload.observedAt !== 'string' || !Number.isFinite(Date.parse(payload.observedAt)) || !Array.isArray(payload.sources)
      || !payload.sources.some(s => s?.sourceId === 'insider-report-documents' && s.sourceVersion === 1)) invalid();
}
function page(p, limit, offset, length, usable) {
  if (p?.limit !== limit || p.offset !== offset || typeof p.hasMore !== 'boolean' || length > limit
      || (p.hasMore ? !usable || length !== limit || p.nextOffset !== offset + limit || p.nextOffset > 1000000 : p.nextOffset !== null)) invalid();
}
function summary(item, date) {
  if (!item || typeof item.reportDate !== 'string' || exactReportDate(item.reportDate, true) !== item.reportDate
      || item.reportId !== `report:${item.reportDate}` || (date && item.reportDate !== date) || !strings(item.parseWarnings)) invalid();
  for (const key of ['importedAt', 'contentHash', 'createdAt', 'updatedAt']) if (!(item[key] === null || typeof item[key] === 'string')) invalid();
  for (const key of ['storedSignalCount', 'activeSignalCount', 'revisionCount']) if (!count(item[key])) invalid();
  if (item.activeSignalCount > item.storedSignalCount) invalid();
}
export function readReports(payload, query) {
  envelope(payload); if (!Array.isArray(payload.items)) invalid();
  const usable = ['READY', 'EMPTY'].includes(payload.dataState);
  if ((payload.dataState === 'READY') !== (payload.items.length > 0)) invalid();
  page(payload.page, query.limit, query.offset, payload.items.length, usable && payload.dataState === 'READY');
  const ids = new Set();
  for (const item of payload.items) { summary(item, query.date); if (ids.has(item.reportId)) invalid(); ids.add(item.reportId); }
  return payload;
}
export function readReportDetail(payload, query) {
  envelope(payload); const item = payload.item;
  if (payload.dataState !== 'READY') {
    if (item !== null) invalid(); page(payload.revisionPage, query.revisionLimit, query.revisionOffset, 0, false); return payload;
  }
  summary(item, query.reportDate);
  if (typeof item.rawMarkdown !== 'string' || !['MATCHED', 'MISSING'].includes(item.currentRevisionStatus)
      || (item.currentRevisionStatus === 'MATCHED' ? !count(item.currentRevisionId) || item.currentRevisionId === 0 : item.currentRevisionId !== null)
      || !Array.isArray(item.revisions)) invalid();
  page(payload.revisionPage, query.revisionLimit, query.revisionOffset, item.revisions.length, true);
  const ids = new Set();
  for (const row of item.revisions) {
    if (!count(row.revisionId) || !row.revisionId || ids.has(row.revisionId) || typeof row.isCurrent !== 'boolean'
        || !(row.contentHash === null || typeof row.contentHash === 'string') || !(row.importedAt === null || typeof row.importedAt === 'string')
        || row.isCurrent !== (row.contentHash === item.contentHash)
        || row.isCurrent && (item.currentRevisionStatus !== 'MATCHED' || row.revisionId !== item.currentRevisionId)) invalid();
    ids.add(row.revisionId);
  }
  if (item.revisions.length !== Math.min(query.revisionLimit, Math.max(0, item.revisionCount - query.revisionOffset))) invalid();
  return payload;
}

export function mountReports(document, fetcher = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id), panel = get('reportsConnected'), dialog = get('reportDetail');
  let active = false, current = 'all', listQuery = { limit: 20, offset: 0 }, detailQuery;
  let listRevision = 0, detailRevision = 0, listController, detailController, returnFocus;
  const connected = () => ['all', 'us'].includes(current);
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = String(text); if (className) node.className = className; return node; };
  const messages = { READY: 'READY', EMPTY: 'EMPTY · 沒有符合條件的 report。', UNAVAILABLE: 'UNAVAILABLE · 來源未設定或無法唯讀讀取。', ERROR: 'ERROR · 來源回應無法安全解析。' };
  function status(id, text, alert = false) { get(id).textContent = text; get(id).setAttribute('role', alert ? 'alert' : 'status'); }
  function clearDetail() {
    for (const id of ['reportMetadata', 'reportWarnings', 'reportBody', 'reportRevisions', 'reportRevisionState', 'reportRevisionPage', 'reportDetailSource']) get(id).replaceChildren();
    get('reportRevisionPrevious').disabled = get('reportRevisionNext').disabled = true;
  }
  function cancelDetail() { ++detailRevision; detailController?.abort(); dialog.setAttribute('aria-busy', 'false'); }
  function closeDetail() { cancelDetail(); if (dialog.open) dialog.close(); clearDetail(); }
  get('reportDetailClose').addEventListener('click', closeDetail);
  dialog.addEventListener('close', () => { cancelDetail(); clearDetail(); if (returnFocus?.isConnected) returnFocus.focus(); });
  function cancelList() { ++listRevision; listController?.abort(); panel.setAttribute('aria-busy', 'false'); }
  function clearList() {
    for (const id of ['reportsRows', 'reportsSource', 'reportsWarnings', 'reportsPageCount']) get(id).replaceChildren();
    get('reportsPrevious').disabled = get('reportsNext').disabled = true;
  }
  function source(payload) { const s = payload.sources.find(x => x.sourceId === 'insider-report-documents'); return `US Insider / AI report · contract v1 · 本次觀察 ${payload.observedAt} · 成功來源觀察 ${value(s?.lastObservedAt)}`; }
  function warnings(id, values) { get(id).replaceChildren(...values.map(text => element('li', text))); }
  function facts(node, item) {
    for (const [label, key] of [['Report date','reportDate'],['Source report ID','reportId'],['Current imported time','importedAt'],['Current stored content hash','contentHash'],
      ['Stored signals · 目前保留列','storedSignalCount'],['Active signals · 目前 active subset','activeSignalCount'],['Retained body/hash revisions','revisionCount'],['Created time','createdAt'],['Updated time','updatedAt']]) node.append(element('dt', label), element('dd', value(item[key])));
  }
  async function loadDetail() {
    if (!active || !connected() || !dialog.open || !detailQuery) return;
    detailController?.abort(); const request = ++detailRevision, controller = new AbortController(); detailController = controller;
    const query = { ...detailQuery }; clearDetail(); dialog.setAttribute('aria-busy', 'true'); status('reportDetailStatus', 'Loading report…');
    const timer = setTimeout(() => controller.abort(), REPORT_DETAIL_TIMEOUT_MS);
    try {
      const response = await fetcher(`/api/reports/us-insider/detail?${new URLSearchParams(query)}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('REPORT_REQUEST_FAILED'); const payload = readReportDetail(await response.json(), query);
      if (request !== detailRevision || !active || !connected() || !dialog.open) return;
      if (controller.signal.aborted) throw new Error('REPORT_REQUEST_ABORTED');
      status('reportDetailStatus', messages[payload.dataState], ['UNAVAILABLE', 'ERROR'].includes(payload.dataState));
      get('reportDetailSource').textContent = source(payload); warnings('reportWarnings', [...payload.warnings, ...(payload.item?.parseWarnings || [])]);
      if (payload.dataState !== 'READY') return;
      const item = payload.item; facts(get('reportMetadata'), item); renderMarkdown(document, get('reportBody'), item.rawMarkdown);
      get('reportRevisionState').textContent = `Current revision ${item.currentRevisionStatus} · ID ${value(item.currentRevisionId)}；current 可在本頁之外，MATCHED 不代表重算 hash。`;
      get('reportRevisions').replaceChildren(...item.revisions.map(row => { const li = element('li'); li.append(element('p', `Revision ${row.revisionId} · ${row.isCurrent ? 'isCurrent' : 'retained body/hash'}`), element('p', `Hash ${value(row.contentHash)}`), element('p', `首次觀察 ${value(row.importedAt)}`)); return li; }));
      get('reportRevisionPage').textContent = `本頁 ${item.revisions.length} 筆 revision metadata · offset ${query.revisionOffset} · 每頁 ${query.revisionLimit}；不是完整切換 timeline。`;
      get('reportRevisionPrevious').disabled = query.revisionOffset === 0; get('reportRevisionNext').disabled = !payload.revisionPage.hasMore;
    } catch {
      if (request !== detailRevision || !active || !dialog.open) return;
      clearDetail(); status('reportDetailStatus', 'ERROR · 無法安全取得 report；請重試。', true);
    } finally { clearTimeout(timer); if (request === detailRevision) dialog.setAttribute('aria-busy', 'false'); }
  }
  function openDetail(item, trigger) {
    closeDetail(); returnFocus = trigger; detailQuery = { reportDate: item.reportDate, revisionLimit: 20, revisionOffset: 0 };
    get('reportDetailTitle').textContent = `${item.reportDate} · US Insider report`; dialog.showModal(); get('reportDetailClose').focus(); void loadDetail();
  }
  async function loadList() {
    if (!active || !connected()) return;
    listController?.abort(); closeDetail(); const request = ++listRevision, controller = new AbortController(); listController = controller;
    const query = { ...listQuery }; clearList(); panel.setAttribute('aria-busy', 'true'); status('reportsStatus', 'Loading reports…');
    const timer = setTimeout(() => controller.abort(), REPORT_LIST_TIMEOUT_MS);
    try {
      const response = await fetcher(`/api/reports/us-insider?${new URLSearchParams(query)}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('REPORT_REQUEST_FAILED'); const payload = readReports(await response.json(), query);
      if (request !== listRevision || !active || !connected()) return; if (controller.signal.aborted) throw new Error('REPORT_REQUEST_ABORTED');
      status('reportsStatus', messages[payload.dataState], ['UNAVAILABLE','ERROR'].includes(payload.dataState)); get('reportsSource').textContent = source(payload); warnings('reportsWarnings', payload.warnings);
      get('reportsRows').replaceChildren(...payload.items.map(item => {
        const card = element('article', null, 'signal-card report-card'), open = element('button', item.reportDate, 'signal-open report-open'); open.type = 'button';
        open.addEventListener('click', () => openDetail(item, open)); const dl = element('dl', null, 'signal-facts'); facts(dl, item);
        card.append(element('p', 'US Insider / AI report', 'eyebrow'), open, element('p', `Parse warnings ${item.parseWarnings.length}`), dl);
        if (item.parseWarnings.length) { const list = element('ul'); list.append(...item.parseWarnings.map(text => element('li', text))); card.append(list); }
        return card;
      }));
      get('reportsPageCount').textContent = `本頁已載入 ${payload.items.length} 筆 · offset ${query.offset} · 每頁 ${query.limit}；非總報告數。`;
      get('reportsPrevious').disabled = query.offset === 0 || !['READY','EMPTY'].includes(payload.dataState); get('reportsNext').disabled = !payload.page.hasMore;
    } catch {
      if (request !== listRevision || !active || !connected()) return;
      clearList(); status('reportsStatus', 'ERROR · 無法安全取得 Reports；請重試。', true);
    } finally { clearTimeout(timer); if (request === listRevision) panel.setAttribute('aria-busy', 'false'); }
  }
  function select(next) {
    if (!['all','us','tw-daily','tw-weekly'].includes(next)) return;
    cancelList(); closeDetail(); current = next; panel.hidden = !connected(); get('reportsTw').hidden = connected();
    get('reportsConnectedTitle').textContent = current === 'all' ? 'All · 所有已接入來源（目前只有 US Insider）' : 'US Insider';
    get('reportsTwTitle').textContent = current === 'tw-daily' ? 'TW Daily · DESIGNED' : 'TW Weekly · DESIGNED';
    for (const button of document.querySelectorAll('[data-reports-page]')) { const selected = button.dataset.reportsPage === current; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
    if (active && connected()) void loadList();
  }
  document.querySelectorAll('[data-reports-page]').forEach(button => button.addEventListener('click', () => select(button.dataset.reportsPage)));
  get('reportsFilter').addEventListener('submit', event => {
    event.preventDefault(); try { const date = exactReportDate(get('reportsDate').value); listQuery = { limit: 20, offset: 0, ...(date ? { date } : {}) }; get('reportsValidation').textContent = ''; void loadList(); }
    catch { get('reportsValidation').textContent = '請輸入真實日曆日期 YYYY-MM-DD，或留空查看全部已接入報告。'; get('reportsDate').focus(); }
  });
  get('reportsReload').addEventListener('click', () => void loadList());
  for (const direction of ['Previous','Next']) get('reports' + direction).addEventListener('click', () => { listQuery = { ...listQuery, offset: Math.max(0, listQuery.offset + (direction === 'Next' ? 1 : -1) * listQuery.limit) }; void loadList(); });
  for (const direction of ['Previous','Next']) get('reportRevision' + direction).addEventListener('click', () => { if (detailQuery) { detailQuery = { ...detailQuery, revisionOffset: Math.max(0, detailQuery.revisionOffset + (direction === 'Next' ? 1 : -1) * detailQuery.revisionLimit) }; void loadDetail(); } });
  get('reportDetailReload').addEventListener('click', () => void loadDetail());
  return { show() { active = true; select(current); }, hide() { active = false; cancelList(); closeDetail(); } };
}
