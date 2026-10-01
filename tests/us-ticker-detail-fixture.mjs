// Normalized synthetic fixtures only. Matching ticker never links source identities.
import { signalsFixture } from './us-signals-fixture.mjs';
import { secFixture } from './us-sec-transactions-fixture.mjs';
const table = {
  READY: { READY: 'READY', EMPTY: 'READY', UNAVAILABLE: 'PARTIAL', ERROR: 'PARTIAL' },
  EMPTY: { READY: 'READY', EMPTY: 'EMPTY', UNAVAILABLE: 'PARTIAL', ERROR: 'PARTIAL' },
  UNAVAILABLE: { READY: 'PARTIAL', EMPTY: 'PARTIAL', UNAVAILABLE: 'UNAVAILABLE', ERROR: 'ERROR' },
  ERROR: { READY: 'PARTIAL', EMPTY: 'PARTIAL', UNAVAILABLE: 'ERROR', ERROR: 'ERROR' }
};
export function tickerFixture(url, signalsState = 'READY', secState = 'READY') {
  const ticker = url.searchParams.get('ticker'), all = new URL('http://fixture/?limit=100');
  function section(fixture, key, state, observedAt) {
    const limit = Number(url.searchParams.get(`${key}Limit`) || 50), offset = Number(url.searchParams.get(`${key}Offset`) || 0);
    const data = fixture(all); const records = data.items.map(item => ({ ...item, ticker }));
    data.items = state === 'READY' ? records.slice(offset, offset + limit) : [];
    data.dataState = state === 'READY' && !data.items.length ? 'EMPTY' : state;
    const hasMore = state === 'READY' && records.length > offset + limit;
    data.page = { limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null };
    data.observedAt = observedAt; data.sources[0].lastObservedAt = ['READY', 'EMPTY'].includes(data.dataState) ? observedAt : null;
    data.warnings = ['QA FIXTURE · synthetic normalized source', ...(key === 'sec' ? ['SEC_PARTIAL_NOT_RECONCILED_OR_CERTIFIED'] : [])];
    return data;
  }
  const signals = section(signalsFixture, 'signals', signalsState, '2026-10-01T01:00:00Z');
  const secTransactions = section(secFixture, 'sec', secState, '2026-10-01T01:00:05Z');
  return { contractVersion: 1, ticker, observedAt: '2026-10-01T01:00:06Z', dataState: table[signals.dataState][secTransactions.dataState],
    sections: { signals, secTransactions }, warnings: ['SAME_TICKER_IS_NOT_EVENT_LINKAGE', 'PAGES_ARE_NOT_COMPLETE_POPULATION', 'NOT_PIT_SNAPSHOT'] };
}
