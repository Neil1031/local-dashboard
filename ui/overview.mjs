const preciseUtc = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(9, '0')}Z`);

// Dashboard-owned snapshots only. Display filters and metadata never change coverage.
export function deriveOverview({ snapshot, phase, historyCache, historyRevision, historyState, runnerSnapshot, now = Date.now() }, summarize, runnerKey) {
  const available = phase === 'ready' && ['OK', 'PARTIAL'].includes(snapshot?.collectionStatus);
  const jobs = available ? snapshot.jobs : [];
  const upcoming = jobs.filter(job => job.enabled !== false && Number.isFinite(Date.parse(job.nextRunAt)) && Date.parse(job.nextRunAt) > now)
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt) || a.id.localeCompare(b.id)).slice(0, 5);
  const historyAvailable = historyState === 'ready' && historyCache?.revision === historyRevision;
  const recent = historyAvailable ? historyCache.payload.jobs.flatMap(job => job.runs
    .filter(run => Date.parse(run.observedRunAt) <= now).map(run => ({ job, run })))
    .sort((a, b) => preciseUtc(b.run.observedRunAt).localeCompare(preciseUtc(a.run.observedRunAt)) || b.run.id - a.run.id).slice(0, 5) : [];
  const runnerAvailable = available && runnerSnapshot?.status === 'OK';
  const mappings = runnerAvailable ? jobs.map(job => runnerSnapshot.jobs.find(item => item?.schedulerTask === runnerKey(job))) : [];
  return { available, partial: snapshot?.collectionStatus === 'PARTIAL', counts: available ? summarize(jobs) : null, upcoming,
    reason: phase === 'loading' ? '正在更新；舊快照摘要已清除。' : snapshot?.collectionStatus === 'NOT_CONFIGURED' ? '尚未設定監控清單 · unavailable' : 'Scheduler 資料無法確認 · unavailable',
    historyAvailable, historyState, recent, runnerAvailable,
    runner: runnerAvailable ? { monitored: jobs.length, mapped: mappings.filter(Boolean).length,
      evidence: mappings.filter(item => item?.coverageState === 'RUNNER_EVIDENCE_AVAILABLE').length,
      noReceipt: mappings.filter(item => item?.coverageState === 'MAPPED_NO_RECEIPT').length,
      profileMissing: mappings.filter(item => item?.coverageState === 'MAPPED_PROFILE_MISSING').length,
      unavailable: mappings.filter(item => item?.coverageState === 'RUNNER_UNAVAILABLE').length,
      unknown: mappings.filter(item => item && !['RUNNER_EVIDENCE_AVAILABLE', 'MAPPED_NO_RECEIPT', 'MAPPED_PROFILE_MISSING', 'RUNNER_UNAVAILABLE'].includes(item.coverageState)).length } : null,
    runnerReason: !available ? (phase === 'loading' ? '正在更新 Scheduler；Runner 摘要暫不顯示。' : '本次 Scheduler 快照無法確認 · Runner coverage unavailable') : !runnerSnapshot ? '正在讀取 Runner coverage…' : runnerSnapshot.status === 'NOT_CONFIGURED' ? 'Runner 尚未設定 · unavailable' : 'Runner coverage 無法確認 · unavailable',
    runnerWarnings: Array.isArray(runnerSnapshot?.warnings) ? runnerSnapshot.warnings : [] };
}

export function mountOverview(document, { summarize, runnerKey, displayName, formatDate, openJob }) {
  const get = id => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  let upcomingSignature;
  function render(state) {
    const model = deriveOverview(state, summarize, runnerKey);
    get('overviewView').setAttribute('aria-busy', String(state.phase === 'loading'));
    for (const key of ['monitored', 'success', 'failed', 'attention']) get(`overview-${key}`).textContent = model.counts ? model.counts[key] : '—';
    get('overviewSnapshot').textContent = model.available
      ? `${model.partial ? 'PARTIAL · 僅涵蓋本次成功收集的工作，不能視為完整監控清單。' : 'OK · 本次收集快照；不受 Today 顯示篩選影響。'} ${formatDate(state.snapshot.collectedAt)}` : model.reason;
    // History/Runner completion must not detach the drawer's return-focus button.
    const signature = JSON.stringify(model.upcoming.map(job => [job.id, displayName(job), job.nextRunAt]));
    if (signature !== upcomingSignature) get('overviewUpcoming').replaceChildren(...model.upcoming.map(job => {
      const item = element('li', ''); const button = element('button', displayName(job)); button.type = 'button';
      button.addEventListener('click', () => openJob(job, button));
      item.append(button, element('time', formatDate(job.nextRunAt))); return item;
    }));
    upcomingSignature = signature;
    get('overviewUpcomingStatus').textContent = !model.available ? model.reason : model.upcoming.length
      ? 'Scheduler 提供的未來時間；不保證會執行或成功。' : '快照未提供可用的未來排程時間。';
    get('overviewRecent').replaceChildren(...model.recent.map(({job, run}) => {
      const item = element('li', `${displayName(job)} · ${run.outcome} · Scheduler result ${run.schedulerResult ?? '—'}`);
      item.append(element('time', formatDate(run.observedRunAt))); return item;
    }));
    get('overviewHistoryStatus').textContent = !model.historyAvailable
      ? model.historyState === 'loading' ? '正在讀取本地七天已觀察執行…' : 'History unavailable · 請重試；缺紀錄不等於 MISSED。'
      : model.recent.length ? '最近已保存的 Scheduler 執行結果；不是完整 audit log，也不保證業務成功。' : '本地七天範圍沒有可顯示的已觀察執行；不代表 MISSED。';
    get('overviewHistoryRetry').hidden = model.historyAvailable || model.historyState === 'loading';
    get('overviewRunner').textContent = model.runnerAvailable
      ? `Monitored ${model.runner.monitored} · Mapped ${model.runner.mapped} · With evidence ${model.runner.evidence} · No receipt ${model.runner.noReceipt} · Profile missing ${model.runner.profileMissing} · Unavailable ${model.runner.unavailable} · Unknown ${model.runner.unknown} · Unmapped ${model.runner.monitored - model.runner.mapped}` : model.runnerReason;
    get('overviewRunnerWarnings').replaceChildren(...model.runnerWarnings.map(warning => element('li', warning)));
  }
  return { render };
}
