export const SEMANTICS = Object.freeze({
  purpose: 'OBSERVATION_RESEARCH_EVIDENCE',
  priceBasis: 'CURRENT_SAVED_OFFICIAL_UNADJUSTED_CLOSE',
  formula: '(horizonClose / referenceClose - 1) * 100',
  dueClock: 'CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI',
  priceFinalityClock: 'CONSERVATIVE_CLOSE_FINALITY_13_33_TAIPEI',
  crossPageSnapshot: false,
  historicalPIT: false,
  interpretationLimits: Object.freeze([
    'referenceClose is not execution price',
    'observed return is not realized P&L',
    'positive return is not BUY success',
    'negative return is not SELL signal',
    'source anomaly score is not investment score',
    'null is not zero',
    'missing price is not 0% return',
    'NOT_YET_DUE is not failure',
    'PRICE_UNAVAILABLE is not flat return',
    'unadjusted closes do not adjust corporate actions or dividends',
    'normal regular trading ends at 13:30 Taipei',
    'closing may be postponed, so this contract waits until 13:33 Taipei',
    'the conservative availability gate is not finality proof for every extraordinary market condition'
  ])
});

export const REASONS = Object.freeze([
  'CALENDAR_COVERAGE_INSUFFICIENT',
  'CALENDAR_DATE_MISSING',
  'CALENDAR_ALIAS_CONFLICT',
  'CALENDAR_RECORD_INVALID',
  'REFERENCE_NOT_TRADING_SESSION',
  'SESSION_NOT_YET_DUE',
  'OFFICIAL_PRICE_MISSING',
  'PRICE_IDENTITY_AMBIGUOUS',
  'PRICE_VALUE_INVALID',
  'PRICE_TIMESTAMP_INVALID',
  'OFFICIAL_PRICE_LINEAGE_MISMATCH',
  'HISTORICAL_MARKET_UNVERIFIED',
  'PRICE_RECEIPT_BUDGET_EXCEEDED',
  'OFFICIAL_PRICE_RECEIPT_UNAVAILABLE',
  'OFFICIAL_CLOSE_OBSERVED',
  'OFFICIAL_PRICE_PROVENANCE_UNAVAILABLE',
  'REFERENCE_CLOSE_UNAVAILABLE',
  'RETURN_VALUE_INVALID'
]);

export const WARNINGS = Object.freeze([
  'INPUT_INVALID',
  'RANGE_TOO_LARGE',
  'RESULT_TIMESTAMP_INVALID',
  'RESULT_BEFORE_SOURCE_SCOPE',
  'SOURCE_SIZE_LIMIT',
  'RESULT_PAYLOAD_BUDGET_EXCEEDED',
  'RESULT_IDENTITY_MISMATCH',
  'SAVED_CANDIDATES_UNAVAILABLE',
  'OBSERVATION_READ_BUDGET_EXCEEDED',
  'LINEAGE_PAYLOAD_BUDGET_EXCEEDED',
  'RANGE_START_BEFORE_SOURCE_SCOPE',
  'OBSERVATION_PRICE_EVIDENCE_INCOMPLETE',
  'PAGINATION_OFFSET_LIMIT',
  'SCOPE_UNAVAILABLE',
  'SOURCE_HEADERS_UNAVAILABLE',
  'SOURCE_HEADERS_INVALID',
  'SOURCE_HEADERS_MISMATCH',
  'DATABASE_MISSING',
  'DATABASE_UNAVAILABLE',
  'SQLITE_SIDECAR_UNSUPPORTED',
  'SQLITE_HEADER_INVALID',
  'SQLITE_WAL_UNSUPPORTED',
  'DATABASE_CHANGED_DURING_READ',
  'SOURCE_UNAVAILABLE',
  'SOURCE_INVALID',
  'STDOUT_SIZE_LIMIT'
]);

const GENERATED_AT = '2026-11-01T07:00:00Z';
const OBSERVED_AT = '2026-11-01T07:00:01Z';
const DEFAULT_QUERY = Object.freeze({
  operation: 'LIST',
  requestedStartDate: '2026-10-01',
  requestedEndDate: '2026-10-31',
  limit: 20,
  offset: 0
});
const HORIZON_DATES = Object.freeze([
  '2026-10-05',
  '2026-10-07',
  '2026-10-09',
  '2026-10-16',
  '2026-10-30'
]);

