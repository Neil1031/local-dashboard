// Opt-in isolated candidate app-image QA, unrelated APIs fixture-routed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseProjectDesign, featureCounts } from '../ui/project-design.mjs';
const base = 'http://127.0.0.1:43871';
const bytes = await readFile(new URL('../docs/PROJECT-DESIGN.md', import.meta.url));
assert.deepEqual(Buffer.from(await (await fetch(base + '/project-design/PROJECT-DESIGN.md')).arrayBuffer()), bytes);
for (const file of ['index.html', 'dashboard.mjs', 'ui/projects.mjs', 'ui/project-design.mjs']) {
  const remote = Buffer.from(await (await fetch(base + '/' + (file === 'index.html' ? '' : file))).arrayBuffer());
  assert.deepEqual(remote, await readFile(new URL('../' + file, import.meta.url)));
}
const design = parseProjectDesign(bytes.toString('utf8'));
assert.equal(design.features.length, 33);
assert.deepEqual(featureCounts(design.features), {DONE:19,PARTIAL:1,BACKEND_READY:3,DATA_READY:0,DESIGNED:7,NOT_STARTED:2,IN_PROGRESS:0,BLOCKED:1,DEFERRED:0,DROPPED:0});
const browser = await createRequire(import.meta.url)('playwright').chromium.launch({channel:'msedge',headless:true});
try {
  for (const width of [1280,375,320]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**', route=>route.fulfill({contentType:'application/json',body:JSON.stringify(
      route.request().url().endsWith('/api/settings/job-metadata') ? {version:1,revision:'0',overrides:{},warning:null}
      : {collectionStatus:'NOT_CONFIGURED',status:'NOT_CONFIGURED',jobs:[],errors:[],warnings:[]})}));
    await page.goto(base);
    await page.locator('#projectsTab').click();
    await page.waitForFunction(()=>document.getElementById('projectsData').hidden===false);
    assert.equal(await page.locator('.project-feature').count(),33);
    assert.deepEqual(await page.locator('.project-feature').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.featureId,status:n.querySelector('.project-status').textContent}))),design.features.map(f=>({id:f.id,status:f.status})));
    for(const [status,count] of Object.entries(featureCounts(design.features)))
      assert.equal(await page.locator(`.project-count[data-status="${status}"] strong`).innerText(),String(count));
    assert.match(await page.locator('#projectsView').innerText(),/正式專案設計／本次建置快照/);
    await page.locator('.project-source-summary').click();
    const provenance=await page.locator('#projectSourceInfo').innerText();
    for(const value of [design.metadata.repository,design.metadata.baseline_commit,createHash('sha256').update(bytes).digest('hex'),'docs/PROJECT-DESIGN.md','歷史盤點 baseline（非本次實作 SHA）','本次讀取時間']) assert.ok(provenance.includes(value),value);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    if(width===1280){
      await page.locator('#projectsData').evaluate(el=>el.scrollIntoView({block:'start'}));
      const output=new URL('../docs/evidence/port43871-projects.png',import.meta.url);
      await mkdir(fileURLToPath(new URL('../docs/evidence/',import.meta.url)),{recursive:true});
      await page.screenshot({path:fileURLToPath(output),fullPage:false});
    }
    await page.close();
  }
  console.log('PASS real isolated candidate static bytes, DOM 33 IDs/statuses/counts/provenance, Projects 1280/375/320 and screenshot');
} finally { await browser.close(); }
