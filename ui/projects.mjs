import { message, t, setText, setAttributeText, codeText, isMessage } from './i18n.mjs';
import { parseProjectDesign, featureCounts, MAX_DESIGN_BYTES, ProjectDesignError } from './project-design.mjs';
export const PROJECT_SOURCE = '/project-design/PROJECT-DESIGN.md';
const messages = {
  MISSING: message("projects.error.MISSING"),
  INVALID_FORMAT: message("projects.error.INVALID_FORMAT"),
  UNSUPPORTED_VERSION: message("projects.version.1"),
  TOO_LARGE: message("projects.error.TOO_LARGE"),
  UNAVAILABLE: message("projects.error.UNAVAILABLE")
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
    if (text !== undefined) setText(node, text);
    return node;
  };
  function render({ model, digest, readAt }) {
    const meta = model.metadata;
    setText(get('projectIdentity'), message("display.wording.4", { value0: meta.project_name, value1: meta.overall_status }));
    setText(get('projectPurpose'), meta.purpose);
    setText(get('projectReadInfo'), message("projects.docs.project.design.md", { value0: meta.design_version, value1: readAt }));
    const info = get('projectSourceInfo');
    info.replaceChildren();
    for (const [name, value] of [[message("common.source"), 'docs/PROJECT-DESIGN.md'], [message("projects.repository"), meta.repository],
      [message("projects.designVersion"), String(meta.design_version)], [message("projects.reviewDate"), meta.last_reviewed_at],
      [message("projects.baseline"), meta.baseline_commit], [message("projects.sha256"), digest], [message("projects.readAt"), readAt]]) {
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
      for (const [label, value] of [[message("projects.area"), feature.area], [message("projects.originalIntent"), feature.originalIntent],
        [message("projects.implementation"), feature.implementation], [message("projects.limitation"), feature.limitation],
        [message("projects.remaining"), feature.remaining], [message("projects.engineeringReference"), feature.evidence]]) {
        content.append(element('dt', '', label), element('dd', '', value));
      }
      card.append(title, content);
      return card;
    }));
    setText(get('projectsStatus'), message("projects.wording", { value0: model.features.length }));
    get('projectsData').hidden = false;
  }
  async function reload() {
    const current = ++revision;
    pending?.abort(); pending = new AbortController();
    phase = 'loading';
    get('projectsView').setAttribute('aria-busy', 'true');
    get('projectsData').hidden = true;
    for (const id of ['projectCounts', 'projectFeatures', 'projectSourceInfo']) setText(get(id), '');
    setText(get('projectIdentity'), ''); setText(get('projectPurpose'), ''); setText(get('projectReadInfo'), '');
    get('projectsStatus').setAttribute('role', 'status');
    setText(get('projectsStatus'), message("projects.loading"));
    get('projectsRetry').disabled = true;
    try {
      const result = await loadProjectDesign(fetchSource, { signal: pending.signal });
      if (current !== revision) return;
      render(result); phase = 'ready';
    } catch (error) {
      if (current !== revision) return;
      phase = 'error';
      get('projectsStatus').setAttribute('role', 'alert');
      setText(get('projectsStatus'), message("common.codeLabel", { label: messages[error.code] ?? messages.UNAVAILABLE, code: error.code ?? "UNAVAILABLE" }));
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
