// Shared v1 contract for the production build snapshot and static prototype.
export const MAX_DESIGN_BYTES = 256 * 1024;
export const FEATURE_STATUSES = Object.freeze(['DONE', 'PARTIAL', 'BACKEND_READY', 'DATA_READY',
  'DESIGNED', 'IN_PROGRESS', 'NOT_STARTED', 'DEFERRED', 'BLOCKED', 'DROPPED']);
export class ProjectDesignError extends Error {
  constructor(code) { super(code); this.name = 'ProjectDesignError'; this.code = code; }
}
const invalid = () => { throw new ProjectDesignError('INVALID_FORMAT'); };
function metadata(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) invalid();
  const values = Object.create(null);
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!entry || Object.hasOwn(values, entry[1])) invalid();
    values[entry[1]] = entry[2].trim();
  }
  for (const key of ['project_id', 'project_name', 'repository', 'design_version', 'overall_status',
    'baseline_commit', 'last_reviewed_at', 'purpose', 'original_design', 'current_design']) if (!values[key]) invalid();
  if (!/^[1-9]\d*$/.test(values.design_version)) invalid();
  if (values.design_version !== '1') throw new ProjectDesignError('UNSUPPORTED_VERSION');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.project_id)
    || !/^[\w.-]+\/[\w.-]+$/.test(values.repository)
    || !/^[0-9a-f]{40}$/.test(values.baseline_commit)
    || !FEATURE_STATUSES.includes(values.overall_status)
    || !/^\d{4}-\d{2}-\d{2}$/.test(values.last_reviewed_at)) invalid();
  const date = new Date(`${values.last_reviewed_at}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== values.last_reviewed_at) invalid();
  values.design_version = 1;
  return values;
}
function table(text, heading, expected) {
  const lines = text.split('\n');
  const starts = lines.flatMap((line, index) => line === `## ${heading}` ? [index] : []);
  if (starts.length !== 1) invalid();
  const block = [];
  let ended = false;
  for (let i = starts[0] + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const line = lines[i];
    if (line.startsWith('|')) {
      if (ended || !line.endsWith('|')) invalid();
      block.push(line);
    } else if (block.length && line.trim()) invalid();
    else if (block.length) ended = true;
  }
  if (block.length < 3) invalid();
  const cells = line => line.slice(1, -1).split('|').map(value => value.trim());
  const keys = cells(block[0]);
  if (JSON.stringify(keys) !== JSON.stringify(expected)) invalid();
  const separator = cells(block[1]);
  if (separator.length !== keys.length || !separator.every(value => /^:?-{3,}:?$/.test(value))) invalid();
  return block.slice(2).map(line => {
    const row = cells(line);
    if (row.length !== keys.length || row.some(value => !value)) invalid();
    return Object.fromEntries(keys.map((key, column) => [key, row[column]]));
  });
}
export function parseProjectDesign(source) {
  if (typeof source !== 'string') invalid();
  if (new TextEncoder().encode(source).length > MAX_DESIGN_BYTES) throw new ProjectDesignError('TOO_LARGE');
  const text = source.replace(/\r\n/g, '\n');
  const meta = metadata(text);
  const features = table(text, 'Feature Matrix', ['ID', 'Area', 'Feature', 'Original intent',
    'Current implementation', 'Status', 'Current limitation', 'Remaining work', 'Evidence']);
  const issues = table(text, 'Major Development Issues & Lessons', ['Issue ID', 'Problem',
    'Root cause', 'Resolution / current state', 'Design lesson', 'State', 'Evidence']);
  const changes = table(text, 'Design Changes', ['Date', 'Previous design', 'New design', 'Reason', 'Impact', 'Evidence']);
  const remaining = table(text, 'Remaining Work', ['Horizon', 'Work', 'Why / gate', 'Evidence']);
  const ids = new Set();
  for (const feature of features) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature.ID) || ids.has(feature.ID)
      || !FEATURE_STATUSES.includes(feature.Status)) invalid();
    ids.add(feature.ID);
  }
  return {
    metadata: meta,
    features: features.map(row => ({ id: row.ID, area: row.Area, name: row.Feature,
      originalIntent: row['Original intent'], implementation: row['Current implementation'], status: row.Status,
      limitation: row['Current limitation'], remaining: row['Remaining work'], evidence: row.Evidence })),
    issues: issues.map(row => ({ id: row['Issue ID'], problem: row.Problem, cause: row['Root cause'],
      resolution: row['Resolution / current state'], lesson: row['Design lesson'], state: row.State, evidence: row.Evidence })),
    changes: changes.map(row => ({ date: row.Date, previous: row['Previous design'], current: row['New design'],
      reason: row.Reason, impact: row.Impact, evidence: row.Evidence })),
    remaining: remaining.map(row => ({ horizon: row.Horizon, work: row.Work, gate: row['Why / gate'], evidence: row.Evidence }))
  };
}
export function featureCounts(features) {
  const counts = Object.fromEntries(FEATURE_STATUSES.map(status => [status, 0]));
  for (const feature of features) {
    if (!Object.hasOwn(counts, feature.status)) invalid();
    counts[feature.status]++;
  }
  return counts;
}
