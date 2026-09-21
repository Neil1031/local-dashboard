// Current scheduler state and last execution result are separate API concepts.
const currentStatuses = new Set(['READY', 'RUNNING', 'FAILED', 'DISABLED', 'UNKNOWN', 'MISSED']);
const lastStatuses = new Set(['SUCCESS', 'FAILED', 'UNKNOWN']);
export const currentStatus = job => currentStatuses.has(job.status) ? job.status : 'UNKNOWN';
export const lastStatus = job => lastStatuses.has(job.lastRunStatus) ? job.lastRunStatus : 'UNKNOWN';
export const displayValue = value => value == null || value === '' ? '—' : String(value);
const jobDisplayNames = Object.freeze({
  'InsiderTracker-Market': '市場資料更新',
  'InsiderTracker-SEC': 'SEC 內部人交易更新',
  'InsiderTracker-SyncImport': '內部人資料同步',
  'AIStockHunter-UnexplainedVolume-HealthCheck': '異常成交量健康檢查',
  'AIStockHunter-Accumulation-Weekly-Check': '籌碼累積每週檢查'
});
const originalJobName = job => job?.taskName ?? job?.name ?? '';
export const jobDisplayName = job => jobDisplayNames[originalJobName(job)] ?? displayValue(originalJobName(job));
export const jobSubtitle = job => {
  const original = originalJobName(job);
  const path = typeof job?.taskPath === 'string' ? job.taskPath : '';
  return jobDisplayNames[original]
    ? [original, path && path !== '\\' ? path : ''].filter(Boolean).join(' · ')
    : displayValue(path || original);
};
export function formatDate(value) {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
export function summarize(jobs) {
  return {
    monitored: jobs.length,
    success: jobs.filter(job => lastStatus(job) === 'SUCCESS').length,
    failed: jobs.filter(job => lastStatus(job) === 'FAILED').length,
    attention: jobs.filter(job => ['FAILED', 'UNKNOWN', 'MISSED'].includes(currentStatus(job))).length
  };
}
export const filterJobs = (jobs, filter) => jobs.filter(job => filter === 'all' || currentStatus(job) === filter);

export function readSnapshot(payload) {
  if (payload?.collectionStatus === 'ERROR') {
    throw new Error([payload.code || 'COLLECTOR_ERROR', payload.message].filter(Boolean).join(' · '));
  }
  if (!['OK', 'PARTIAL', 'NOT_CONFIGURED'].includes(payload?.collectionStatus)
      || !Array.isArray(payload.jobs) || !Array.isArray(payload.errors)
      || !Array.isArray(payload.unmatchedIncludes)) throw new Error('INVALID_API_RESPONSE');
  const ids = new Set();
  for (const job of payload.jobs) {
    if (!job || typeof job.id !== 'string' || !job.id || ids.has(job.id)) throw new Error('INVALID_API_RESPONSE');
    ids.add(job.id);
  }
  if (payload.collectionStatus === 'NOT_CONFIGURED' && payload.jobs.length) throw new Error('INVALID_API_RESPONSE');
  return payload;
}

export const localDayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function historyWindow(now = new Date()) {
  const days = Array.from({ length: 7 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { days, from: days[0].toISOString(), to: end.toISOString() };
}
export function readHistory(payload, range) {
  const invalid = () => { throw new Error('INVALID_HISTORY_RESPONSE'); };
  if (!payload || Date.parse(payload.from) !== Date.parse(range.from)
      || Date.parse(payload.to) !== Date.parse(range.to) || !Array.isArray(payload.jobs)) invalid();
  const jobs = new Set(), runs = new Set();
  for (const job of payload.jobs) {
    if (!job || typeof job.id !== 'string' || !job.id || jobs.has(job.id)
        || typeof job.taskName !== 'string' || typeof job.taskPath !== 'string'
        || ![true, false, null].includes(job.enabled) || !Array.isArray(job.runs)) invalid();
    jobs.add(job.id);
    for (const run of job.runs) {
      if (!run || !Number.isSafeInteger(run.id) || runs.has(run.id)
          || typeof run.observedRunAt !== 'string' || !run.observedRunAt.endsWith('Z')
          || !Number.isFinite(Date.parse(run.observedRunAt))
          || Date.parse(run.observedRunAt) < Date.parse(range.from) || Date.parse(run.observedRunAt) >= Date.parse(range.to)
          || !['SUCCESS', 'FAILED'].includes(run.outcome)
          || !(run.schedulerResult === null || Number.isSafeInteger(run.schedulerResult))
          || !(run.durationMs === null || (Number.isSafeInteger(run.durationMs) && run.durationMs >= 0))
          || !(run.message === null || typeof run.message === 'string')) invalid();
      runs.add(run.id);
    }
  }
  return payload;
}
// Preserve sub-millisecond chronological order while grouping by browser-local day.
const preciseUtc = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(9, '0')}Z`);
export function aggregateDay(runs) {
  const ordered = [...runs].sort((a, b) => preciseUtc(a.observedRunAt).localeCompare(preciseUtc(b.observedRunAt)) || a.id - b.id);
  const failed = ordered.filter(run => run.outcome === 'FAILED').length;
  return { runs: ordered, count: ordered.length, failed, outcome: !ordered.length ? 'NONE' : failed ? 'FAILED' : 'SUCCESS' };
}
export function historyRows(currentJobs, historyJobs, range) {
  const rows = new Map(historyJobs.map(job => [job.id, { ...job, name: job.taskName, historyOnly: true }]));
  for (const job of currentJobs) rows.set(job.id, { ...job, runs: rows.get(job.id)?.runs || [], historyOnly: false });
  const keys = range.days.map(localDayKey);
  return [...rows.values()].map(job => {
    const groups = new Map(keys.map(key => [key, []]));
    for (const run of job.runs) {
      const instant = new Date(run.observedRunAt);
      if (instant >= new Date(range.from) && instant < new Date(range.to)) groups.get(localDayKey(instant))?.push(run);
    }
    return { ...job, days: keys.map(key => aggregateDay(groups.get(key))) };
  });
}

export function mountDashboard(document, fetchJobs = globalThis.fetch.bind(globalThis)) {
  const get = id => document.getElementById(id);
  const page = document.querySelector('.page');
  const tabs = [...document.querySelectorAll('.tab')];
  const filters = [...document.querySelectorAll('.filter')];
  let snapshot = null;
  let activeFilter = 'all';
  let busy = false;
  let returnFocus = null;
  let phase = 'loading';
  let historyCache = null, historyBusy = false, historyRevision = 0;
  let historyCurrentJobs = [];
  const label = status => status.charAt(0) + status.slice(1).toLowerCase();
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (arguments.length > 2) node.textContent = displayValue(text);
    return node;
  }
  function badge(status) {
    return element('span', `status ${status.toLowerCase()}`, label(status));
  }
  function closeDrawer() {
    get('drawer').classList.remove('open');
    page.inert = false;
    document.body.style.overflow = '';
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function openDrawer(job, row) {
    get('drawer').dataset.mode = 'current';
    get('detailGrid').hidden = false;
    get('currentWarnings').hidden = false;
    get('historyExecutions').hidden = true;
    returnFocus = row;
    get('drawerTitle').textContent = jobDisplayName(job);
    get('drawerSubtitle').textContent = jobSubtitle(job);
    const details = [
      ['Current status', label(currentStatus(job))], ['Scheduler state', job.state],
      ['Enabled', job.enabled === true ? 'Yes' : job.enabled === false ? 'No' : null],
      ['Last run status', label(lastStatus(job))], ['Last run', formatDate(job.lastRunAt)],
      ['Next run', formatDate(job.nextRunAt)], ['Last task result', job.lastTaskResult],
      ['Result text', job.resultText], ['Description', job.description]
    ];
    get('detailGrid').replaceChildren(...details.map(([title, value]) => {
      const detail = element('div', 'detail');
      detail.append(element('small', '', title), element('strong', '', value));
      return detail;
    }));
    get('jobWarnings').textContent = Array.isArray(job.warnings) && job.warnings.length
      ? job.warnings.map(displayValue).join('\n') : '—';
    page.inert = true;
    document.body.style.overflow = 'hidden';
    get('drawer').classList.add('open');
    get('closeDrawer').focus();
  }
  function openHistoryDrawer(job, day, cell, trigger) {
    returnFocus = trigger;
    get('drawer').dataset.mode = 'history';
    get('drawerTitle').textContent = jobDisplayName(job);
    get('drawerSubtitle').textContent = `${day.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Observed executions · ${jobSubtitle(job)}`;
    get('detailGrid').hidden = true;
    get('currentWarnings').hidden = true;
    get('historyExecutions').hidden = false;
    get('historyExecutions').replaceChildren(...cell.runs.map(run => {
      const item = element('li', 'history-execution detail');
      item.dataset.runId = run.id;
      const time = element('time', '', new Date(run.observedRunAt).toLocaleTimeString());
      time.dateTime = run.observedRunAt;
      item.append(time, element('strong', run.outcome.toLowerCase(), `${run.outcome === 'FAILED' ? '!' : '✓'} ${label(run.outcome)}`),
        element('div', '', `Result: ${displayValue(run.schedulerResult)}`));
      if (run.message) item.append(element('p', '', run.message));
      if (run.durationMs != null) item.append(element('div', '', `Duration: ${run.durationMs} ms`));
      return item;
    }));
    page.inert = true;
    document.body.style.overflow = 'hidden';
    get('drawer').classList.add('open');
    get('closeDrawer').focus();
  }
  function renderHistory() {
    const { payload, range } = historyCache;
    const rows = historyRows(historyCurrentJobs, payload.jobs, range);
    const head = element('tr', '');
    const jobHead = element('th', 'history-name', 'Job');
    jobHead.scope = 'col';
    head.append(jobHead, ...range.days.map((day, index) => {
      const node = element('th', 'history-head', index === 6 ? `Today · ${day.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}`
        : day.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));
      node.scope = 'col';
      return node;
    }));
    get('historyHead').replaceChildren(head);
    get('historyBody').replaceChildren(...rows.map(job => {
      const row = element('tr', 'history-row');
      row.dataset.job = job.id;
      const name = element('th', 'history-name');
      name.scope = 'row';
      name.append(element('span', 'history-job-name', jobDisplayName(job)), element('span', 'job-sub', jobSubtitle(job)));
      if (job.historyOnly) name.append(element('span', 'job-sub', 'History only'));
      row.append(name, ...job.days.map((cell, index) => {
        const td = element('td', '');
        const symbol = cell.outcome === 'NONE' ? '—' : cell.outcome === 'FAILED' ? '!' : '✓';
        const node = element(cell.count ? 'button' : 'span', `day-cell ${cell.count ? cell.outcome.toLowerCase() : 'none'}`,
          `${symbol}${cell.count > 1 ? ` ${cell.count}` : ''}`);
        node.setAttribute('aria-label', `${jobDisplayName(job)}, ${range.days[index].toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}, ${cell.count} runs, ${cell.failed} failed`);
        if (cell.count) {
          node.type = 'button';
          node.addEventListener('click', () => openHistoryDrawer(job, range.days[index], cell, node));
        }
        td.append(node);
        return td;
      }));
      return row;
    }));
    get('historyTableWrap').hidden = rows.length === 0;
    get('historyStatus').textContent = rows.length ? 'Select a day to see all observed executions.' : 'No observed executions or current jobs in this window.';
    get('historyStatus').setAttribute('role', 'status');
  }
  async function loadHistory() {
    if (historyBusy) return;
    const range = historyWindow();
    if (historyCache?.revision === historyRevision && historyCache.range.from === range.from && historyCache.range.to === range.to) {
      renderHistory();
      return;
    }
    const revision = historyRevision;
    historyBusy = true;
    get('historyView').setAttribute('aria-busy', 'true');
    get('historyTableWrap').hidden = true;
    get('historyStatus').setAttribute('role', 'status');
    get('historyStatus').textContent = 'Loading history…';
    get('historyRetry').hidden = true;
    try {
      const response = await fetchJobs(`/api/history?${new URLSearchParams({ from: range.from, to: range.to })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let payload;
      try { payload = await response.json(); } catch { throw new Error('INVALID_HISTORY_RESPONSE'); }
      historyCache = { payload: readHistory(payload, range), range, revision };
      if (revision === historyRevision) renderHistory();
    } catch (error) {
      historyCache = null;
      // Never reflect arbitrary proxy/database response bodies into this error UI.
      const reason = /^(HTTP \d{3}|INVALID_HISTORY_RESPONSE)$/.test(error.message) ? error.message : 'Unable to read history. Please retry.';
      get('historyStatus').textContent = `History unavailable · ${reason}`;
      get('historyStatus').setAttribute('role', 'alert');
      get('historyRetry').hidden = false;
    } finally {
      historyBusy = false;
      get('historyView').setAttribute('aria-busy', 'false');
      if (revision !== historyRevision && !get('historyView').hidden) void loadHistory();
    }
  }
  function renderRows() {
    const jobs = snapshot ? filterJobs(snapshot.jobs, activeFilter) : [];
    get('jobList').replaceChildren(...jobs.map(job => {
      const status = currentStatus(job);
      const row = element('button', 'job-row');
      row.type = 'button';
      row.dataset.status = status;
      row.dataset.job = job.id;
      const main = element('span', 'job-main');
      const icon = element('span', `job-icon ${status.toLowerCase()}`,
        { READY: '◷', RUNNING: '↻', FAILED: '!', DISABLED: 'Ⅱ', UNKNOWN: '?', MISSED: '⌁' }[status]);
      icon.setAttribute('aria-hidden', 'true');
      const name = element('span', 'job-text');
      name.append(element('span', 'job-name', jobDisplayName(job)), element('span', 'job-sub', jobSubtitle(job)));
      main.append(icon, name);
      row.append(main);
      for (const [title, date] of [['Next run', job.nextRunAt], ['Last run', job.lastRunAt]]) {
        const cell = element('span', 'meta');
        cell.append(element('span', 'cell-label', title), element('span', 'cell-value', formatDate(date)));
        row.append(cell);
      }
      const statuses = element('span', 'status-cell');
      statuses.append(element('span', 'cell-label', 'Current'), badge(status),
        element('span', 'job-sub', `Last run: ${label(lastStatus(job))}`));
      row.append(statuses, element('span', 'chev', '›'));
      row.addEventListener('click', () => openDrawer(job, row));
      return row;
    }));
    get('emptyState').hidden = jobs.length > 0;
    get('emptyState').textContent = phase === 'loading' ? '正在讀取排程…'
      : phase === 'error' ? '無法顯示目前排程。請查看上方錯誤後重試。'
      : snapshot?.collectionStatus === 'NOT_CONFIGURED'
        ? '尚未設定要監控的排程。請設定 dashboard.scheduler.include（config/application.yml；參見 README.md）。'
      : snapshot?.jobs.length === 0 ? '目前沒有可顯示的排程。' : 'No jobs match this filter ♡';
  }
  function showNotice(title, details = [], kind = 'info') {
    get('collectionNotice').className = `collection-notice ${kind}`;
    get('collectionNotice').setAttribute('role', kind === 'error' ? 'alert' : 'status');
    get('collectionTitle').textContent = title;
    get('collectionDetails').replaceChildren(...details.map(detail => element('li', '', detail)));
  }
  function summary(values) {
    for (const key of ['monitored', 'success', 'failed', 'attention']) get(`count-${key}`).textContent = values ? values[key] : '—';
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    phase = 'loading';
    closeDrawer();
    snapshot = null;
    summary(null);
    renderRows();
    get('refreshBtn').disabled = true;
    get('refreshBtn').textContent = '↻ Refreshing…';
    get('todayView').setAttribute('aria-busy', 'true');
    get('moodTitle').textContent = 'Reading scheduler';
    get('moodText').textContent = '正在取得目前排程狀態。';
    showNotice('正在讀取 Windows Task Scheduler…');
    try {
      // No polling, per-row detail requests, or fallback data. One request per refresh.
      const response = await fetchJobs('/api/jobs', { cache: 'no-store' });
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error(response.ok ? 'INVALID_API_RESPONSE' : `HTTP ${response.status}`); }
      if (!response.ok) throw new Error([`HTTP ${response.status}`, payload?.code, payload?.message].filter(Boolean).join(' · '));
      snapshot = readSnapshot(payload);
      historyCurrentJobs = snapshot.jobs;
      historyRevision++;
      phase = 'ready';
      summary(summarize(snapshot.jobs));
      get('refreshTime').textContent = formatDate(snapshot.collectedAt);
      const partial = snapshot.collectionStatus === 'PARTIAL';
      const unconfigured = snapshot.collectionStatus === 'NOT_CONFIGURED';
      showNotice(partial ? '部分排程資訊取得失敗 · PARTIAL'
        : unconfigured ? '尚未設定要監控的排程 · NOT_CONFIGURED' : '排程資訊已更新 · OK', [
        ...snapshot.errors.map(error => typeof error === 'string' ? error
          : [error?.code, error?.taskPath, error?.taskName, error?.message].filter(Boolean).join(' · ')),
        ...snapshot.unmatchedIncludes.map(value => `unmatchedIncludes: ${displayValue(value)}`)
      ], partial ? 'warning' : 'info');
      get('moodTitle').textContent = partial ? 'Collection needs attention' : unconfigured ? 'Your garden is waiting' : 'Scheduler snapshot';
      get('moodText').textContent = partial ? '已顯示可取得的工作；摘要僅涵蓋這些工作。'
        : unconfigured ? '設定監控清單後，就能在這裡查看排程。' : '最近執行結果不代表今日已執行，也不保證應用程式業務成功。';
    } catch (error) {
      snapshot = null;
      phase = 'error';
      summary(null);
      showNotice('無法讀取 Windows Task Scheduler', [error.message || 'BACKEND_UNAVAILABLE'], 'error');
      get('moodTitle').textContent = 'Collection unavailable';
      get('moodText').textContent = '目前狀態無法確認。請確認本機服務後再按 Refresh。';
    } finally {
      busy = false;
      get('refreshBtn').disabled = false;
      get('refreshBtn').textContent = '↻ Refresh';
      get('todayView').setAttribute('aria-busy', 'false');
      renderRows();
      if (!get('historyView').hidden) void loadHistory();
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      tabs.forEach(candidate => {
        const active = candidate === tab;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-selected', String(active));
        candidate.tabIndex = active ? 0 : -1;
      });
      const today = tab.dataset.tab === 'today';
      get('todayView').hidden = !today;
      get('historyView').hidden = today;
      document.querySelector('.filters').hidden = !today;
      if (!today) void loadHistory();
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  });
  filters.forEach(filter => filter.addEventListener('click', () => {
    activeFilter = filter.dataset.filter;
    filters.forEach(candidate => {
      candidate.classList.toggle('active', candidate === filter);
      candidate.setAttribute('aria-pressed', String(candidate === filter));
    });
    renderRows();
  }));
  get('closeDrawer').addEventListener('click', closeDrawer);
  get('drawer').addEventListener('click', event => { if (event.target === get('drawer')) closeDrawer(); });
  document.addEventListener('keydown', event => {
    if (!get('drawer').classList.contains('open')) return;
    if (event.key === 'Escape') closeDrawer();
    // Close is the only interactive element in this read-only drawer.
    if (event.key === 'Tab') { event.preventDefault(); get('closeDrawer').focus(); }
  });
  get('refreshBtn').addEventListener('click', refresh);
  get('historyRetry').addEventListener('click', loadHistory);
  return refresh();
}

if (typeof document !== 'undefined') mountDashboard(document);
