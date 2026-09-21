// Current scheduler state and last execution result are separate API concepts.
const currentStatuses = new Set(['READY', 'RUNNING', 'FAILED', 'DISABLED', 'UNKNOWN', 'MISSED']);
const lastStatuses = new Set(['SUCCESS', 'FAILED', 'UNKNOWN']);
export const currentStatus = job => currentStatuses.has(job.status) ? job.status : 'UNKNOWN';
export const lastStatus = job => lastStatuses.has(job.lastRunStatus) ? job.lastRunStatus : 'UNKNOWN';
export const displayValue = value => value == null || value === '' ? '—' : String(value);
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
    returnFocus = row;
    get('drawerTitle').textContent = displayValue(job.name);
    get('drawerSubtitle').textContent = displayValue(job.taskPath);
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
      name.append(element('span', 'job-name', job.name), element('span', 'job-sub', job.taskPath));
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
  return refresh();
}

if (typeof document !== 'undefined') mountDashboard(document);
