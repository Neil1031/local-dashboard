// Deterministic, explicitly synthetic contract fixtures; no formal DB/report reads.
export function signalsFixture(url, state = 'READY') {
  const limit = Number(url.searchParams.get('limit') || 50), offset = Number(url.searchParams.get('offset') || 0);
  const ticker = url.searchParams.get('ticker');
  const records = Array.from({ length: 51 }, (_, i) => ({ signalId: `report:2026-09-30:QA${i}`, ticker: `QA${i}`,
    company: i ? `QA fixture ${i}` : 'QA 中文 <img src=x onerror=evil()> company', reportDate: '2026-09-30', eventDate: '2026-09-28', filingDate: null,
    discoveredAt: '2026-09-30T02:30:00Z', discoveryBasis: 'report_date_assumed_publication', recordedAt: '2026-09-30T03:00:00Z', updatedAt: '2026-09-30T03:00:00Z',
    scores: { signal: { value: 95, origin: 'imported_ai_report' }, investment: { value: null, origin: 'imported_ai_report' } },
    approximatePurchaseAmount: null, listedBuyerCount: 0, buyers: [], personName: null, personRole: null,
    positiveReasons: 'QA fixture <script>evil()</script> positive reasons', risks: 'QA fixture risk\nNo recommendation.',
    qualityFlags: ['ASSUMED_PUBLICATION_TIME', 'SCORE_BREAKDOWN_UNAVAILABLE'],
    provenance: [{ sourceType: 'git_report', table: 'report_revision', recordId: i + 1, documentId: '2026-09-30', contentHash: 'a'.repeat(64), firstObservedAt: '2026-09-30T03:00:00Z', lastObservedAt: '2026-09-30T03:00:00Z' }] }));
  const filtered = ticker ? records.filter(r => r.ticker === ticker) : records;
  const items = state === 'READY' ? filtered.slice(offset, offset + limit) : [];
  const actualState = state === 'READY' && !items.length ? 'EMPTY' : state;
  const hasMore = state === 'READY' && filtered.length > offset + limit;
  const observedAt = new Date().toISOString();
  return { contractVersion: 1, dataState: actualState, items, page: { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null }, observedAt,
    sources: [{ sourceId: 'insider-reports', sourceVersion: 1, sourceType: 'Imported AI report', lastObservedAt: ['READY', 'EMPTY'].includes(actualState) ? observedAt : null }],
    warnings: actualState === 'UNAVAILABLE' ? ['SOURCE_DISABLED'] : actualState === 'ERROR' ? ['SOURCE_INVALID_OUTPUT'] : ['QA FIXTURE · synthetic, not real source data'] };
}
