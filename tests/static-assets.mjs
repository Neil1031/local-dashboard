// Explicit resource routes for fixture servers; mirror Maven's whitelist.
import { readFile } from 'node:fs/promises';
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/dashboard.mjs', ['dashboard.mjs', 'text/javascript']],
  ['/ui/shell.mjs', ['ui/shell.mjs', 'text/javascript']],
  ['/ui/overview.mjs', ['ui/overview.mjs', 'text/javascript']],
  ['/ui/us-signals.mjs', ['ui/us-signals.mjs', 'text/javascript']],
  ['/ui/us-stocks.mjs', ['ui/us-stocks.mjs', 'text/javascript']],
  ['/ui/us-sec-transactions.mjs', ['ui/us-sec-transactions.mjs', 'text/javascript']],
  ['/ui/us-ticker-detail.mjs', ['ui/us-ticker-detail.mjs', 'text/javascript']],
  ['/ui/reports.mjs', ['ui/reports.mjs', 'text/javascript']],
  ['/ui/tw-stocks.mjs', ['ui/tw-stocks.mjs', 'text/javascript']],
  ['/ui/safe-markdown.mjs', ['ui/safe-markdown.mjs', 'text/javascript']],
  ['/ui/projects.mjs', ['ui/projects.mjs', 'text/javascript']],
  ['/ui/project-design.mjs', ['ui/project-design.mjs', 'text/javascript']],
  ['/project-design/PROJECT-DESIGN.md', ['docs/PROJECT-DESIGN.md', 'text/markdown; charset=utf-8']]
]);
export async function serveStaticAsset(request, response) {
  const asset = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', asset[1]);
  response.end(await readFile(new URL(`../${asset[0]}`, import.meta.url)));
}
