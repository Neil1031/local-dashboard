import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTwStocks,validTwDate} from '../ui/tw-stocks.mjs';
import {twFixture,warmingFixture} from './tw-stocks-fixture.mjs';
test('source-coherent may be business PARTIAL with independent weekly FAILED and null daily eligibility',()=>{
  const p=readTwStocks(twFixture());assert.equal(p.latestFinalized.status,'PARTIAL');assert.equal(p.weeklyCheck.status,'FAILED');assert.equal(p.observation.candidates[0].analysisEligible,null);assert.equal(p.observation.candidates[0].publicInfoCheck.status,'SUCCESS');assert.equal(p.observation.candidates[0].coverageStatus,'PARTIAL');
});
test('partial/warming zero does not lose newer failed attempt or UNKNOWN responsibility',()=>{const p=readTwStocks(warmingFixture());assert.equal(p.latestAttempt.status,'FAILED');assert.equal(p.latestFinalized.runId,'1'.repeat(32));assert.equal(p.observation.classificationStatus,'WARMING_UP');assert.equal(p.responsibility.pendingCount,null);});
test('valid exact-date latest unavailable and safe errors',()=>{for(const state of ['COHERENT','PARTIAL','UNAVAILABLE','ERROR'])assert.equal(readTwStocks(twFixture(null,state)).dataState,state);assert.equal(readTwStocks(twFixture('2026-09-25'),'2026-09-25').query.mode,'TARGET_DATE');});
test('canonical real date including source Python year bounds',()=>{for(const s of ['0000-01-01','2026-02-29','2026-04-31','2026-9-25','2026-09-25 ','','--help','10000-01-01'])assert.equal(validTwDate(s),false,s);for(const s of ['0001-01-01','9999-12-31','2024-02-29','2026-09-25'])assert.equal(validTwDate(s),true,s);});
test('version/type/query/identity/duplicate and promoted eligibility fail closed',()=>{
  for(const mutate of [p=>p.sourceContractVersion='v2',p=>p.query.targetDate='2026-09-25',p=>p.observation.identity.runId='2'.repeat(32),p=>p.latestFinalized.status='SUCCESS',p=>p.observation.candidates[0].analysisEligible=true,p=>p.observation.candidates[0].signalDate='2026-09-24',p=>p.observation.candidates.push(p.observation.candidates[0]),p=>p.warnings='bad']){const p=twFixture();mutate(p);assert.throws(()=>readTwStocks(p));}
});
