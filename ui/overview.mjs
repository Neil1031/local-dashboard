import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
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
    reason: phase === 'loading' ? message("overview.wording") : snapshot?.collectionStatus === 'NOT_CONFIGURED' ? message("overview.unavailable") : message("overview.scheduler.unavailable"),
    historyAvailable, historyState, recent, runnerAvailable,
    runner: runnerAvailable ? { monitored: jobs.length, mapped: mappings.filter(Boolean).length,
      evidence: mappings.filter(item => item?.coverageState === 'RUNNER_EVIDENCE_AVAILABLE').length,
      noReceipt: mappings.filter(item => item?.coverageState === 'MAPPED_NO_RECEIPT').length,
      profileMissing: mappings.filter(item => item?.coverageState === 'MAPPED_PROFILE_MISSING').length,
      unavailable: mappings.filter(item => item?.coverageState === 'RUNNER_UNAVAILABLE').length,
      unknown: mappings.filter(item => item && !['RUNNER_EVIDENCE_AVAILABLE', 'MAPPED_NO_RECEIPT', 'MAPPED_PROFILE_MISSING', 'RUNNER_UNAVAILABLE'].includes(item.coverageState)).length } : null,
    runnerReason: !available ? (phase === 'loading' ? message("overview.scheduler.runner") : message("overview.scheduler.runner.coverage.unavailable")) : !runnerSnapshot ? message("overview.runner.coverage") : runnerSnapshot.status === 'NOT_CONFIGURED' ? message("overview.runner.unavailable") : message("overview.runner.coverage.unavailable"),
    runnerWarnings: Array.isArray(runnerSnapshot?.warnings) ? runnerSnapshot.warnings : [] };
}

export function mountOverview(document, { summarize, runnerKey, displayName, formatDate, openJob }) {
  const get = id => document.getElementById(id);
  const element = (tag, text) => { const node = document.createElement(tag); setText(node, text); return node; };
  let upcomingSignature;
  function render(state) {
    const model = deriveOverview(state, summarize, runnerKey);
    get('overviewView').setAttribute('aria-busy', String(state.phase === 'loading'));
    for (const key of ['monitored', 'success', 'failed', 'attention']) setText(get(`overview-${key}`), model.counts ? model.counts[key] : '—');
    setText(get('overviewSnapshot'), model.available
      ? message("overview.snapshotNotice", { notice: model.partial ? message("overview.partial") : message("overview.ok.today"), time: formatDate(state.snapshot.collectedAt) }) : model.reason);
    // History/Runner completion must not detach the drawer's return-focus button.
    const signature = JSON.stringify(model.upcoming.map(job => [job.id, displayName(job), job.nextRunAt]));
    if (signature !== upcomingSignature) get('overviewUpcoming').replaceChildren(...model.upcoming.map(job => {
      const item = element('li', ''); const button = element('button', displayName(job)); button.type = 'button';
      button.addEventListener('click', () => openJob(job, button));
      item.append(button, element('time', formatDate(job.nextRunAt))); return item;
    }));
    upcomingSignature = signature;
    setText(get('overviewUpcomingStatus'), !model.available ? model.reason : model.upcoming.length
      ? message("overview.scheduler") : message("overview.wording.2"));
    get('overviewRecent').replaceChildren(...model.recent.map(({job, run}) => {
      const item = element('li', message("overview.scheduler.result", { value0: displayName(job), value1: run.outcome, value2: run.schedulerResult ?? '—' }));
      item.append(element('time', formatDate(run.observedRunAt))); return item;
    }));
    setText(get('overviewHistoryStatus'), !model.historyAvailable
      ? model.historyState === 'loading' ? message("overview.wording.3") : message("overview.history.unavailable.missed")
      : model.recent.length ? message("overview.scheduler.audit.log") : message("overview.missed"));
    get('overviewHistoryRetry').hidden = model.historyAvailable || model.historyState === 'loading';
    setText(get('overviewRunner'), model.runnerAvailable
      ? message("overview.monitored.mapped.with.evidence.no.receipt.profile.missing.unavailabl", { value0: model.runner.monitored, value1: model.runner.mapped, value2: model.runner.evidence, value3: model.runner.noReceipt, value4: model.runner.profileMissing, value5: model.runner.unavailable, value6: model.runner.unknown, value7: model.runner.monitored - model.runner.mapped }) : model.runnerReason);
    get('overviewRunnerWarnings').replaceChildren(...model.runnerWarnings.map(warning => element('li', warning)));
  }
  return { render };
}
