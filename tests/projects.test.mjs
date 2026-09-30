import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseProjectDesign, featureCounts, MAX_DESIGN_BYTES } from '../ui/project-design.mjs';
import { loadProjectDesign, PROJECT_SOURCE } from '../ui/projects.mjs';
const source = await readFile(new URL('../docs/PROJECT-DESIGN.md', import.meta.url), 'utf8');
const baseline = execFileSync('git', ['show', 'f1dac729c72db5e636a762b9f5f505b91074537e:docs/PROJECT-DESIGN.md'], { encoding: 'utf8' });
const valid = text => async () => new Response(text, { headers: { 'content-type': 'text/markdown' } });
const errorCode = code => error => error.code === code && error.message === code;
test('all 33 baseline IDs remain; only product-projects may become PARTIAL; counts derive from rows', () => {
  const old = parseProjectDesign(baseline).features, current = parseProjectDesign(source).features;
  assert.equal(current.length, 33);
  assert.deepEqual(current.map(f => f.id), old.map(f => f.id));
  for (let i = 0; i < current.length; i++) {
    if (current[i].id !== 'product-projects') assert.equal(current[i].status, old[i].status);
    else assert.ok(['DESIGNED', 'PARTIAL'].includes(current[i].status));
    for (const field of ['name', 'originalIntent', 'implementation', 'limitation', 'remaining', 'evidence']) assert.ok(current[i][field]);
  }
  assert.equal(Object.values(featureCounts(current)).reduce((a, b) => a + b, 0), 33);
  assert.equal(featureCounts(current).DONE, 19);
  assert.deepEqual(parseProjectDesign(source.replace(/\r\n/g, '\n')), parseProjectDesign(source));
});
test('v1 rejects malformed metadata, duplicate IDs, missing/unknown status and broken tables', () => {
  for (const [index, change] of [
    text => text.replace('project_name: Local Dashboard', 'project_name:'),
    text => text.replace('design_version: 1', 'design_version: 1x'),
    text => text.replace('project_id: local-dashboard', 'project_id: local-dashboard\nproject_id: duplicate'),
    text => text.replace('| desktop-browser |', '| desktop-launcher |'),
    text => text.replace('| DONE |', '| UNKNOWN_STATUS |'),
    text => text.replace('| DONE |', '|  |'),
    text => text.replace('| ID | Area |', '| Identity | Area |'),
    text => text.replace('| --- | --- | --- | --- | --- | --- | --- | --- | --- |', '| --- |'),
    text => text.replace('## Feature Matrix', '## Missing Matrix'),
    text => text.replace('last_reviewed_at: 2026-09-28', 'last_reviewed_at: 2026-02-30'),
    text => text.replace('| desktop-launcher |', '| desktop-launcher'),
    text => text.replace('## Feature Matrix', '## Feature Matrix\n## Feature Matrix')
  ].entries()) assert.throws(() => parseProjectDesign(change(source)), errorCode('INVALID_FORMAT'), 'mutation ' + index);
  assert.throws(() => parseProjectDesign(source.replace('design_version: 1', 'design_version: 2')), errorCode('UNSUPPORTED_VERSION'));
  assert.throws(() => parseProjectDesign('a'.repeat(MAX_DESIGN_BYTES + 1)), errorCode('TOO_LARGE'));
});
test('loader fixes source URL, denies redirects/external mode, and hashes exact received bytes', async () => {
  const result = await loadProjectDesign(async (url, options) => {
    assert.equal(url, PROJECT_SOURCE); assert.equal(options.mode, 'same-origin');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    return new Response(source);
  });
  assert.equal(result.digest, createHash('sha256').update(source).digest('hex'));
  assert.equal(result.model.features.length, 33);
  assert.ok(Number.isFinite(Date.parse(result.readAt)));
});
test('missing, HTTP/network, HTML, wrong-project, encoding, size and timeout fail with safe codes', async () => {
  await assert.rejects(loadProjectDesign(async () => new Response('private details', { status: 404 })), errorCode('MISSING'));
  await assert.rejects(loadProjectDesign(async () => new Response('private details', { status: 503 })), errorCode('UNAVAILABLE'));
  await assert.rejects(loadProjectDesign(async () => { throw new Error('C:/private.db'); }), errorCode('UNAVAILABLE'));
  await assert.rejects(loadProjectDesign(async () => new Response('<h1>secret</h1>', { headers: { 'content-type': 'text/html' } })), errorCode('INVALID_FORMAT'));
  await assert.rejects(loadProjectDesign(valid(source.replace('project_id: local-dashboard', 'project_id: another-project'))), errorCode('INVALID_FORMAT'));
  await assert.rejects(loadProjectDesign(async () => new Response(new Uint8Array([255, 255]))), errorCode('INVALID_FORMAT'));
  await assert.rejects(loadProjectDesign(valid('x'.repeat(MAX_DESIGN_BYTES + 1))), errorCode('TOO_LARGE'));
  await assert.rejects(loadProjectDesign(async () => new Response(source, { headers: { 'content-length': String(MAX_DESIGN_BYTES + 1) } })), errorCode('TOO_LARGE'));
  let aborted = false;
  await assert.rejects(loadProjectDesign(async (_, options) => { options.signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); }, { timeoutMs: 20 }), errorCode('UNAVAILABLE'));
  assert.equal(aborted, true);
});
