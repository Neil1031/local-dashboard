import { message, t, setText, setAttributeText, codeText, isMessage, initializeI18n } from './ui/i18n.mjs';
// Current scheduler state and last execution result are separate API concepts.
import { mountProjects } from './ui/projects.mjs';
import { mountShell } from './ui/shell.mjs';
import { mountOverview } from './ui/overview.mjs';
import { mountUsStocks } from './ui/us-stocks.mjs';
import { mountReports } from './ui/reports.mjs';
import { mountTwStocks } from './ui/tw-stocks.mjs';
import { mountTwHistory } from './ui/tw-history.mjs';
import { mountPerformance } from './ui/performance.mjs';
import { mountEvidence } from './ui/evidence.mjs';
const currentStatuses = new Set(['READY', 'RUNNING', 'FAILED', 'DISABLED', 'UNKNOWN', 'MISSED']);
const lastStatuses = new Set(['SUCCESS', 'FAILED', 'UNKNOWN']);
export const currentStatus = job => currentStatuses.has(job.status) ? job.status : 'UNKNOWN';
export const lastStatus = job => lastStatuses.has(job.lastRunStatus) ? job.lastRunStatus : 'UNKNOWN';
export const displayValue = value => value == null || value === '' ? '—' : String(value);
// UI-only, versioned defaults. A dependency describes data or display order; it never controls Scheduler.
export const jobMetadata = Object.freeze({
  'InsiderTracker-Market': { displayName: '市場資料更新', market: '美股', description: '更新既有訊號的行情與績效；不依賴當天的 SyncImport 或 SEC。', order: 10, dependsOn: [], legacy: false, hidden: false },
  'InsiderTracker-SyncImport': { displayName: '內部人資料同步', market: '美股', description: '同步並匯入 AI 日報。', order: 20, dependsOn: [{ task: '外部 AI 日報已產生並進 Git', kind: 'external' }], legacy: false, hidden: false },
  'InsiderTracker-SEC': { displayName: 'SEC 內部人交易更新', market: '美股', description: '抓取 SEC Form 4/4A；與其他 InsiderTracker 工作共用 pipeline lock。', order: 30, dependsOn: [{ task: 'InsiderTracker-SyncImport', kind: 'orderOnly' }], legacy: false, hidden: false },
  'AIStockHunter-UnexplainedVolume-Daily': { displayName: '異常成交量每日掃描', market: '台股', description: '主要資料產生流程：累積每日正式資料並掃描異常成交量。', order: 10, dependsOn: [], legacy: false, hidden: false },
  'AIStockHunter-Accumulation-Weekly-Check': { displayName: '籌碼累積每週檢查', market: '台股', description: '檢查本週 Daily 累積資料完整性；不要求執行前立刻先跑 Daily。', order: 30, dependsOn: [{ task: 'AIStockHunter-UnexplainedVolume-Daily', kind: 'data', note: '本週已有 Daily 資料' }], legacy: false, hidden: false },
  'AIStockHunter-Accumulation-Check-*': { displayName: '籌碼累積上線檢查', market: '台股', description: '一次性上線／日期型驗收；需要對應日期的 Daily 資料。', order: 20, dependsOn: [{ task: 'AIStockHunter-UnexplainedVolume-Daily', kind: 'data', note: '對應日期 Daily 已產生資料' }], legacy: false, hidden: false },
  'AIStockHunter-UnexplainedVolume-HealthCheck': { displayName: '舊版異常成交量健康檢查', market: '台股', description: '舊版異常成交量健康檢查排程。', order: 90, dependsOn: [], legacy: true, hidden: true },
  'AIStockHunter-UnexplainedVolume-V2-Weekly': { displayName: '舊版異常成交量每週檢查', market: '台股', description: '舊版異常成交量 V2 每週排程。', order: 100, dependsOn: [], legacy: true, hidden: true }
});
let userOverrides = {};
export function setMetadataOverrides(overrides = {}) { userOverrides = overrides; }
const originalJobName = job => job?.taskName ?? job?.name ?? '';
const datedPrefix = 'AIStockHunter-Accumulation-Check-';
export const datedTaskDate = job => {
  const name = originalJobName(job);
  if (!name.startsWith(datedPrefix)) return null;
  const date = name.slice(datedPrefix.length);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? date : null;
};
function resolveMetadata(name, withoutExactUserOverride = false) {
  const pattern = datedTaskDate({ name }) ? 'AIStockHunter-Accumulation-Check-*' : null;
  const exactDefault = Object.hasOwn(jobMetadata, name) ? jobMetadata[name] : null;
  const patternDefault = pattern && jobMetadata[pattern];
  const patternOverride = pattern && Object.hasOwn(userOverrides, pattern) ? userOverrides[pattern] : null;
  const exactOverride = !withoutExactUserOverride && Object.hasOwn(userOverrides, name) ? userOverrides[name] : null;
  if (!exactDefault && !patternDefault && !patternOverride && !exactOverride) return null;
  if (!patternOverride && !exactOverride) return exactDefault ?? patternDefault;
  return { ...(patternDefault || {}), ...(exactDefault || {}), ...(patternOverride || {}), ...(exactOverride || {}) };
}
export const metadataFor = job => resolveMetadata(originalJobName(job));
export const effectiveMetadataWithoutExactUserOverride = key => resolveMetadata(key, true) ?? {};
export const jobDisplayName = job => {
  const metadata = metadataFor(job);
  return metadata ? `${metadata.displayName}${originalJobName(job).startsWith('AIStockHunter-Accumulation-Check-') ? ` · ${originalJobName(job).slice(-10)}` : ''}` : displayValue(originalJobName(job));
};
export const jobSubtitle = job => {
  const original = originalJobName(job);
  const path = typeof job?.taskPath === 'string' ? job.taskPath : '';
  return metadataFor(job)
    ? [original, path && path !== '\\' ? path : ''].filter(Boolean).join(' · ')
    : displayValue(path || original);
};
const marketRank = Object.freeze({ '台股': 0, '美股': 1, '其他': 2 });
export const jobMarket = job => metadataFor(job)?.market ?? '其他';
export const visibleJobs = (jobs, showLegacy = false) => jobs.filter(job => {
  const metadata = metadataFor(job);
  return !metadata?.hidden || (showLegacy && metadata.legacy && !userOverrides[originalJobName(job)]?.hidden);
});
export const orderedJobs = jobs => [...jobs].sort((a, b) =>
  marketRank[jobMarket(a)] - marketRank[jobMarket(b)]
  || (metadataFor(a)?.order ?? Number.MAX_SAFE_INTEGER) - (metadataFor(b)?.order ?? Number.MAX_SAFE_INTEGER)
  || (metadataFor(a) && metadataFor(b) ? originalJobName(a).localeCompare(originalJobName(b)) : 0));
