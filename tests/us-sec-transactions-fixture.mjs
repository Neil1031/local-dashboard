// Synthetic current-state transactions; never read or write a formal source DB.
export function secFixture(url, state = 'READY') {
  const limit = Number(url.searchParams.get('limit') || 50), offset = Number(url.searchParams.get('offset') || 0), ticker = url.searchParams.get('ticker');
  const records = Array.from({ length: 51 }, (_, i) => ({ signalId: `sec:QA-accession-${i}:0`, transactionIndex: 0, ticker: `QA${i}`,
    company: i ? `QA fixture issuer ${i}` : 'QA 中文 <img src=x onerror=evil()> issuer', eventDate: '2026-09-28', filingDate: '2026-09-29', filingAcceptedAt: '2026-09-29T18:00:00Z',
    discoveredAt: '2026-09-30T01:00:00Z', discoveryBasis: 'first_local_ingestion', recordedAt: '2026-09-30T01:00:00Z', updatedAt: '2026-09-30T02:00:00Z',
    reportingOwners: [{ name: 'QA <script>evil()</script> owner', cik: '001234', roles: ['director'] }, { name: null, cik: null, roles: [] }],
    transactionCode: ['P', 'S', 'M'][i % 3], securityType: i % 3 === 2 ? 'derivative' : 'non_derivative', securityTitle: 'QA security', acquiredDisposed: i % 3 === 1 ? 'D' : 'A',
    shares: i % 3 === 1 ? 0 : 100, insiderExecutionPrice: i % 3 === 2 ? null : 12.5, transactionAmount: i % 3 === 2 ? null : 1250, ownershipAfter: 1000, ownershipIncreasePct: null,
    isDirect: i % 3 === 2 ? null : false, is10b51: i % 3 === 0 ? null : false, candidateOpenMarketPurchase: i % 3 === 0, reviewRequired: true,
    footnotes: [{ id: 'F1', text: 'QA <script>evil()</script>\nSource uncertainty remains.' }], filingDateSource: 'sec_submission_header', filingDateMetadataUpdatedAt: '2026-09-30T02:00:00Z',
    qualityFlags: ['UNSCORED_SOURCE', ...(i % 3 === 2 ? ['DERIVATIVE_SECURITY', 'AMENDMENT_REQUIRES_RECONCILIATION'] : i % 3 === 0 ? ['CANDIDATE_NOT_CERTIFIED_OPEN_MARKET'] : [])],
    provenance: [{ sourceType: 'sec_filing', table: 'filing_raw', recordId: i + 1, documentId: `QA-accession-${i}`, contentHash: 'a'.repeat(64), firstObservedAt: '2026-09-30T01:00:00Z', lastObservedAt: '2026-09-30T02:00:00Z' }] }));
  const filtered = ticker ? records.filter(r => r.ticker === ticker) : records, items = state === 'READY' ? filtered.slice(offset, offset + limit) : [];
  const actualState = state === 'READY' && !items.length ? 'EMPTY' : state, hasMore = state === 'READY' && filtered.length > offset + limit, observedAt = new Date().toISOString();
  return { contractVersion: 1, dataState: actualState, items, page: { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null }, observedAt,
    sources: [{ sourceId: 'insider-sec', sourceVersion: 1, sourceType: 'SEC Transactions · partial', lastObservedAt: ['READY', 'EMPTY'].includes(actualState) ? observedAt : null }],
    warnings: ['QA FIXTURE · synthetic', 'SEC_PARTIAL_NOT_RECONCILED_OR_CERTIFIED', ...(actualState === 'UNAVAILABLE' ? ['SOURCE_DISABLED'] : actualState === 'ERROR' ? ['SOURCE_INVALID_OUTPUT'] : [])] };
}
