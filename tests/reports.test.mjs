import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exactReportDate,readReports,readReportDetail} from '../ui/reports.mjs';
import {reportsFixture,reportDetailFixture,reportBody} from './reports-fixture.mjs';
const listUrl = query => new URL(`http://fixture/?${new URLSearchParams(query)}`);
const listQuery={limit:20,offset:0},detailQuery={reportDate:'2026-09-30',revisionLimit:20,revisionOffset:0};
test('canonical dates only including calendar/leap/year bounds',()=>{
  for(const date of ['0001-01-01','2024-02-29','9999-12-31'])assert.equal(exactReportDate(date,true),date);
  assert.equal(exactReportDate(''),null);
  for(const date of [undefined,'','0000-01-01','2026-02-29','2026-09-31',' 2026-09-30','2026-9-30','２０２６-09-30'])assert.throws(()=>exactReportDate(date,true));
});
test('list first/final/empty/exact-date pages and state envelopes',()=>{
  for(const offset of [0,20,40]) {const q={...listQuery,offset};const d=readReports(reportsFixture(listUrl(q)),q);assert.equal(d.items.length,offset===0?20:offset===20?1:0);}
  for(const state of ['EMPTY','UNAVAILABLE','ERROR'])assert.equal(readReports(reportsFixture(listUrl(listQuery),state),listQuery).items.length,0);
  const q={...listQuery,date:'2026-09-30'};assert.equal(readReports(reportsFixture(listUrl(q)),q).items.length,1);
});
test('full source body, independent revision pages, current outside page and MISSING',()=>{
  const first=readReportDetail(reportDetailFixture(listUrl(detailQuery)),detailQuery);assert.equal(first.item.rawMarkdown,reportBody);assert.equal(first.item.currentRevisionId,1);assert.ok(first.item.revisions.every(r=>!r.isCurrent));
  for(const revisionOffset of [20,40]) {const q={...detailQuery,revisionOffset},d=readReportDetail(reportDetailFixture(listUrl(q)),q);assert.equal(d.dataState,'READY');assert.equal(d.item.revisions.length,revisionOffset===20?1:0);}
  assert.equal(readReportDetail(reportDetailFixture(listUrl(detailQuery),'READY',true),detailQuery).item.currentRevisionId,null);
  for(const state of ['EMPTY','UNAVAILABLE','ERROR'])assert.equal(readReportDetail(reportDetailFixture(listUrl(detailQuery),state),detailQuery).item,null);
});
test('malformed contract, identity, counts, warnings and paging rejected',()=>{
  for(const mutate of [d=>d.contractVersion=2,d=>d.sources[0].sourceVersion=2,d=>d.items[0].reportId='bad',d=>d.items[0].parseWarnings=[{}],d=>d.items[0].activeSignalCount=4,d=>d.items[0].revisionCount=Number.MAX_SAFE_INTEGER+1,d=>d.page.nextOffset=21,d=>d.items.push(d.items[0]),d=>d.observedAt='invalid']) {const d=reportsFixture(listUrl(listQuery));mutate(d);assert.throws(()=>readReports(d,listQuery));}
});
test('malformed revision/current/body fields rejected',()=>{
  for(const mutate of [d=>d.item.currentRevisionStatus='UNKNOWN',d=>d.item.currentRevisionId=null,d=>d.item.rawMarkdown={},d=>d.item.revisions[0].isCurrent=true,d=>d.item.revisions[1].revisionId=d.item.revisions[0].revisionId,d=>d.item.revisionCount=1,d=>d.revisionPage.offset=1]){const d=reportDetailFixture(listUrl(detailQuery));mutate(d);assert.throws(()=>readReportDetail(d,detailQuery));}
});
