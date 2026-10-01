// Synthetic Reports v1 only; never accesses formal data or installed runtime.
export const reportBody = '# 中文 🚀 report\n\n<script>globalThis.reportPwned=true</script>\n<img src=x onerror=evil()>\n[link](javascript:alert(1))\nC:\\source-authored\\literal.txt\n\n- first retained body\n- second entry\n\n1. first\n2. second\n\n```text\n<script>literal code</script>\n' + 'long-code-'.repeat(100) + '\n```\n\nInline `code` is text.\n';
const observedAt = '2026-10-01T01:00:00Z';
export const reportRecords = Array.from({length:21}, (_, i) => {
  const reportDate = new Date(Date.UTC(2026,8,30-i)).toISOString().slice(0,10);
  return {reportId:`report:${reportDate}`,reportDate,importedAt:observedAt,contentHash:'body-A',parseWarnings:['QA warning 中文 🚀'],storedSignalCount:3,activeSignalCount:2,revisionCount:21,createdAt:null,updatedAt:observedAt};
});
const envelope = state => ({contractVersion:1,dataState:state,observedAt,sources:[{sourceId:'insider-report-documents',sourceVersion:1,sourceType:'US Insider / AI report',lastObservedAt:['READY','EMPTY'].includes(state)?observedAt:null}],warnings:['QA FIXTURE · synthetic','COUNTS_ARE_CURRENT_RETAINED_ROWS','REVISIONS_ARE_BODY_HASH_HISTORY','NOT_PIT_SNAPSHOT','NO_SEMANTIC_DIFF']});
const paging = (limit,offset,total) => ({limit,offset,hasMore:offset+limit<total,nextOffset:offset+limit<total?offset+limit:null});
export function reportsFixture(url,state='READY') {
  const limit=Number(url.searchParams.get('limit')||20),offset=Number(url.searchParams.get('offset')||0),date=url.searchParams.get('date');
  const rows=state==='READY'?reportRecords.filter(r=>!date||r.reportDate===date):[],items=rows.slice(offset,offset+limit);
  return {...envelope(state==='READY'&&!items.length?'EMPTY':state),items:structuredClone(items),page:paging(limit,offset,rows.length)};
}
export function reportDetailFixture(url,state='READY',missing=false) {
  const limit=Number(url.searchParams.get('revisionLimit')||20),offset=Number(url.searchParams.get('revisionOffset')||0),date=url.searchParams.get('reportDate');
  const record=reportRecords.find(r=>r.reportDate===date),actual=state==='READY'&&!record?'EMPTY':state;
  const revisions=Array.from({length:21},(_,i)=>({revisionId:21-i,contentHash:i===20?'body-A':`body-${21-i}`,importedAt:observedAt,isCurrent:!missing&&i===20}));
  return {...envelope(actual),item:actual==='READY'?{...structuredClone(record),contentHash:missing?'unmatched-body':record.contentHash,rawMarkdown:reportBody,currentRevisionId:missing?null:1,currentRevisionStatus:missing?'MISSING':'MATCHED',revisions:revisions.slice(offset,offset+limit)}:null,revisionPage:paging(limit,offset,actual==='READY'?21:0)};
}
