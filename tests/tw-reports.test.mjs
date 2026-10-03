import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exactTwReportId,readTwReports,readTwReportDetail} from '../ui/tw-reports.mjs';
import {twReportsFixture,twDetailFixture} from './tw-reports-fixture.mjs';
const url=type=>new URL(`http://fixture/api/reports/tw?type=${type}&limit=20&offset=0`);
for(const type of ['daily','weekly'])test(`${type} normalized bounded pages, exit-state truth and dedicated detail`,()=>{
  const u=url(type),query={type,limit:20,offset:0};for(const state of ['READY','PARTIAL','EMPTY','UNAVAILABLE','ERROR']){const p=twReportsFixture(u,state);assert.equal(readTwReports(p,query).dataState,state);}
  const list=twReportsFixture(u),id=list.items[0].reportId;assert.equal(exactTwReportId(id),type.toUpperCase());const d=twDetailFixture(new URL(`http://fixture/api/reports/tw/detail?reportId=${id}`));assert.equal(readTwReportDetail(d,id).dataState,'PARTIAL');
  assert.equal(type==='daily'?d.report.candidateCount:d.report.pendingRevalidationCount,type==='daily'?0:164);assert.equal(d.report.status,type==='daily'?'PARTIAL':'FAILED');
  for(const state of ['UNAVAILABLE','ERROR'])assert.equal(readTwReportDetail(twDetailFixture(new URL(`http://fixture/api/reports/tw/detail?reportId=${id}`),state),id).report,null);
});
test('reject invalid identities, cross-family pages, null/zero coercion and excessive facts',()=>{
  for(const id of ['tw-weekly:2026-09-24:'+'1'.repeat(32),'tw-daily:2026-02-29:'+'1'.repeat(32),'tw-daily:0000-01-01:'+'1'.repeat(32),'--help'])assert.throws(()=>exactTwReportId(id));
  for(const mutate of [p=>p.items[0].candidateCount='0',p=>p.reportType='WEEKLY',p=>p.page.total=21,p=>p.items.push(p.items[0]),p=>p.page.nextOffset=21]){const p=twReportsFixture(url('daily'));mutate(p);assert.throws(()=>readTwReports(p,{type:'daily',limit:20,offset:0}));}
  const id=twReportsFixture(url('daily')).items[0].reportId,u=new URL(`http://fixture/api/reports/tw/detail?reportId=${id}`);for(const mutate of [p=>p.report.facts.sources=Array(65).fill({}),p=>p.report.reportId=twReportsFixture(url('weekly')).items[0].reportId,p=>p.report.markdown='中'.repeat(65536),p=>p.dataState='EMPTY']){const p=twDetailFixture(u);mutate(p);assert.throws(()=>readTwReportDetail(p,id));}
});
