// Derive the static Projects sample from this repository's living design document.
// Usage: node design/prototype/generate-project-design.mjs [--check]
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../../docs/PROJECT-DESIGN.md', import.meta.url);
const output = new URL('./project-design-sample.js', import.meta.url);
// Git may check text out as CRLF on Windows. Keep the generated model portable.
const markdown = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n');
const digest = createHash('sha256').update(markdown).digest('hex');

function fail(message) { throw new Error(`PROJECT-DESIGN: ${message}`); }
function metadata(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) fail('missing YAML front matter');
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!entry || Object.hasOwn(values, entry[1])) fail(`invalid or duplicate metadata: ${line}`);
    values[entry[1]] = entry[2].trim();
  }
  for (const key of ['project_id', 'project_name', 'repository', 'design_version', 'overall_status',
    'baseline_commit', 'last_reviewed_at', 'purpose', 'original_design', 'current_design']) {
    if (!values[key]) fail(`missing ${key}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.project_id)) fail('invalid project_id');
  if (!/^[0-9a-f]{40}$/.test(values.baseline_commit)) fail('invalid baseline_commit');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.last_reviewed_at)) fail('invalid last_reviewed_at');
  if (!Number.isSafeInteger(Number(values.design_version)) || Number(values.design_version) < 1) fail('invalid design_version');
  values.design_version = Number(values.design_version);
  return values;
}

function table(text, heading, expected) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) fail(`missing section ${heading}`);
  const block = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (lines[i].startsWith('|')) block.push(lines[i]);
  }
  if (block.length < 3) fail(`empty table ${heading}`);
  const cells = line => line.slice(1, -1).split('|').map(value => value.trim());
  const keys = cells(block[0]);
  if (JSON.stringify(keys) !== JSON.stringify(expected)) fail(`columns changed in ${heading}`);
  if (!cells(block[1]).every(value => /^:?-{3,}:?$/.test(value))) fail(`invalid separator in ${heading}`);
  return block.slice(2).map((line, index) => {
    const row = cells(line);
    if (row.length !== keys.length || row.some(value => !value)) fail(`invalid ${heading} row ${index + 1}`);
    return Object.fromEntries(keys.map((key, column) => [key, row[column]]));
  });
}

const meta = metadata(markdown);
const features = table(markdown, 'Feature Matrix', ['ID', 'Area', 'Feature', 'Original intent',
  'Current implementation', 'Status', 'Current limitation', 'Remaining work', 'Evidence']);
const issues = table(markdown, 'Major Development Issues & Lessons', ['Issue ID', 'Problem',
  'Root cause', 'Resolution / current state', 'Design lesson', 'State', 'Evidence']);
const changes = table(markdown, 'Design Changes', ['Date', 'Previous design', 'New design',
  'Reason', 'Impact', 'Evidence']);
const remaining = table(markdown, 'Remaining Work', ['Horizon', 'Work', 'Why / gate', 'Evidence']);
const statuses = new Set(['DONE', 'PARTIAL', 'BACKEND_READY', 'DATA_READY', 'DESIGNED',
  'IN_PROGRESS', 'NOT_STARTED', 'DEFERRED', 'BLOCKED', 'DROPPED']);
const ids = new Set();
for (const feature of features) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature.ID) || ids.has(feature.ID)) fail(`duplicate/invalid feature ID ${feature.ID}`);
  if (!statuses.has(feature.Status)) fail(`invalid feature status ${feature.Status}`);
  ids.add(feature.ID);
}
if (features.length < 30 || issues.length < 5 || changes.length < 6 || remaining.length < 4) fail('inventory incomplete');

const model = {
  metadata: meta,
  features: features.map(row => ({ id: row.ID, area: row.Area, name: row.Feature,
    originalIntent: row['Original intent'], implementation: row['Current implementation'],
    status: row.Status, limitation: row['Current limitation'], remaining: row['Remaining work'],
    evidence: row.Evidence })),
  issues: issues.map(row => ({ id: row['Issue ID'], problem: row.Problem, cause: row['Root cause'],
    resolution: row['Resolution / current state'], lesson: row['Design lesson'], state: row.State,
    evidence: row.Evidence })),
  changes: changes.map(row => ({ date: row.Date, previous: row['Previous design'], current: row['New design'],
    reason: row.Reason, impact: row.Impact, evidence: row.Evidence })),
  remaining: remaining.map(row => ({ horizon: row.Horizon, work: row.Work, gate: row['Why / gate'],
    evidence: row.Evidence }))
};
const generated = `// Generated from docs/PROJECT-DESIGN.md; do not edit. SHA-256: ${digest}\n` +
  `window.PROJECT_DESIGN_SAMPLE = Object.freeze(${JSON.stringify(model, null, 2)});\n`;
if (process.argv.includes('--check')) {
  const existing = (await readFile(output, 'utf8')).replace(/\r\n/g, '\n');
  if (existing !== generated) fail('project-design-sample.js is stale; run the generator');
  console.log(`Project design sample matches docs/PROJECT-DESIGN.md (${features.length} features).`);
} else {
  await writeFile(output, generated, 'utf8');
  console.log(`Generated ${fileURLToPath(output)} from ${fileURLToPath(source)} (${features.length} features).`);
}
