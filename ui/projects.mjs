import { parseProjectDesign, featureCounts, MAX_DESIGN_BYTES, ProjectDesignError } from './project-design.mjs';
export const PROJECT_SOURCE = '/project-design/PROJECT-DESIGN.md';
const messages = {
  MISSING: '找不到本次建置的專案設計檔。請確認建置資源後重試。',
  INVALID_FORMAT: '專案設計格式錯誤，無法確認功能與狀態。',
  UNSUPPORTED_VERSION: '此專案設計版本尚未支援，請使用支援 version 1 的建置。',
  TOO_LARGE: '專案設計超過 256 KiB 讀取上限。',
  UNAVAILABLE: '目前無法讀取專案設計，請確認本機服務後重試。'
};
// Fixed same-origin URL; no caller-supplied path or external source.
export async function loadProjectDesign(fetchSource = globalThis.fetch.bind(globalThis), { signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new ProjectDesignError('UNAVAILABLE'));
  }, timeoutMs); });
  const read = async () => {
    const response = await fetchSource(PROJECT_SOURCE, { cache: 'no-store', mode: 'same-origin', redirect: 'error', signal: controller.signal });
    if (response.status === 404) throw new ProjectDesignError('MISSING');
    if (!response.ok) throw new ProjectDesignError('UNAVAILABLE');
    if (Number(response.headers.get('content-length')) > MAX_DESIGN_BYTES) throw new ProjectDesignError('TOO_LARGE');
    if (/text\/html/i.test(response.headers.get('content-type') ?? '')) throw new ProjectDesignError('INVALID_FORMAT');
    const reader = response.body?.getReader();
    if (!reader) throw new ProjectDesignError('UNAVAILABLE');
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_DESIGN_BYTES) throw new ProjectDesignError('TOO_LARGE');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new ProjectDesignError('INVALID_FORMAT'); }
    const model = parseProjectDesign(source);
    if (model.metadata.project_id !== 'local-dashboard' || model.metadata.repository !== 'Neil1031/local-dashboard') {
      throw new ProjectDesignError('INVALID_FORMAT');
    }
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return { model, digest: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join(''), readAt: new Date().toISOString() };
  };
  try { return await Promise.race([read(), deadline]); }
  catch (error) { throw error instanceof ProjectDesignError ? error : new ProjectDesignError('UNAVAILABLE'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); }
}
export function mountProjects(document, fetchSource) {
  const get = id => document.getElementById(id);
  let phase = 'idle', revision = 0, pending;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function render({ model, digest, readAt }) {
    const meta = model.metadata;
    get('projectIdentity').textContent = `${meta.project_name} · ${meta.overall_status}`;
    get('projectPurpose').textContent = meta.purpose;
    get('projectReadInfo').textContent = `docs/PROJECT-DESIGN.md · 設計版本 ${meta.design_version} · 本次讀取 ${readAt}`;
    const info = get('projectSourceInfo');
    info.replaceChildren();
    for (const [name, value] of [['來源', 'docs/PROJECT-DESIGN.md'], ['Repository', meta.repository],
      ['設計版本', String(meta.design_version)], ['設計盤點日期', meta.last_reviewed_at],
      ['歷史盤點 baseline（非本次實作 SHA）', meta.baseline_commit], ['來源 SHA-256', digest], ['本次讀取時間', readAt]]) {
      info.append(element('dt', '', name), element('dd', '', value));
    }
    get('projectCounts').replaceChildren(...Object.entries(featureCounts(model.features)).map(([status, count]) => {
      const card = element('div', 'project-count');
      card.append(element('span', '', status), element('strong', '', String(count)));
      card.dataset.status = status;
      return card;
    }));
    get('projectFeatures').replaceChildren(...model.features.map(feature => {
      const card = element('details', 'project-feature');
      card.dataset.featureId = feature.id;
      const title = element('summary', '');
      const name = element('span', 'project-feature-name');
      name.append(element('code', '', feature.id), element('strong', '', feature.name));
      title.append(name, element('span', 'project-status', feature.status));
      const content = element('dl', 'project-feature-content');
      for (const [label, value] of [['領域', feature.area], ['原始目的', feature.originalIntent],
        ['目前實作', feature.implementation], ['目前限制', feature.limitation],
        ['剩餘工作', feature.remaining], ['工程參考', feature.evidence]]) {
        content.append(element('dt', '', label), element('dd', '', value));
      }
      card.append(title, content);
      return card;
    }));
    get('projectsStatus').textContent = `已讀取 ${model.features.length} 項功能；狀態是工程設計記錄，不代表重新驗收或部署。`;
    get('projectsData').hidden = false;
  }
  async function reload() {
    const current = ++revision;
    pending?.abort(); pending = new AbortController();
    phase = 'loading';
    get('projectsView').setAttribute('aria-busy', 'true');
    get('projectsData').hidden = true;
    for (const id of ['projectCounts', 'projectFeatures', 'projectSourceInfo']) get(id).replaceChildren();
    get('projectIdentity').textContent = ''; get('projectPurpose').textContent = ''; get('projectReadInfo').textContent = '';
    get('projectsStatus').setAttribute('role', 'status');
    get('projectsStatus').textContent = '正在讀取本次建置的專案設計…';
    get('projectsRetry').disabled = true;
    try {
      const result = await loadProjectDesign(fetchSource, { signal: pending.signal });
      if (current !== revision) return;
      render(result); phase = 'ready';
    } catch (error) {
      if (current !== revision) return;
      phase = 'error';
      get('projectsStatus').setAttribute('role', 'alert');
      get('projectsStatus').textContent = `${messages[error.code] ?? messages.UNAVAILABLE} [${error.code ?? 'UNAVAILABLE'}]`;
    } finally {
      if (current === revision) {
        get('projectsView').setAttribute('aria-busy', 'false');
        get('projectsRetry').disabled = false;
      }
    }
  }
  get('projectsRetry').addEventListener('click', reload);
  return { show: () => { if (phase === 'idle') void reload(); }, reload };
}