export const downstreamJobs = (job, jobs) => orderedJobs(jobs.filter(candidate =>
  metadataFor(candidate)?.dependsOn?.some(dependency => dependency.task === originalJobName(job))
  || false));
// Presentation grouping only: every member remains the original job object and ID.
export function foldDatedJobs(jobs) {
  const dated = jobs.filter(job => datedTaskDate(job));
  if (!dated.length) return jobs.map(job => ({ kind: 'job', job }));
  dated.sort((a, b) => datedTaskDate(b).localeCompare(datedTaskDate(a)));
  const latestDate = datedTaskDate(dated[0]);
  const group = { kind: 'dated', latest: dated.filter(job => datedTaskDate(job) === latestDate),
    history: dated.filter(job => datedTaskDate(job) !== latestDate), date: latestDate };
  let inserted = false;
  return jobs.flatMap(job => {
    if (!datedTaskDate(job)) return [{ kind: 'job', job }];
    if (inserted) return [];
    inserted = true;
    return [group];
  });
}
export function viewCounts(jobs, showLegacy, filter, expanded = false) {
  const eligible = visibleJobs(jobs, showLegacy);
  const filtered = filterJobs(eligible, filter);
  const folded = expanded ? 0 : foldDatedJobs(filtered).reduce((sum, entry) => sum + (entry.kind === 'dated' ? entry.history.length : 0), 0);
  return { visible: filtered.length - folded, legacyHidden: jobs.length - eligible.length,
    filteredOut: eligible.length - filtered.length, folded };
}
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
  initializeI18n(document);
  const get = id => document.getElementById(id);
  const page = document.querySelector('.page');
  const tabs = [...document.querySelectorAll('.tab')];
  const projects = mountProjects(document, fetchJobs);
  const signals = mountUsStocks(document, fetchJobs);
  const reports = mountReports(document, fetchJobs);
  const twStocks = mountTwHistory(document, fetchJobs, mountTwStocks(document, fetchJobs));
  const performance = mountPerformance(document, fetchJobs);
  const evidence = mountEvidence(document, fetchJobs);
  const filters = [...document.querySelectorAll('.filter')];
  let snapshot = null;
  let runnerSnapshot = null;
  let runnerRequest = null;
  let runnerJob = null, runnerRevision = 0;
  const runnerKey = job => `${job.taskPath ?? ''}${originalJobName(job)}`;
  const mappedRunner = job => runnerSnapshot?.jobs?.find(item => item?.schedulerTask === runnerKey(job));
  function evidenceAge(value) {
    if (!value) return '—';
    const elapsed = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(elapsed)) return '—';
    if (elapsed < 0) return message("automations.wording");
    if (elapsed < 3600000) return message("automations.1");
    if (elapsed < 86400000) return message("automations.wording.2", { value0: Math.floor(elapsed / 3600000) });
    return message("automations.wording.3", { value0: Math.floor(elapsed / 86400000) });
  }
  function renderCoverage() {
    const body = get('runnerCoverageBody');
    const warnings = get('runnerDiagnosticsWarnings');
    warnings.replaceChildren();
    if (!snapshot || !runnerSnapshot) { setText(body, message("automations.runner")); return; }
    if (runnerSnapshot.status !== 'OK') {
      setText(body, runnerSnapshot.status === 'NOT_CONFIGURED'
        ? message("automations.runner.coverage.unavailable.runner.config")
        : message("automations.runner.coverage.unavailable.runner.config.receipt"));
    } else {
      const rows = snapshot.jobs.map(job => mappedRunner(job));
      const count = state => rows.filter(item => item?.coverageState === state).length;
      const mapped = rows.filter(Boolean).length;
      setText(body, message("automations.monitored.jobs.mapped.with.evidence.no.receipt.yet.profile.missing.r", { value0: rows.length, value1: mapped, value2: count('RUNNER_EVIDENCE_AVAILABLE'), value3: count('MAPPED_NO_RECEIPT'), value4: count('MAPPED_PROFILE_MISSING'), value5: count('RUNNER_UNAVAILABLE'), value6: rows.length - mapped }));
      const roots = runnerSnapshot.roots ?? {};
      const root = element('p', '', message("automations.runner.config.configured.primary.receipts.fallback.receipts", { value0: roots.primary ?? message("common.unknown"), value1: roots.fallback ?? message("common.unknown") }));
      const readiness = element('p', '', message("automations.missed.detection.readiness.not.ready.monitored.jobs.unmapped.expecte", { value0: rows.length - mapped }));
      body.append(root, readiness);
      if (runnerSnapshot.jobs.length) {
        const mappings = document.createElement('details');
        mappings.append(element('summary', '', message("automations.runner.mappings", { value0: runnerSnapshot.jobs.length })));
        const list = element('ul', '');
        list.append(...runnerSnapshot.jobs.map(item => element('li', '',
          message("automations.profile.job.id.latest.evidence", { value0: item.schedulerTask, value1: item.profileId, value2: item.profileStatus ?? message("common.unknown"), value3: displayValue(item.jobId), value4: formatDate(item.latestEvidenceAt) }))));
        mappings.append(list); body.append(mappings);
      }
    }
    if (Array.isArray(runnerSnapshot.warnings) && runnerSnapshot.warnings.length) {
      warnings.append(element('strong', '', message("automations.runner.diagnostics.warnings")));
      const list = element('ul', '');
      list.append(...runnerSnapshot.warnings.map(warning => element('li', '', warning)));
      warnings.append(list);
    }
  }
  let activeFilter = 'all';
  let showLegacy = false;
  let todayExpanded = false, historyExpanded = false;
  let busy = false;
  let returnFocus = null;
  let phase = 'loading';
  let historyCache = null, historyBusy = false, historyRevision = 0;
  let historyCurrentJobs = [], historyState = 'loading';
  const overview = mountOverview(document, { summarize, runnerKey, displayName: jobDisplayName, formatDate, openJob: openDrawer });
  const needsHistory = () => shell.current === 'overview' || (shell.current === 'automations' && !get('historyView').hidden);
  const renderOverview = () => overview.render({ snapshot, phase, historyCache, historyRevision, historyState, runnerSnapshot });
  const shell = mountShell(document, page => {
    if (page === 'us') signals.show(); else signals.hide();
    if (page === 'reports') reports.show(); else reports.hide();
    if (page === 'tw') twStocks.show(); else twStocks.hide();
    performance.show(page);
    if (page === 'evidence') evidence.show(); else evidence.hide();
    if (page === 'projects') projects.show();
    if (page === 'settings') renderSettingList();
    if (phase !== 'loading' && !busy && needsHistory()) void loadHistory();
    renderOverview();
  });
  let settingsRevision = null;
  let selectedSetting = null;
  let settingsAvailable = false;
  const marketLabel = market => ({ '台股': message('nav.twStocks'), '美股': message('nav.usStocks'), '其他': message("chrome.wording.13") })[market] ?? market;
  const label = status => codeText(status);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (arguments.length > 2) setText(node, text, value => isMessage(value) ? String(value) : displayValue(value));
    return node;
  }
  function badge(status) {
    return element('span', `status ${status.toLowerCase()}`, label(status));
  }
  const settingKeys = () => [...new Set([...Object.keys(jobMetadata), ...Object.keys(userOverrides),
    ...(snapshot?.jobs ?? []).map(originalJobName).filter(Boolean)])];
  function settingsMessage(message, error = false) {
    setText(get('settingsMessage'), message);
    get('settingsMessage').setAttribute('role', error ? 'alert' : 'status');
  }
  function renderSettingList() {
    get('knownSettingJobs').replaceChildren(...settingKeys().map(key => {
      const option = document.createElement('option'); option.value = key; return option;
    }));
    get('settingsJobs').replaceChildren(...settingKeys().map(key => {
      const item = element('button', '', key);
      item.type = 'button';
      item.setAttribute('aria-current', String(key === selectedSetting));
      item.addEventListener('click', () => selectSetting(key));
      return item;
    }));
    get('settingsForm').hidden = !selectedSetting;
  }
  function dependencyRow(dependency = { task: '', kind: 'data' }) {
    const row = element('div', 'dependency-row');
    if (dependency.note) row.dataset.note = dependency.note;
    row.dataset.originalTask = dependency.task;
    row.dataset.originalKind = dependency.kind;
    const task = document.createElement('input');
    task.value = dependency.task;
    task.maxLength = 200;
    task.required = true;
    setAttributeText(task, 'aria-label', message("automations.task"));
    task.setAttribute('list', 'knownSettingJobs');
    const kind = document.createElement('select');
    setAttributeText(kind, 'aria-label', message("automations.wording.4"));
    for (const [value, title] of [['data', message("automations.wording.5")], ['external', message("automations.wording.6")], ['orderOnly', message("automations.wording.7")]]) {
      const option = document.createElement('option'); option.value = value; setText(option, title); kind.append(option);
    }
    kind.value = dependency.kind;
    const remove = element('button', '', message("automations.wording.8")); remove.type = 'button';
    remove.addEventListener('click', () => row.remove());
    row.append(task, kind, remove);
    return row;
  }
  function selectSetting(key) {
    selectedSetting = key;
    const metadata = metadataFor({ name: key }) ?? {};
    get('settingRawName').value = key;
    get('settingDisplayName').value = metadata.displayName ?? key;
    get('settingMarket').value = metadata.market ?? '其他';
    get('settingDescription').value = metadata.description ?? '';
    get('settingOrder').value = metadata.order ?? 10000;
    get('settingHidden').checked = metadata.hidden ?? false;
    get('settingDependencies').replaceChildren(...(metadata.dependsOn ?? []).map(dependencyRow));
    renderSettingList();
    settingsMessage('');
  }
  async function loadSettings() {
    try {
      const response = await fetchJobs('/api/settings/job-metadata', { cache: 'no-store' });
      if (!response.ok) throw new Error('SETTINGS_UNAVAILABLE');
      const state = await response.json();
      if (state.version !== 1 || !state.overrides || typeof state.overrides !== 'object' || Array.isArray(state.overrides)) throw new Error('INVALID_SETTINGS_RESPONSE');
      setMetadataOverrides(state.overrides);
      settingsRevision = state.revision;
      settingsAvailable = !state.warning;
      settingsMessage(state.warning ?? '');
      get('settingsWarning').hidden = !state.warning;
    } catch {
      setMetadataOverrides({}); settingsRevision = null; settingsAvailable = false;
      settingsMessage(message("automations.wording.9"), true);
      get('settingsWarning').hidden = false;
    }
    renderSettingList();
    if (selectedSetting) selectSetting(selectedSetting);
    if (snapshot) { renderRows(); if (historyCache && !get('historyView').hidden) renderHistory(); }
    renderOverview();
  }
  async function saveSettings(next) {
    if (!settingsAvailable || settingsRevision === null) { settingsMessage(message("automations.wording.10"), true); return; }
    try {
      const response = await fetchJobs('/api/settings/job-metadata', { method: 'PUT', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: settingsRevision, overrides: next }) });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (error.code === 'REVISION_CONFLICT') {
          await loadSettings(); settingsMessage(message("automations.wording.11"), true);
        } else if (error.code === 'INVALID_DEPENDENCY') settingsMessage(message("automations.task.metadata"), true);
        else if (error.code === 'DEPENDENCY_CYCLE') settingsMessage(message("automations.wording.12"), true);
        else if (error.code === 'INVALID_ORDER') settingsMessage(message("automations.0.10000"), true);
        else if (error.code === 'INVALID_FILE') { await loadSettings(); settingsMessage(message("automations.wording.13"), true); }
        else settingsMessage(message("automations.wording.14"), true);
        return;
      }
      const state = await response.json();
      settingsRevision = state.revision;
      setMetadataOverrides(state.overrides);
      renderSettingList();
      if (selectedSetting) selectSetting(selectedSetting);
      renderRows();
      if (historyCache && !get('historyView').hidden) renderHistory();
      renderOverview();
      settingsMessage(message("automations.wording.15"));
    } catch { settingsMessage(message("automations.wording.16"), true); }
  }
  function renderWorkflow() {
    const entries = snapshot ? foldDatedJobs(orderedJobs(visibleJobs(snapshot.jobs))) : [];
    const sections = [];
    for (const market of ['台股', '美股']) {
      const jobs = entries.flatMap(entry => entry.kind === 'dated' ? entry.latest : [entry.job])
        .filter(job => jobMarket(job) === market && metadataFor(job)?.order <= 30);
      if (!jobs.length) continue;
      const section = element('section', 'workflow-market');
      section.append(element('h3', '', message("automations.wording.17", { value0: marketLabel(market) })));
      const list = element('ul', 'workflow-list');
      for (const job of jobs) {
        const item = element('li', 'workflow-item');
        const card = element('button', 'workflow-card');
        card.type = 'button';
        card.dataset.job = job.id;
        card.append(element('span', 'workflow-name', jobDisplayName(job)), badge(currentStatus(job)));
        card.addEventListener('click', () => openDrawer(job, card));
        item.append(card);
        const dependencies = metadataFor(job).dependsOn ?? [];
        for (const dependency of dependencies) {
          const upstream = metadataFor({ name: dependency.task })?.displayName ?? dependency.task;
          const kind = dependency.kind === 'data' ? message("automations.wording.18", { value0: upstream, value1: dependency.note ? `（${dependency.note}）` : '' })
            : dependency.kind === 'external' ? message("automations.wording.19", { value0: dependency.task })
              : message("automations.wording.20", { value0: upstream });
          item.append(element('p', 'workflow-relation', kind));
        }
        if (originalJobName(job) === 'InsiderTracker-Market') {
          item.append(element('p', 'workflow-relation', message("automations.syncimport.sec")));
        }
        if (originalJobName(job) === 'AIStockHunter-UnexplainedVolume-Daily') {
          const downstream = [...new Set(downstreamJobs(job, snapshot.jobs)
            .map(candidate => metadataFor(candidate)?.displayName).filter(Boolean))];
          if (downstream.length) item.append(element('p', 'workflow-relation',
            message("automations.wording.21", { value0: downstream.join('、') })));
        }
        list.append(item);
      }
      section.append(list);
      sections.push(section);
    }
    get('workflowMarkets').replaceChildren(...sections);
    get('workflowView').hidden = sections.length === 0;
  }
  function renderMetadata(job, candidates) {
    const metadata = metadataFor(job);
    const dependencies = metadata?.dependsOn ?? [];
    const downstream = downstreamJobs(job, candidates);
    const formatDependency = dependency => {
      const known = metadataFor({ name: dependency.task });
      const title = known ? `${known.displayName}（${dependency.task}）` : dependency.task;
      const kind = dependency.kind === 'orderOnly' ? message("automations.wording.22")
        : dependency.kind === 'external' ? message("automations.wording.6") : dependency.note || message("automations.wording.5");
      return message('display.wording.4', { value0: title, value1: kind });
    };
    const details = [
      [message("automations.wording.23"), jobMarket(job)],
      [message("automations.wording.24"), metadata?.description ?? displayValue(job.description)],
      [message("automations.task.2"), dependencies.length ? message('common.heldText', { text: dependencies.map(formatDependency) }) : message("automations.task.3")],
      [message("automations.task.4"), downstream.length
        ? downstream.map(candidate => `${jobDisplayName(candidate)}（${originalJobName(candidate)}）`).join('；')
        : message("automations.task.5")]
    ];
    get('metadataGrid').replaceChildren(...details.map(([title, value]) => {
      const detail = element('div', 'detail');
      detail.append(element('small', '', title), element('strong', '', value));
      return detail;
    }));
  }
  function closeDrawer() {
    get('drawer').classList.remove('open');
    page.inert = false;
    document.body.style.overflow = '';
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function renderRunner(job) {
    const section = get('runnerExecution');
    section.hidden = false;
    const summary = get('runnerSummary');
    const recent = get('runnerRecent');
    const diagnostics = get('runnerDiagnostics');
    diagnostics.replaceChildren();
    recent.replaceChildren();
    if (!runnerSnapshot) { setText(summary, message("automations.runner.receipt")); return; }
    if (runnerSnapshot.status === 'UNAVAILABLE') {
      setText(summary, message("automations.runner.receipt.2")); return;
    }
    if (runnerSnapshot.status === 'NOT_CONFIGURED') {
      setText(summary, message("automations.runner.receipt.3")); return;
    }
    const mapped = mappedRunner(job);
    if (!mapped) { setText(summary, message("automations.runner.mapping.not.configured")); return; }
    const fields = [
      [message("automations.mapping"), message("automations.configured")], [message("common.runner.profile"), mapped.profileId],
      [message("automations.profile"), mapped.profileStatus === 'MISSING' ? message("automations.missing") : message("automations.available")],
      [message("common.job.id"), mapped.jobId], [message("automations.receipt.source"), message("common.receiptRoots", { primary: runnerSnapshot.roots?.primary ?? message("common.unknown"), fallback: runnerSnapshot.roots?.fallback ?? message("common.unknown") })],
      [message("automations.coverage"), mapped.coverageState], [message("automations.latest.evidence"), formatDate(mapped.latestEvidenceAt)],
      [message("automations.evidence.age"), evidenceAge(mapped.latestEvidenceAt)]
    ];
    diagnostics.append(...fields.map(([title, value]) => {
      const field = element('div', 'detail');
      field.append(element('small', '', title), element('strong', '', value));
      return field;
    }));
    if (!Array.isArray(mapped.executions) || !Array.isArray(mapped.warnings)) {
      setText(summary, message("automations.runner.receipt.2")); return;
    }
    if (!mapped.executions.length) {
      setText(summary, mapped.warnings.length ? message("automations.runner.receipt.4", { value0: mapped.warnings.join('；') }) : message("automations.runner.2"));
      return;
    }
    setText(summary, message("automations.wording.25", { value0: formatDate(mapped.executions[0].startedAt), value1: mapped.executions[0].receiptCompleteness, value2: mapped.warnings.length ? message('automations.warningCountSuffix', { count: mapped.warnings.length }) : '' }));
    for (const execution of mapped.executions.slice(0, 5)) {
      const item = element('li', 'runner-entry');
      const detail = document.createElement('details');
      const headline = element('summary', '', message("automations.child.exit", { value0: formatDate(execution.startedAt), value1: execution.runnerOutcome, value2: displayValue(execution.childExitCode), value3: execution.durationMs == null ? message("automations.duration") : message("automations.runner.duration.s", { value0: (execution.durationMs / 1000).toFixed(3) }) }));
      const fields = [
        [message("common.execution.id"), execution.executionId], [message("automations.phase"), codeText(execution.state)], [message("automations.receipt"), execution.receiptCompleteness],
        [message("automations.evidence"), execution.phases.join(' → ')], [message("automations.started"), formatDate(execution.startedAt)],
        [message("automations.process.started"), formatDate(execution.processStartedAt)],
        [message("automations.child.started"), execution.childStarted === true ? message("common.yes") : execution.childStarted === false ? message("common.no") : message("common.unknown")],
        [message("automations.terminal"), formatDate(execution.terminalAt)], [message("automations.child.exit.code"), execution.childExitCode],
        [message("automations.runner.exit.code"), execution.runnerExitCode], [message("automations.runner.outcome"), execution.runnerOutcome],
        [message("common.reason"), execution.reason], [message("common.source"), execution.source],
        [message("common.warnings"), [...(execution.warnings ?? []), ...(mapped.warnings ?? [])].join('；') || '—']
      ];
      const grid = element('div', 'detail-grid');
      grid.append(...fields.map(([title, value]) => {
        const field = element('div', 'detail');
        field.append(element('small', '', title), element('strong', '', value));
        return field;
      }));
      detail.append(headline, grid); item.append(detail); recent.append(item);
    }
  }
  function openDrawer(job, row) {
    get('drawer').dataset.mode = 'current';
    get('detailGrid').hidden = false;
    get('currentWarnings').hidden = false;
    get('historyExecutions').hidden = true;
    returnFocus = row;
    setText(get('drawerTitle'), jobDisplayName(job));
    setText(get('drawerSubtitle'), jobSubtitle(job));
    renderMetadata(job, snapshot?.jobs ?? []);
    runnerJob = job;
    renderRunner(job);
    const details = [
      [message("automations.current.status"), label(currentStatus(job))], [message("automations.scheduler.state"), codeText(job.state)],
      [message("automations.enabled"), job.enabled === true ? message("common.yes") : job.enabled === false ? message("common.no") : null],
      [message("automations.last.run.status"), label(lastStatus(job))], [message("automations.last.run"), formatDate(job.lastRunAt)],
      [message("automations.next.run"), formatDate(job.nextRunAt)], [message("automations.last.task.result"), job.lastTaskResult],
      [message("automations.result.text"), job.resultText], [message("automations.description"), job.description]
    ];
    get('detailGrid').replaceChildren(...details.map(([title, value]) => {
      const detail = element('div', 'detail');
      detail.append(element('small', '', title), element('strong', '', value));
      return detail;
    }));
    setText(get('jobWarnings'), Array.isArray(job.warnings) && job.warnings.length
      ? job.warnings.map(displayValue).join('\n') : '—');
    page.inert = true;
    document.body.style.overflow = 'hidden';
    get('drawer').classList.add('open');
    get('closeDrawer').focus();
  }
  function openHistoryDrawer(job, day, cell, trigger) {
    returnFocus = trigger;
    get('drawer').dataset.mode = 'history';
    setText(get('drawerTitle'), jobDisplayName(job));
    setText(get('drawerSubtitle'), message("automations.observed.executions", { value0: day.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), value1: jobSubtitle(job) }));
    renderMetadata(job, historyRows(historyCurrentJobs, historyCache.payload.jobs, historyCache.range));
    get('detailGrid').hidden = true;
    get('runnerExecution').hidden = true;
    get('currentWarnings').hidden = true;
    get('historyExecutions').hidden = false;
    get('historyExecutions').replaceChildren(...cell.runs.map(run => {
      const item = element('li', 'history-execution detail');
      item.dataset.runId = run.id;
      const time = element('time', '', new Date(run.observedRunAt).toLocaleTimeString());
      time.dateTime = run.observedRunAt;
      item.append(time, element('strong', run.outcome.toLowerCase(), message("display.wording", { value0: run.outcome === 'FAILED' ? '!' : '✓', value1: label(run.outcome) })),
        element('div', '', message("automations.result", { value0: displayValue(run.schedulerResult) })));
      if (run.message) item.append(element('p', '', run.message));
      if (run.durationMs != null) item.append(element('div', '', message("automations.duration.ms", { value0: run.durationMs })));
      return item;
    }));
    page.inert = true;
    document.body.style.overflow = 'hidden';
    get('drawer').classList.add('open');
    get('closeDrawer').focus();
  }
  function makeHistoryRow(job, range) {
    const row = element('tr', 'history-row');
    row.dataset.job = job.id;
    const name = element('th', 'history-name');
    name.scope = 'row';
    name.append(element('span', 'history-job-name', jobDisplayName(job)), element('span', 'job-sub', jobSubtitle(job)));
    if (job.historyOnly) name.append(element('span', 'job-sub', message("automations.history.only")));
    row.append(name, ...job.days.map((cell, index) => {
      const td = element('td', '');
      const symbol = cell.outcome === 'NONE' ? '—' : cell.outcome === 'FAILED' ? '!' : '✓';
      const node = element(cell.count ? 'button' : 'span', `day-cell ${cell.count ? cell.outcome.toLowerCase() : 'none'}`,
        message("display.wording.2", { value0: symbol, value1: cell.count > 1 ? ` ${cell.count}` : '' }));
      setAttributeText(node, 'aria-label', message('automations.historyCellLabel', { name: jobDisplayName(job), date: range.days[index].toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), count: cell.count, failed: cell.failed }));
      if (cell.count) {
        node.type = 'button';
        node.addEventListener('click', () => openHistoryDrawer(job, range.days[index], cell, node));
      }
      td.append(node);
      return td;
    }));
    return row;
  }
  function renderHistory() {
    const { payload, range } = historyCache;
    const rows = orderedJobs(visibleJobs(historyRows(historyCurrentJobs, payload.jobs, range), showLegacy));
    const head = element('tr', '');
    const jobHead = element('th', 'history-name', message("automations.job"));
    jobHead.scope = 'col';
    head.append(jobHead, ...range.days.map((day, index) => {
      const node = element('th', 'history-head', index === 6 ? message("automations.today.2", { value0: day.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) })
        : day.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));
      node.scope = 'col';
      return node;
    }));
    get('historyHead').replaceChildren(head);
    let previousMarket = null;
    const historyNodes = [];
    for (const entry of foldDatedJobs(rows)) {
      const job = entry.kind === 'dated' ? entry.latest[0] : entry.job;
      const market = jobMarket(job);
      if (market !== previousMarket) {
        const group = element('tr', 'market-group history-group');
        const heading = element('th', '', marketLabel(market));
        heading.colSpan = range.days.length + 1;
        heading.scope = 'rowgroup';
        group.append(heading);
        historyNodes.push(group);
        previousMarket = market;
      }
      if (entry.kind === 'job') {
        historyNodes.push(makeHistoryRow(job, range));
        continue;
      }
      if (entry.history.length) {
        const group = element('tr', 'dated-history-heading');
        const heading = element('th', '', message("automations.wording.26"));
        heading.scope = 'rowgroup';
        heading.colSpan = range.days.length + 1;
        group.append(heading);
        historyNodes.push(group);
      }
      historyNodes.push(...entry.latest.map(member => makeHistoryRow(member, range)));
      if (entry.history.length) {
        const toggleRow = element('tr', 'dated-history-toggle');
        const cell = element('td', '');
        cell.colSpan = range.days.length + 1;
        const toggle = element('button', 'fold-toggle', message("automations.wording.27", { value0: entry.history.length, value1: historyExpanded ? message("automations.wording.28") : message("automations.wording.29") }));
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(historyExpanded));
        const oldRows = entry.history.map(member => makeHistoryRow(member, range));
        for (const oldRow of oldRows) oldRow.hidden = !historyExpanded;
        toggle.addEventListener('click', () => {
          historyExpanded = !historyExpanded;
          toggle.setAttribute('aria-expanded', String(historyExpanded));
          setText(toggle, message("automations.wording.27", { value0: entry.history.length, value1: historyExpanded ? message("automations.wording.28") : message("automations.wording.29") }));
          for (const oldRow of oldRows) oldRow.hidden = !historyExpanded;
        });
        cell.append(toggle);
        toggleRow.append(cell);
        historyNodes.push(toggleRow, ...oldRows);
      }
    }
    get('historyBody').replaceChildren(...historyNodes);
    get('historyTableWrap').hidden = rows.length === 0;
    setText(get('historyStatus'), rows.length ? message("automations.select.a.day.to.see.all.observed.executions") : message("automations.no.observed.executions.or.current.jobs.in.this.window"));
    get('historyStatus').setAttribute('role', 'status');
  }
  async function loadHistory() {
    if (historyBusy || busy) return;
    const range = historyWindow();
    if (historyCache?.revision === historyRevision && historyCache.range.from === range.from && historyCache.range.to === range.to) {
      renderHistory();
      renderOverview();
      return;
    }
    const revision = historyRevision;
    historyBusy = true;
    historyState = 'loading';
    renderOverview();
    get('historyView').setAttribute('aria-busy', 'true');
    get('historyTableWrap').hidden = true;
    get('historyStatus').setAttribute('role', 'status');
    setText(get('historyStatus'), message("automations.loading.history"));
    get('historyRetry').hidden = true;
    try {
      const response = await fetchJobs(`/api/history?${new URLSearchParams({ from: range.from, to: range.to })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let payload;
      try { payload = await response.json(); } catch { throw new Error('INVALID_HISTORY_RESPONSE'); }
      const validated = readHistory(payload, range);
      if (revision !== historyRevision) return;
      historyCache = { payload: validated, range, revision };
      historyState = 'ready';
      renderHistory();
    } catch (error) {
      if (revision !== historyRevision) return;
      historyCache = null;
      historyState = 'error';
      // Never reflect arbitrary proxy/database response bodies into this error UI.
      const reason = /^(HTTP \d{3}|INVALID_HISTORY_RESPONSE)$/.test(error.message) ? error.message : message("automations.unable.to.read.history.please.retry");
      setText(get('historyStatus'), message("automations.history.unavailable", { value0: reason }));
      get('historyStatus').setAttribute('role', 'alert');
      get('historyRetry').hidden = false;
    } finally {
      historyBusy = false;
      get('historyView').setAttribute('aria-busy', 'false');
      renderOverview();
      if (revision !== historyRevision && needsHistory() && !busy) void loadHistory();
    }
  }
  function makeJobRow(job) {
      const status = currentStatus(job);
      const row = element('button', 'job-row');
      row.type = 'button';
      row.dataset.status = status;
      row.dataset.job = job.id;
      const main = element('span', 'job-main');
      const icon = element('span', `job-icon ${status.toLowerCase()}`,
        { READY: '◷', RUNNING: message("automations.wording.30"), FAILED: '!', DISABLED: 'Ⅱ', UNKNOWN: '?', MISSED: '⌁' }[status]);
      icon.setAttribute('aria-hidden', 'true');
      const name = element('span', 'job-text');
      const metadata = metadataFor(job);
      name.append(element('span', 'job-name', jobDisplayName(job)), element('span', 'job-sub', jobSubtitle(job)));
      const coverage = mappedRunner(job)?.coverageState;
      if (runnerSnapshot?.status === 'OK') name.append(element('span', 'job-sub',
        coverage === 'RUNNER_EVIDENCE_AVAILABLE' ? message("automations.runner.3") : coverage === 'MAPPED_NO_RECEIPT' ? message("automations.runner.mapped")
          : coverage === 'MAPPED_PROFILE_MISSING' ? message("automations.profileMissing") : coverage === 'RUNNER_UNAVAILABLE' ? message("automations.runnerUnavailable") : message("automations.runner.4")));
      if (metadata) name.append(element('span', 'job-description', metadata.description));
      main.append(icon, name);
      row.append(main);
      for (const [title, date] of [[message("automations.next.run"), job.nextRunAt], [message("automations.last.run"), job.lastRunAt]]) {
        const cell = element('span', 'meta');
        cell.append(element('span', 'cell-label', title), element('span', 'cell-value', formatDate(date)));
        row.append(cell);
      }
      const statuses = element('span', 'status-cell');
      statuses.append(element('span', 'cell-label', message("automations.current")), badge(status),
        element('span', 'job-sub', message("automations.last.run.2", { value0: label(lastStatus(job)) })));
      row.append(statuses, element('span', 'chev', '›'));
      row.addEventListener('click', () => openDrawer(job, row));
      return row;
  }
  function renderRows() {
    const jobs = snapshot ? orderedJobs(filterJobs(visibleJobs(snapshot.jobs, showLegacy), activeFilter)) : [];
    let previousMarket = null;
    const nodes = [];
    for (const entry of foldDatedJobs(jobs)) {
      const job = entry.kind === 'dated' ? entry.latest[0] : entry.job;
      const market = jobMarket(job);
      if (market !== previousMarket) {
        nodes.push(element('h3', 'market-group', marketLabel(market)));
        previousMarket = market;
      }
      if (entry.kind === 'job') {
        nodes.push(makeJobRow(job));
        continue;
      }
      if (entry.history.length) {
        const heading = element('h4', 'dated-heading', message("automations.wording.31"));
        nodes.push(heading);
      }
      nodes.push(...entry.latest.map(makeJobRow));
      if (entry.history.length) {
        const toggle = element('button', 'fold-toggle', message("automations.wording.27", { value0: entry.history.length, value1: todayExpanded ? message("automations.wording.28") : message("automations.wording.29") }));
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(todayExpanded));
        const oldRows = entry.history.map(makeJobRow);
        for (const oldRow of oldRows) oldRow.hidden = !todayExpanded;
        toggle.addEventListener('click', () => {
          todayExpanded = !todayExpanded;
          toggle.setAttribute('aria-expanded', String(todayExpanded));
          setText(toggle, message("automations.wording.27", { value0: entry.history.length, value1: todayExpanded ? message("automations.wording.28") : message("automations.wording.29") }));
          for (const oldRow of oldRows) oldRow.hidden = !todayExpanded;
          updateViewCounts();
        });
        nodes.push(toggle, ...oldRows);
      }
    }
    get('jobList').replaceChildren(...nodes);
    renderWorkflow();
    updateViewCounts();
    get('emptyState').hidden = jobs.length > 0;
    setText(get('emptyState'), phase === 'loading' ? message("automations.wording.32")
      : phase === 'error' ? message("automations.wording.33")
      : snapshot?.collectionStatus === 'NOT_CONFIGURED'
        ? message("automations.dashboard.scheduler.include.config.application.yml.readme.md")
      : snapshot?.jobs.length === 0 ? message("automations.wording.34")
        : !showLegacy && visibleJobs(snapshot.jobs).length === 0 ? message("automations.wording.35")
        : message("automations.no.jobs.match.this.filter"));
  }
  function updateViewCounts() {
    const counts = snapshot ? viewCounts(snapshot.jobs, showLegacy, activeFilter, todayExpanded) : null;
    for (const key of ['visible', 'legacyHidden', 'filteredOut', 'folded']) {
      setText(get(`view-${key}`), counts ? counts[key] : '—');
    }
  }
  function showNotice(title, details = [], kind = 'info') {
    get('collectionNotice').className = `collection-notice ${kind}`;
    get('collectionNotice').setAttribute('role', kind === 'error' ? 'alert' : 'status');
    setText(get('collectionTitle'), title);
    get('collectionDetails').replaceChildren(...details.map(detail => element('li', '', detail)));
  }
  function summary(values) {
    for (const key of ['monitored', 'success', 'failed', 'attention']) setText(get(`count-${key}`), values ? values[key] : '—');
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    phase = 'loading';
    historyRevision++;
    historyCache = null;
    historyCurrentJobs = [];
    historyState = 'loading';
    get('historyTableWrap').hidden = true;
    setText(get('historyStatus'), message("automations.loading.history"));
    todayExpanded = false;
    historyExpanded = false;
    closeDrawer();
    snapshot = null;
    runnerSnapshot = null;
    runnerRequest = null;
    runnerJob = null;
    runnerRevision++;
    renderCoverage();
    renderOverview();
    summary(null);
    renderRows();
    get('refreshBtn').disabled = true;
    setText(get('refreshBtn'), message("automations.refreshing"));
    get('todayView').setAttribute('aria-busy', 'true');
    setText(get('moodTitle'), message("automations.reading.scheduler"));
    setText(get('moodText'), message("automations.wording.36"));
    showNotice(message("automations.windows.task.scheduler"));
    try {
      // No polling, per-row detail requests, or fallback data. One request per refresh.
      const response = await fetchJobs('/api/jobs', { cache: 'no-store' });
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error(response.ok ? 'INVALID_API_RESPONSE' : `HTTP ${response.status}`); }
      if (!response.ok) throw new Error([`HTTP ${response.status}`, payload?.code, payload?.message].filter(Boolean).join(' · '));
      snapshot = readSnapshot(payload);
      const runnerRevisionAtRequest = runnerRevision;
      runnerRequest = (async () => {
        try {
          const response = await fetchJobs('/api/runner/executions', { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok || !['OK', 'NOT_CONFIGURED', 'UNAVAILABLE'].includes(payload?.status)
              || !Array.isArray(payload.jobs)) throw new Error('INVALID_RUNNER_RESPONSE');
          if (runnerRevisionAtRequest === runnerRevision) runnerSnapshot = payload;
        } catch { if (runnerRevisionAtRequest === runnerRevision) runnerSnapshot = { status: 'UNAVAILABLE', jobs: [], warnings: [] }; }
        if (runnerRevisionAtRequest === runnerRevision) {
          renderCoverage(); renderRows(); renderOverview();
          if (runnerJob && get('drawer').classList.contains('open') && get('drawer').dataset.mode === 'current') renderRunner(runnerJob);
        }
      })();
      renderSettingList();
      historyCurrentJobs = snapshot.jobs;
      phase = 'ready';
      summary(summarize(snapshot.jobs));
      setText(get('refreshTime'), formatDate(snapshot.collectedAt));
      const partial = snapshot.collectionStatus === 'PARTIAL';
      const unconfigured = snapshot.collectionStatus === 'NOT_CONFIGURED';
      showNotice(partial ? message("automations.partial")
        : unconfigured ? message("automations.not.configured") : message("automations.ok"), [
        ...snapshot.errors.map(error => typeof error === 'string' ? error
          : [error?.code, error?.taskPath, error?.taskName, error?.message].filter(Boolean).join(' · ')),
        ...snapshot.unmatchedIncludes.map(value => message("automations.unmatchedincludes", { value0: displayValue(value) }))
      ], partial ? 'warning' : 'info');
      setText(get('moodTitle'), partial ? message("automations.collection.needs.attention") : unconfigured ? message("automations.your.garden.is.waiting") : message("automations.scheduler.snapshot"));
      setText(get('moodText'), partial ? message("automations.wording.37")
        : unconfigured ? message("automations.wording.38") : message("automations.wording.39"));
    } catch (error) {
      snapshot = null;
      phase = 'error';
      summary(null);
      showNotice(message("automations.windows.task.scheduler.2"), [error.message || 'BACKEND_UNAVAILABLE'], 'error');
      setText(get('moodTitle'), message("automations.collection.unavailable"));
      setText(get('moodText'), message("automations.refresh"));
    } finally {
      busy = false;
      get('refreshBtn').disabled = false;
      setText(get('refreshBtn'), message("automations.refresh.2"));
      get('todayView').setAttribute('aria-busy', 'false');
      renderRows();
      renderOverview();
      if (needsHistory()) void loadHistory();
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
      const history = tab.dataset.tab === 'history';
      get('todayView').hidden = !today;
      get('historyView').hidden = !history;
      document.querySelector('.filters').hidden = !today;
      get('showLegacy').hidden = !today && !history;
      if (history && !busy) void loadHistory();
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
  get('showLegacy').addEventListener('click', () => {
    showLegacy = !showLegacy;
    get('showLegacy').setAttribute('aria-checked', String(showLegacy));
    renderRows();
    if (historyCache && !get('historyView').hidden) renderHistory();
  });
  get('closeDrawer').addEventListener('click', closeDrawer);
  get('drawer').addEventListener('click', event => { if (event.target === get('drawer')) closeDrawer(); });
  document.addEventListener('keydown', event => {
    if (!get('drawer').classList.contains('open')) return;
    if (event.key === 'Escape') closeDrawer();
    if (event.key === 'Tab') {
      const focusable = [get('closeDrawer'), ...get('drawer').querySelectorAll('#runnerRecent summary:not([hidden])')]
        .filter(node => !node.closest('[hidden]'));
      const index = focusable.indexOf(document.activeElement);
      event.preventDefault();
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    }
  });
  get('refreshBtn').addEventListener('click', refresh);
  get('historyRetry').addEventListener('click', loadHistory);
  get('overviewHistoryRetry').addEventListener('click', loadHistory);
  get('addDependency').addEventListener('click', () => get('settingDependencies').append(dependencyRow()));
  get('cancelSettings').addEventListener('click', () => selectSetting(selectedSetting));
  get('settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedSetting) return;
    const order = Number(get('settingOrder').value);
    if (!Number.isInteger(order) || order < 0 || order > 10000) { settingsMessage(message("automations.0.10000"), true); return; }
    const dependencies = [...get('settingDependencies').children].map(row => {
      const task = row.querySelector('input').value.trim(), kind = row.querySelector('select').value;
      return { task, kind, ...(row.dataset.note && task === row.dataset.originalTask && kind === row.dataset.originalKind
        ? { note: row.dataset.note } : {}) };
    });
    const fields = { displayName: get('settingDisplayName').value.trim(), market: get('settingMarket').value,
      description: get('settingDescription').value, order, hidden: get('settingHidden').checked, dependsOn: dependencies };
    const baseline = effectiveMetadataWithoutExactUserOverride(selectedSetting);
    const partial = Object.fromEntries(Object.entries(fields).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key])));
    const next = { ...userOverrides };
    if (Object.keys(partial).length) next[selectedSetting] = partial; else delete next[selectedSetting];
    void saveSettings(next);
  });
  get('resetSettings').addEventListener('click', () => {
    if (!selectedSetting) return;
    const next = { ...userOverrides }; delete next[selectedSetting]; void saveSettings(next);
  });
  get('resetAllSettings').addEventListener('click', () => {
    if (globalThis.confirm(message("automations.wording.40"))) void saveSettings({});
  });
  shell.start();
  return loadSettings().then(refresh);
}

if (typeof document !== 'undefined') mountDashboard(document);
