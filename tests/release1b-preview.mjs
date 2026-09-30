// Explicit manual QA fixture server. Never bundled or used by the product.
import { createServer } from 'node:http';
import { serveStaticAsset } from './static-assets.mjs';
const instant = offset => new Date(Date.now() + offset).toISOString();
const names = ['InsiderTracker-Market', 'InsiderTracker-SyncImport', 'InsiderTracker-SEC', 'AIStockHunter-UnexplainedVolume-Daily', 'AIStockHunter-Accumulation-Weekly-Check'];
const jobs = names.map((name, index) => ({ id: `qa-${index}`, name, taskPath: '\\QA\\', enabled: true,
  status: ['READY', 'FAILED', 'RUNNING', 'UNKNOWN', 'READY'][index], lastRunStatus: ['SUCCESS', 'FAILED', 'SUCCESS', 'UNKNOWN', 'SUCCESS'][index],
  nextRunAt: instant((index + 1) * 3600000), lastRunAt: instant(-3600000), warnings: [], state: 'READY' }));
let revision = '0', overrides = {};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStaticAsset(request, response);
  let payload;
  if (url.pathname === '/api/jobs') payload = { collectionStatus: 'PARTIAL', collectedAt: instant(0), jobs, errors: ['QA FIXTURE · isolated development preview; not live Scheduler data'], unmatchedIncludes: [] };
  else if (url.pathname === '/api/history') payload = { from: url.searchParams.get('from'), to: url.searchParams.get('to'),
    jobs: jobs.slice(0, 2).map((job, index) => ({ id: job.id, taskName: job.name, taskPath: job.taskPath, enabled: true,
      runs: [{ id: index + 1, observedRunAt: instant(-3600000 - index * 1000), outcome: index ? 'FAILED' : 'SUCCESS', schedulerResult: index, durationMs: null, message: null }] })) };
  else if (url.pathname === '/api/runner/executions') payload = { status: 'OK', roots: { primary: 'QA_FIXTURE', fallback: 'QA_FIXTURE' }, warnings: ['QA fixture coverage; not formal receipts'],
    jobs: [{ schedulerTask: '\\QA\\InsiderTracker-Market', coverageState: 'MAPPED_NO_RECEIPT', profileId: 'qa-market', profileStatus: 'AVAILABLE', executions: [] }] };
  else if (url.pathname === '/api/settings/job-metadata') {
    if (request.method === 'PUT') {
      let text = ''; for await (const chunk of request) text += chunk;
      const body = JSON.parse(text);
      if (body.expectedRevision !== revision) { response.writeHead(409, { 'Content-Type': 'application/json' }); response.end('{"code":"REVISION_CONFLICT"}'); return; }
      overrides = body.overrides; revision = String(Number(revision) + 1);
    }
    payload = { version: 1, revision, overrides, warning: null };
  } else { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(payload));
});
server.listen(Number(process.argv[2] || 0), '127.0.0.1', () => console.log(`QA_FIXTURE http://127.0.0.1:${server.address().port}`));