function merge(base, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return structuredClone(base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
      ? merge(result[key], value)
      : structuredClone(value);
  }
  return result;
}

function provenance(runId) {
  return {
    authority: 'daily_price',
    officialSource: 'TWSE_TPEX_OFFICIAL:market-data',
    priceObservedAt: '2026-10-05T05:33:00Z',
    marketObservedAt: '2026-10-05T05:33:00Z',
    priceRefreshedAt: '2026-10-05T05:34:00Z',
    sourceStartedAt: '2026-10-05T05:30:00Z',
    sourceFinishedAt: '2026-10-05T05:33:00Z',
    priceSourceRunId: runId,
    sourceStatus: 'SUCCESS'
  };
}

export function twPerformanceItem(overrides = {}) {
  const runId = 'a'.repeat(32);
  const item = {
    itemId: `tw-candidate:2026-10-02:${runId}:2330`,
    targetDate: '2026-10-02',
    runId,
    symbol: '2330',
    market: 'TWSE',
    observationFinishedAt: '2026-10-02T10:00:00Z',
    savedStatus: 'SUCCESS',
    referenceClose: 100,
    referenceState: 'OBSERVED',
    referenceReasonCode: 'OFFICIAL_CLOSE_OBSERVED',
    referenceProvenance: provenance(runId),
    calendarMarketsUsed: ['TWSE'],
    horizons: [1, 3, 5, 10, 20].map((sessionCount, index) => ({
      sessionCount,
      expectedDate: HORIZON_DATES[index],
      close: 100,
      returnPercent: 0,
      state: 'OBSERVED',
      reasonCode: 'OFFICIAL_CLOSE_OBSERVED',
      dueAt: `${HORIZON_DATES[index]}T13:33:00+08:00`,
      provenance: provenance(runId)
    }))
  };
  const result = merge(item, overrides);
  const identityOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  if (!Object.hasOwn(identityOverrides, 'itemId') && ['targetDate', 'runId', 'symbol'].some(key => Object.hasOwn(identityOverrides, key))) {
    result.itemId = `tw-candidate:${result.targetDate}:${result.runId}:${result.symbol}`;
  }
  return result;
}

export function twPerformanceSource(state = 'READY', overrides = {}) {
  const query = structuredClone(DEFAULT_QUERY);
  const base = {
    contractVersion: 'tw-observed-performance-v1',
    source: 'TAIWAN_VOLUME_WATCH',
    generatedAt: GENERATED_AT,
    dataState: state,
    query,
    scope: {state: 'AVAILABLE', mode: 'DAILY_ACCUMULATION', startDate: '2026-09-01'},
    items: ['UNAVAILABLE', 'ERROR', 'EMPTY'].includes(state) ? [] : [twPerformanceItem()],
    page: ['UNAVAILABLE', 'ERROR'].includes(state) ? null : {
      limit: query.limit,
      offset: query.offset,
      returned: state === 'EMPTY' ? 0 : 1,
      hasMore: false,
      nextOffset: null,
      total: null
    },
    semantics: structuredClone(SEMANTICS),
    warnings: state === 'PARTIAL'
      ? ['OBSERVATION_PRICE_EVIDENCE_INCOMPLETE']
      : state === 'UNAVAILABLE'
        ? ['SOURCE_UNAVAILABLE']
        : state === 'ERROR'
          ? ['SOURCE_INVALID']
          : []
  };
  return merge(base, overrides);
}

export function twPerformanceFixture(state = 'READY', overrides = {}) {
  const raw = twPerformanceSource(state, overrides);
  return {
    contractVersion: 1,
    sourceContractVersion: raw.contractVersion,
    source: 'taiwan-performance',
    observedAt: OBSERVED_AT,
    generatedAt: raw.generatedAt,
    provenance: 'CURRENT_SAVED_OFFICIAL_CLOSE_RESEARCH_EVIDENCE',
    dataState: raw.dataState,
    query: structuredClone(raw.query),
    scope: structuredClone(raw.scope),
    items: structuredClone(raw.items),
    page: structuredClone(raw.page),
    semantics: structuredClone(raw.semantics),
    warnings: structuredClone(raw.warnings)
  };
}
