// Bounded stable-snapshot gate against the approved main, not a runtime change.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {parseProjectDesign,featureCounts} from '../ui/project-design.mjs';
const base='eba10039d19eb23157c7bd02925800712faef4a6';
const source=await readFile(new URL('../docs/PROJECT-DESIGN.md',import.meta.url),'utf8');
const previous=execFileSync('git',['show',`${base}:docs/PROJECT-DESIGN.md`],{encoding:'utf8'});
const model=parseProjectDesign(source),old=parseProjectDesign(previous);
const sandbox={window:{}};
vm.runInNewContext(await readFile(new URL('../design/prototype/project-design-sample.js',import.meta.url),'utf8'),sandbox);
assert.deepEqual(JSON.parse(JSON.stringify(model)),JSON.parse(JSON.stringify(sandbox.window.PROJECT_DESIGN_SAMPLE)));
assert.deepEqual(model.features.map(f=>({id:f.id,status:f.status})),old.features.map(f=>({id:f.id,status:f.status})));
assert.equal(model.features.length,33);
assert.deepEqual(featureCounts(model.features),featureCounts(old.features));
assert.deepEqual(model.metadata,old.metadata);
const section=(text,start,end)=>{const normalized=text.replace(/\r\n/g,'\n');return normalized.slice(normalized.indexOf(start),end?normalized.indexOf(end,normalized.indexOf(start)):undefined);};
for(const [start,end] of [['## Design Changes','## Major Development Issues & Lessons'],['## Change Log',null]])
  assert.equal(section(source,start,end),section(previous,start,end));
assert.deepEqual(model.changes,old.changes);
const runtimeDiff=execFileSync('git',['diff',base,'--','src','ui','index.html','dashboard.mjs','pom.xml','scripts'],{encoding:'utf8'});
assert.equal(runtimeDiff,'');
console.log('PASS full generated model, 33 ordered IDs/statuses/counts/metadata, historical sections and runtime source parity to approved main');
